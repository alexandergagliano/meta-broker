import datetime
from unittest import mock

import astropy.coordinates
import pytest

from antares_client import search
from antares_client.exceptions import AntaresException
from antares_client.models import GravWaveNoticeTypes, Locus


def test_search(mock_api):
    loci = list(search.search({}))
    assert len(loci)
    assert type(loci[0]) is Locus
    assert "ANT2019ae" in [locus.locus_id for locus in loci]
    assert "ANT2019ai" in [locus.locus_id for locus in loci]


def test_get_by_id(mock_api):
    locus = search.get_by_id("ANT2019ae")
    assert type(locus) is Locus
    assert locus.locus_id == "ANT2019ae"


def test_get_by_id_fetches_gravitational_wave_ids(mock_api):
    locus = search.get_by_id("ANT2020ho42c")
    assert type(locus) is Locus
    assert locus.locus_id == "ANT2020ho42c"
    assert len(locus.grav_wave_events) == 27
    assert locus.grav_wave_events[0] == "S231027bk"


def test_get_by_id_fetches_alerts(mock_api):
    locus = search.get_by_id("ANT2019ae")
    assert len(locus.alerts)


def test_get_by_id_fetches_alerts_with_gravitational_waves(mock_api):
    locus = search.get_by_id("ANT2023mtexfpy1vpo1")
    assert len(locus.alerts)
    assert locus.alerts[-1].grav_wave_events
    assert locus.alerts[-1].grav_wave_events[0]["gracedb_id"] is not None
    assert locus.alerts[-1].grav_wave_events[0]["contour_level"] is not None
    assert locus.alerts[-1].grav_wave_events[0]["contour_area"] is not None


def test_get_by_id_constructs_timeseries(mock_api):
    locus = search.get_by_id("ANT2019ae")
    assert type(locus) is Locus
    assert locus.locus_id == "ANT2019ae"


def test_get_by_id_404_returns_none(mock_api_404):
    assert search.get_by_id("cant_find_me") is None


def test_get_by_id_500_raises_error(mock_api_500):
    with pytest.raises(AntaresException) as exception:
        search.get_by_id("raise_an_error")
    assert "errors" in exception.value.args[0]
    assert exception.value.args[0]["errors"][0]["status"] == 500


@pytest.mark.parametrize(
    "input_radius,expected",
    [
        (astropy.coordinates.Angle(".002 deg"), "0.002 degree"),
        (astropy.coordinates.Angle("1 arcsec"), "0.000277778 degree"),
    ],
)
def test_cone_search_formats_radius(input_radius, expected):
    center = astropy.coordinates.SkyCoord("0d 0d")
    with mock.patch("antares_client.search.search") as mock_search:
        search.cone_search(center, input_radius)
        mock_search.assert_called_once()
        query = mock_search.call_args[0][0]
        assert query["query"]["bool"]["filter"]["sky_distance"]["distance"] == expected


@pytest.mark.parametrize(
    "input_center,expected",
    [
        (astropy.coordinates.SkyCoord("5d45m22s 2h22m10s"), "5.75611 35.5417"),
    ],
)
def test_cone_search_formats_center(input_center, expected):
    radius = astropy.coordinates.Angle("1 arcsec")
    with mock.patch("antares_client.search.search") as mock_search:
        search.cone_search(input_center, radius)
        mock_search.assert_called_once()
        query = mock_search.call_args[0][0]
        assert (
            query["query"]["bool"]["filter"]["sky_distance"]["htm16"]["center"]
            == expected
        )


def test_cone_search_throws_value_error_if_radius_not_astropy_angle():
    pass


def test_cone_search_throws_value_error_if_center_not_astropy_sky_coord():
    pass


def test_cone_search_throws_value_error_if_radius_greater_than_one_degree():
    pass


def test_get_available_tags(mock_api):
    tags = search.get_available_tags()
    assert isinstance(tags, list)
    assert "refitt_newsources_snrcut" in tags
    assert len(tags) == 27


def test_get_latest_grav_wave_notices(mock_api):
    searched_id = "S230529ay"
    grav_wave_notice = search.get_latest_grav_wave_notices(searched_id)
    assert grav_wave_notice.gracedb_id == searched_id
    assert grav_wave_notice.notice_type == GravWaveNoticeTypes.UPDATE
    assert grav_wave_notice.notice_datetime == datetime.datetime(2023, 7, 6, 14, 9, 33)


