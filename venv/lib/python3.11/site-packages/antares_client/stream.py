import abc
import itertools
import logging
import os
import re
import socket
import subprocess
import time
import zlib
from typing import Iterator, List, Optional, Tuple
from urllib.parse import urljoin

import bson
import confluent_kafka
import pkg_resources
from confluent_kafka.cimpl import (  # pylint: disable=no-name-in-module
    KafkaError,
    KafkaException,
)

from ._api.api import _get_resource
from ._api.schemas import _ClientConfigStreamingSchema, _LocusSchema
from .config import config
from .exceptions import AntaresException
from .models import Locus

log = logging.getLogger(__name__)

Topic = str


class AntaresNetworkingException(AntaresException):
    pass


class AntaresAlertParseException(AntaresException):
    pass


class AbstractStreamingClient(abc.ABC):
    @abc.abstractmethod
    def poll(
        self, timeout: Optional[float] = None
    ) -> Tuple[Tuple[None, None], Tuple[Topic, Locus]]:
        """
        Retrieve a single alert. This method blocks until ``timeout`` seconds have
        elapsed (by default, an infinite amount of time).

        Parameters
        ----------
        timeout: int
            Number of seconds to block waiting for an alert. If None, block indefinitely
            (default, None).

        Returns
        ----------
        (topic, locus): (str, Locus)
            Or ``(None, None)`` if ``timeout`` seconds elapse with no response
        """
        raise NotImplementedError

    def iter(self, limit: Optional[int] = None) -> Iterator[Tuple[Topic, Locus]]:
        """
        Yield from ANTARES alert streams.

        Parameters
        -----------
        limit: int
            Maximum number of messages to yield. If None, yield
            indefinitely (default, None).

        Yields
        ----------
        (topic, locus): str, Locus

        """
        for i in itertools.count(start=1, step=1):
            yield self.poll()
            if limit and i >= limit:
                return

    @abc.abstractmethod
    def commit(self):
        raise NotImplementedError

    @abc.abstractmethod
    def close(self):
        raise NotImplementedError

    @abc.abstractmethod
    def __enter__(self):
        raise NotImplementedError

    @abc.abstractmethod
    def __exit__(self, exc_type, exc_val, exc_tb):
        raise NotImplementedError


