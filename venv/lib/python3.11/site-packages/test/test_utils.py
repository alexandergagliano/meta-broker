import datetime

import pytest

from antares_client import utils


@pytest.mark.parametrize(
    "mjd,dt", [(58981.4322106, datetime.datetime(2020, 5, 12, 10, 22, 22, 996000))]
)
def test_mjd_to_datetime(mjd, dt):
    difference = abs(utils.mjd_to_datetime(mjd) - dt)
    assert difference < datetime.timedelta(milliseconds=1)


def test_mjd_to_datetime_with_bad_input_raises_value_error():
    with pytest.raises(ValueError):
        utils.mjd_to_datetime("aaa")
