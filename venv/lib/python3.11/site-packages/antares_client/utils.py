import astropy.time


def mjd_to_datetime(mjd):
    time = astropy.time.Time(mjd, format="mjd")
    time.format = "datetime"
    return time.value