class KafkaStreamingClient(AbstractStreamingClient):
    _POLLING_FREQUENCY: float = 1.0
    _TOPIC_PREFIX = "client."
    _DEFAULT_SSL_CA_LOCATION: str = pkg_resources.resource_filename(
        __name__, os.path.join("certificates", "kafka-ca.pem")
    )

    def fetch_config(self):
        return _get_resource(
            urljoin(config["ANTARES_API_BASE_URL"], "client/config/streaming/default"),
            _ClientConfigStreamingSchema,
        )

    def __init__(self, topics: List[str], api_key: str, api_secret: str, **kwargs):
        """
        Creates a new ``KafkaStreamingClient`` instance.

        Parameters
        ----------
        topics: list of str
            Kafka stream topics to subscribe to.
        api_key: str
            API Key
        api_secret: str
            API Secret
        group: str, optional
            Group to connect to Kafka stream with. Changing this will reset
            your partition offsets. If you don't know what that means, DON'T
            pass any arguments for this (default, socket.gethostname()).
        ssl_ca_location: str, optional
            Path to your root SSL CAs cert.pem file.
        enable_auto_commit: bool, optional
            Enable automatic commits to the client's underlying Kafka streams
            (default, True).
        """
        self._topics = topics
        default_config = self.fetch_config()["options"]
        kafka_config = {
            "group.id": kwargs.get("group", socket.gethostname()),
            "logger": log,
            "default.topic.config": {"auto.offset.reset": "smallest"},
            "api.version.request": True,
            "broker.version.fallback": "0.10.0.0",
            "api.version.fallback.ms": 0,
            "enable.auto.commit": kwargs.get("enable_auto_commit", True),
            "sasl.username": api_key,
            "sasl.password": api_secret,
            "ssl.ca.location": kwargs.get("ssl_ca_location")
            or self._DEFAULT_SSL_CA_LOCATION,
            **default_config,
        }
        self._consumer = confluent_kafka.Consumer(kafka_config)
        self._consumer.subscribe(
            [f"{self._TOPIC_PREFIX}{topic}" for topic in self.topics]
        )

    def _timed_poll(self, timeout: float) -> Tuple[Optional[str], Optional[Locus]]:
        start_time = time.perf_counter()
        while (time.perf_counter() - start_time) < timeout:
            try:
                message = self._consumer.poll(timeout=self._POLLING_FREQUENCY)
                if message is not None:
                    locus = _parse_message(message)
                    return message.topic(), locus
            except KafkaException as kafka_exception:
                kafka_error = kafka_exception.args[0]
                # pylint: disable=protected-access
                if kafka_error == KafkaError._PARTITION_EOF:
                    pass
                # pylint: disable=protected-access
                elif kafka_error == KafkaError._TIMED_OUT:
                    exception_fmt = "There was an error connecting to ANTARES: {}"
                    raise AntaresNetworkingException(
                        exception_fmt.format(repr(kafka_exception))
                    ) from kafka_exception
                else:
                    exception_fmt = "There was an error consuming from ANTARES: {}"
                    raise AntaresException(
                        exception_fmt.format(repr(kafka_exception))
                    ) from kafka_exception
        return None, None

    def poll(self, timeout: float = None) -> Tuple[Optional[str], Optional[Locus]]:
        """
        Retrieve a single alert. This method blocks until ``timeout``
        seconds have elapsed (by default, an infinite amount of time).

        Parameters
        ----------
        timeout: int
            Number of seconds to block waiting for an alert. If None,
            block indefinitely (default, None).

        Returns
        ----------
        (topic, locus): (str, Locus)
            Or ``(None, None)`` if ``timeout`` seconds elapse with no response

        """
        if timeout:
            return self._timed_poll(timeout)
        locus = None
        while locus is None:
            topic, locus = self._timed_poll(self._POLLING_FREQUENCY)
        return topic, locus

    def commit(self):
        """Commit to the underlying Kafka stream."""
        self._consumer.commit()

    def close(self):
        """Close the client's connection."""
        self._consumer.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, exc_traceback):
        self._consumer.close()

    @property
    def topics(self):
        return self._topics


def _call(cmd):
    process = subprocess.Popen(
        cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    stdout, stderr = process.communicate()
    return_code = process.returncode
    return return_code, stdout, stderr


def _merge_dictionaries(*dictionaries):
    merged_dictionary = {}
    for dictionary in dictionaries:
        merged_dictionary.update(
            {key: val for key, val in dictionary.items() if val is not None}
        )
    return merged_dictionary


def _locate_ssl_certs_file():
    """
    Attempt to locate openssl's CA certs file. Attempts to search
    a list of known locations first. Failing that, calls ``openssl``
    and tries to parse the output for file location.

    Raises
    ----------
    FileNotFoundError
      If no SSL certs file can be located.

    """
    # Check known locations first
    known_locations = [
        "/opt/local/etc/openssl/cert.pem",
        "/usr/local/etc/openssl/cert.pem",
        "/etc/pki/tls/cert.pem",
        "/etc/ssl/certs/ca-certificates.crt",
    ]
    log.info("Looking for openssl certs file in known locations.")
    for path in known_locations:
        log.debug("Checking location {}".format(path))
        if os.path.exists(path):
            log.info("Found certs at {}".format(path))
            return path
    # Failing that, try calling openssl directly
    log.info("Didn't find certs file in known locations.")
    log.info("Attempting to locate certs using `openssl version -d`")
    return_code, stdout, _ = _call("openssl version -d")
    if return_code != 0:
        log.info("openssl returned error code {}".format(return_code))
        log.error("Failed to locate openssl certs file.")
    else:
        regex = re.compile(r"OPENSSLDIR: \"(?P<path>.*)\"")
        log.debug("openssl stdout:")
        log.debug(stdout.decode())
        match = re.search(regex, stdout.decode())
        if match:
            path = os.path.join(match.group("path"), "cert.pem")
            if os.path.exists(path):
                log.info("Found certs at {}".format(path))
                return path
    # Failing that, raise an error
    raise FileNotFoundError("Could not locate SSL certificate")


def _parse_message(message):
    if message.error():
        raise KafkaException(message.error().code())
    locus = _LocusSchema(partial=True).load(
        bson.loads(zlib.decompress(message.value()))
    )
    return locus


StreamingClient = KafkaStreamingClient
