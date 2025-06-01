"""
Search the ANTARES database for objects of interest.
"""
import datetime
import json
from collections import defaultdict
from typing import DefaultDict, Dict, Iterator, List, Optional
from urllib.parse import urljoin

import astropy.coordinates
import astropy.units

from ._api.api import (
    _get_raw_resource,
    _get_resource,
    _get_thumbnail_blob,
    _list_all_resources,
    _list_resources,
)
from ._api.schemas import (
    _AlertThumbnailSchema,
    _CatalogSampleSchema,
    _GravWaveNoticeSchema,
    _LocusListingSchema,
    _LocusSchema,
)
from .config import config
from .models import GravWaveNotice, Locus


def search(query: Dict) -> Iterator[Locus]:
    """
    Searches the ANTARES database for loci that meet certain criteria. Results are
    returned with the most recently updated objects first (sorted on the
    `properties.newest_alert_observation_time` field in descending order).

    Parameters
    ----------
    query: dict
        An ElasticSearch query. Must contain a top-level "query" key and only that
        top-level key. Other ES search arguments (e.g. "aggregations") are not allowed.

    Returns
    ----------
    Iterator over Locus objects

    """
    return _list_all_resources(
        urljoin(config["ANTARES_API_BASE_URL"], "loci"),
        _LocusListingSchema,
        params={
            "sort": "-properties.newest_alert_observation_time",
            "elasticsearch_query[locus_listing]": json.dumps(query),
        },
    )


def cone_search(
    center: astropy.coordinates.SkyCoord,
    radius: astropy.coordinates.Angle,
) -> Iterator[Locus]:
    """
    Searches the ANTARES database for loci in a certain region. Results are returned
    with the most recently updated objects first (sorted on the
    `properties.newest_alert_observation_time` field in descending order).

    Parameters
    ----------
    center: astropy.coordiantes.SkyCoord
    radius: astropy.coordiantes.Angle

    Returns
    ----------
    Iterator over Locus objects

    """
    return search(
        {
            "query": {
                "bool": {
                    "filter": {
                        "sky_distance": {
                            "distance": f"{radius.to_string(unit=astropy.units.deg, decimal=True)} degree",
                            "htm16": {"center": center.to_string()},
                        },
                    },
                },
            },
        }
    )


def get_by_id(locus_id: str) -> Optional[Locus]:
    """
    Gets an ANTARES locus by its ANTARES ID.

    Parameters
    ----------
    locus_id: str

    Returns
    ----------
    Locus or None

    """
    return _get_resource(
        urljoin(config["ANTARES_API_BASE_URL"], f"loci/{locus_id}"),
        _LocusSchema,
    )


def get_by_ztf_object_id(ztf_object_id: str) -> Optional[Locus]:
    """
    Gets an ANTARES locus by its ZTF Object ID.

    Parameters
    ----------
    ztf_object_id: str

    Returns
    ----------
    Locus or None

    """
    try:
        return next(
            search(
                {
                    "query": {
                        "bool": {
                            "filter": {
                                "term": {"properties.ztf_object_id": ztf_object_id},
                            },
                        },
                    },
                }
            )
        )
    except StopIteration:
        return None


def get_available_tags() -> List[str]:
    resource = _get_raw_resource(
        urljoin(config["ANTARES_API_BASE_URL"], "loci/statistics")
    )
    if resource.get("attributes") and resource.get("attributes").get("tags"):
        return list(resource.get("attributes").get("tags").keys())
    return []


def get_latest_grav_wave_notices(gracedb_id: str) -> GravWaveNotice:
    return _get_resource(
        urljoin(
            config["ANTARES_API_BASE_URL"],
            f"grav_wave_notices/{gracedb_id}/latest",
        ),
        _GravWaveNoticeSchema,
    )


def get_grav_wave_notices(
    gracedb_id: str, notice_datetime: datetime.datetime
) -> GravWaveNotice:
    return _get_resource(
        urljoin(
            config["ANTARES_API_BASE_URL"],
            f"grav_wave_notices/{gracedb_id}/{notice_datetime.isoformat()}",
        ),
        _GravWaveNoticeSchema,
    )


def get_multiple_grav_wave_notices(ids: List[str]) -> List[GravWaveNotice]:
    return list(
        _list_resources(
            urljoin(
                config["ANTARES_API_BASE_URL"],
                "grav_wave_notices/latest?ids={}".format(",".join(ids)),
            ),
            _GravWaveNoticeSchema,
        )
    )


def get_catalog_samples(n: int = 5) -> DefaultDict[str, List[Dict]]:
    catalog_samples = defaultdict(list)
    catalog_list = _list_resources(
        urljoin(config["ANTARES_API_BASE_URL"], f"catalog_samples?n={n}"),
        _CatalogSampleSchema,
    )
    for catalog_dict in catalog_list:
        catalog_name = catalog_dict["catalog_name"]
        catalog_samples[catalog_name].append(catalog_dict["data"])
    return catalog_samples


def catalog_search(ra: float, dec: float) -> DefaultDict[str, List[Dict]]:
    catalog_objects_combined = defaultdict(list)
    catalog_list = _list_resources(
        urljoin(config["ANTARES_API_BASE_URL"], f"catalog_search/{ra}/{dec}"),
        _CatalogSampleSchema,
    )
    for catalog_dict in catalog_list:
        catalog_name = catalog_dict["catalog_name"]
        catalog_objects_combined[catalog_name].append(catalog_dict["data"])
    return catalog_objects_combined


def get_thumbnails(alert_id: str):
    thumbnails = {}
    thumbnails_from_storage = _list_resources(
        urljoin(config["ANTARES_API_BASE_URL"], f"alerts/{alert_id}/thumbnails"),
        _AlertThumbnailSchema,
    )
    for thumbnail in thumbnails_from_storage:
        thumbnails[thumbnail["thumbnail_type"]] = {
            "alert_id": alert_id,
            "type": thumbnail["thumbnail_type"],
            "file_name": thumbnail["filename"],
            "blob": _get_thumbnail_blob(thumbnail["src"]),
        }
    return thumbnails
