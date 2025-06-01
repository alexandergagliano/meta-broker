import json
import os
import re

import pytest
from requests_mock import ANY as REQUESTS_MOCK_ANY

from antares_client.config import config

API_RESPONSE_DIRECTORY = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "data", "api_responses"
)

THUMBNAIL_RESPONSE_DIRECTORY = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "data", "thumbnail_responses"
)


@pytest.fixture()
def mock_api(requests_mock):
    files = [f for f in os.listdir(API_RESPONSE_DIRECTORY) if f.endswith(".json")]
    for file in files:
        with open(os.path.join(API_RESPONSE_DIRECTORY, file)) as f:
            response = json.load(f)
            if file.startswith("grav_wave_notices"):
                path = file.replace(".json", "").replace("-", "/", 2)
            else:
                path = file.replace(".json", "").replace("-", "/")
            requests_mock.get(config["ANTARES_API_BASE_URL"] + path, json=response)


def sucessfull_callback(request, context):
    if "_targ_diff" in request.path:
        with open(
            os.path.join(THUMBNAIL_RESPONSE_DIRECTORY, "difference.bytes"), "rb"
        ) as data:
            return data.read()
    if "_targ_sci" in request.path:
        with open(
            os.path.join(THUMBNAIL_RESPONSE_DIRECTORY, "science.bytes"), "rb"
        ) as data:
            return data.read()
    if "_ref" in request.path:
        with open(
            os.path.join(THUMBNAIL_RESPONSE_DIRECTORY, "template.bytes"), "rb"
        ) as data:
            return data.read()


matcher = re.compile(
    r"https://storage.googleapis.com/antares-production-ztf-stamps/candid2552120390115015005(_pid\d+)?(_targ_diff|_targ_sci|_ref).fits.png"
)


@pytest.fixture()
def mock_google_cloud_storage(requests_mock):
    requests_mock.get(matcher, content=sucessfull_callback)


def unsucessfull_callback(request, context):
    context.status_code = 404
    return f"<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Details>No such object: {request.path[1:]}</Details></Error>".encode()


@pytest.fixture()
def mock_google_cloud_storage_when_not_found(requests_mock):
    requests_mock.get(
        matcher,
        content=unsucessfull_callback,
    )


@pytest.fixture()
def mock_api_404(requests_mock):
    requests_mock.register_uri(
        REQUESTS_MOCK_ANY,
        REQUESTS_MOCK_ANY,
        status_code=404,
        json={
            "errors": [
                {
                    "detail": "The requested URL was not found.",
                    "status": 404,
                    "title": "404 NOT FOUND",
                }
            ]
        },
    )


@pytest.fixture()
def mock_api_500(requests_mock):
    requests_mock.register_uri(
        REQUESTS_MOCK_ANY,
        REQUESTS_MOCK_ANY,
        status_code=500,
        json={
            "errors": [
                {
                    "detail": "The server encountered a problem.",
                    "status": 500,
                    "title": "500 Internal Server Error",
                }
            ]
        },
    )


@pytest.fixture()
def mock_api_catalog_bad_request(requests_mock):
    requests_mock.register_uri(
        REQUESTS_MOCK_ANY,
        REQUESTS_MOCK_ANY,
        status_code=400,
        json={
            "errors": [
                {
                    "detail": "Sample number should be less than or equal to 100",
                    "status": 400,
                    "title": "Bad Request",
                }
            ]
        },
    )


@pytest.fixture()
def mock_api_grav_wave_notices_empty_ids(requests_mock):
    requests_mock.register_uri(
        REQUESTS_MOCK_ANY,
        REQUESTS_MOCK_ANY,
        status_code=400,
        json={
            "errors": [
                {
                    "detail": "This endpoint receives comma separated ids in the query. Example: <url>?ids=id1,id2,id3",
                    "status": 400,
                    "title": "Bad Request",
                }
            ]
        },
    )