def test_get_grav_wave_notices(mock_api):
    searched_id = "S230529ay"
    searched_datetime = datetime.datetime(2023, 7, 6, 14, 9, 33)
    grav_wave_notice = search.get_grav_wave_notices(searched_id, searched_datetime)
    assert grav_wave_notice.gracedb_id == searched_id
    assert grav_wave_notice.notice_type == GravWaveNoticeTypes.UPDATE
    assert grav_wave_notice.notice_datetime == searched_datetime


def test_get_multiple_grav_wave_notices(mock_api):
    grav_wave_notices = search.get_multiple_grav_wave_notices(["S231004f", "S231004q"])
    assert len(grav_wave_notices) == 2
    assert grav_wave_notices[0].gracedb_id == "S231004f"
    assert grav_wave_notices[1].gracedb_id == "S231004q"


def test_get_multiple_grav_wave_notices_using_an_empty_list(
    mock_api_grav_wave_notices_empty_ids,
):
    with pytest.raises(AntaresException) as err:
        search.get_multiple_grav_wave_notices([])
    assert (
        "This endpoint receives comma separated ids in the query. Example: <url>?ids=id1,id2,id3"
        in str(err.value)
    )


catalog_used_in_test_names = {
    "2mass_psc",
    "2mass_xsc",
    "bright_guide_star_cat",
    "chandra_master_sources",
    "ned",
    "nyu_valueadded_gals",
    "sdss_gals",
    "sdss_stars",
    "veron_agn_qso",
    "RC3",
    "allwise",
    "csdr2",
    "xmm3_dr8",
    "asassn_variable_catalog_v2_20190802",
    "french_post_starburst_gals",
    "galex",
    "PS1StarGalaxyCatalog",
    "tns_public_objects",
    "milliquas",
    "vii_274_bzcat5",
    "linear_ll",
    "sdss_dr7",
    "vsx",
    "gaia_dr3_variability",
    "gaia_edr3_distances_bailer_jones",
    "gaia_dr3_gaia_source",
}


def test_get_catalog_samples(mock_api):
    catalog_sample = search.get_catalog_samples()
    assert len(catalog_sample) == 26
    assert catalog_used_in_test_names.issubset(catalog_sample.keys())
    assert catalog_sample["2mass_psc"][0].get("object_id") is None
    for catalog_name, objects in catalog_sample.items():
        assert catalog_name in catalog_used_in_test_names
        assert len(objects) == 5


def test_get_catalog_samples_using_n(mock_api):
    requested_number = 1
    catalog_sample = search.get_catalog_samples(requested_number)
    assert len(catalog_sample) == 26
    assert catalog_used_in_test_names.issubset(catalog_sample.keys())
    assert catalog_sample["2mass_psc"][0].get("object_id") is None
    for catalog_name, objects in catalog_sample.items():
        assert catalog_name in catalog_used_in_test_names
        assert len(objects) == requested_number


def test_get_catalog_samples_using_a_non_allowed_n(mock_api_catalog_bad_request):
    with pytest.raises(AntaresException) as err:
        search.get_catalog_samples(101)
    assert "Sample number should be less than or equal to 100" in str(err.value)


def test_catalog_search(mock_api):
    catalog_data = search.catalog_search(316.7859, 13.1324)
    catalog_names = [
        "allwise",
        "2mass_psc",
        "gaia_edr3_distances_bailer_jones",
        "gaia_dr3_gaia_source",
        "bright_guide_star_cat",
    ]
    assert set(catalog_data.keys()).issuperset(set(catalog_names))
    assert catalog_data["2mass_psc"][0].get("object_id") is None


def test_get_thumbnails(mock_api, mock_google_cloud_storage):
    thumbnails = search.get_thumbnails("ztf_candidate:2552120390115015005")
    assert isinstance(thumbnails, dict)
    thumbnail_types = ["difference", "science", "template"]
    assert set(thumbnails.keys()).issuperset(set(thumbnail_types))
    for thumbnail_type in thumbnail_types:
        assert set(thumbnails[thumbnail_type].keys()).issuperset(
            set(["alert_id", "type", "file_name", "blob"])
        )


def test_get_thumbnails_for_an_alert_that_doesnt_exist(mock_api):
    thumbnails = search.get_thumbnails("key_that_doesnt_exist")
    assert isinstance(thumbnails, dict)
    assert thumbnails == {}


def test_get_thumbnails_but_gcs_returns_404_not_found(
    mock_api, mock_google_cloud_storage_when_not_found
):
    thumbnails = search.get_thumbnails("ztf_candidate:2552120390115015005")
    assert isinstance(thumbnails, dict)
    for thumbnail in thumbnails.values():
        assert thumbnail["blob"] is None
