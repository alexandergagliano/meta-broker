import datetime
from base64 import b64decode
from collections import defaultdict
from dataclasses import InitVar, dataclass, field
from enum import Enum
from io import BytesIO
from typing import ClassVar, List, Optional, Union

import astropy.timeseries
import astropy.units as u
import astropy_healpix as ah
import numpy as np
import pandas as pd
from astropy.coordinates import SkyCoord
from astropy.table import Table
from typing_extensions import TypedDict

from ._api.api import _get_resource, _list_resources
from ._api.schemas import _AlertSchema, _CatalogEntrySchema, _LocusSchema
from .config import config
from .utils import mjd_to_datetime


class AlertGravWaveEvent(TypedDict):
    gracedb_id: str
    contour_level: float
    contour_area: float


class Alert:
    """
    An ANTARES alert represents a single visit/observation of an astronomical object.

    Attributes
    ----------
    alert_id: str
        ANTARES ID for this alert.
    mjd: float
        Modified julian date of the alert.
    properties: dict
        Arbitrary, survey-specific properties associated with this alert.

    Note
    ----------
    processed_at and grav_wave_events are Optional to not break user code that
    uses the Alert class. This Optional doesn't apply to antares non client.
    """

    def __init__(
        self,
        alert_id: str,
        mjd: float,
        properties: dict,
        processed_at: Optional[datetime.datetime] = None,
        grav_wave_events: Optional[List[Optional[AlertGravWaveEvent]]] = None,
        **_,
    ):
        self.alert_id = alert_id
        self.mjd = mjd
        self.processed_at = processed_at
        self.properties = properties
        self.grav_wave_events = grav_wave_events


class Locus:
    """
    An ANTARES locus is a collection of metadata describing a single astronomical
    object.

    Attributes
    ----------
    locus_id: str
        ANTARES ID for this object.
    ra: float
        Right ascension of the centroid of alert history.
    dec: float
        Declination of the centroid of alert history.
    properties: dict
        A dictionary of ANTARES- and user-generated properties that are updated every
        time there is activity on this locus (e.g. a new alert).
    tags: List[str]
        A list of strings that are added to this locus by ANTARES- and user-submitted
        filters that run against the real-time alert stream.
    alerts: Optional[List[Alert]]
        A list of alerts that are associated with this locus. If `None`, the alerts
        will be loaded on first access from the ANTARES HTTP API.
    catalogs: Optional[List[str]]
        Names of catalogs that this locus has been associated with.
    catalog_objects: Optional[List[dict]]
        A list of catalog objects that are associated with this locus. If `None`, they
        will be loaded on first access from the ANTARES HTTP API.
    lightcurve: Optional[pd.DataFrame]
        Data frame representation of a subset of normalized alert properties. If `None`
        it will be loaded on first access from the ANTARES HTTP API.
    watch_list_ids: Optional[List[str]]
        A list of IDs corresponding to user-submitted regional watch lists.
    watch_object_ids: Optional[List[str]]
        A list of IDs corresponding to user-submitted regional watch list objects.
    grav_wave_events: Optional[List[str]]
        A list of gravitational wave event ids that are associated with this locus.

    Notes
    -----
    Instances of this class lazy-load a few of their attributes from the ANTARES API.
    These attributes are: `alerts`, `catalog_objects` and `lightcurve`.

    """

    def __init__(
        self,
        locus_id: str,
        ra: float,
        dec: float,
        properties: dict,
        tags: List[str],
        alerts: Optional[List[Alert]] = None,
        catalogs: Optional[List[str]] = None,
        catalog_objects: Optional[List[dict]] = None,
        lightcurve: Optional[pd.DataFrame] = None,
        watch_list_ids: Optional[List[str]] = None,
        watch_object_ids: Optional[List[str]] = None,
        grav_wave_events: Optional[List[str]] = None,
        **_,
    ):
        self.locus_id = locus_id
        self.ra = ra
        self.dec = dec
        self.properties = properties
        self.tags = tags
        self.catalogs = catalogs
        if self.catalogs is None:
            self.catalogs = []
        self.watch_list_ids = watch_list_ids
        if self.watch_list_ids is None:
            self.watch_list_ids = []
        self.watch_object_ids = watch_object_ids
        if self.watch_object_ids is None:
            self.watch_object_ids = []
        self.grav_wave_events = grav_wave_events
        if self.grav_wave_events is None:
            self.grav_wave_events = []
        self._alerts = alerts
        self._catalog_objects = catalog_objects
        self._lightcurve = lightcurve
        self._timeseries = None
        self._coordinates = None

    def _fetch_alerts(self) -> List[Alert]:
        alerts = _list_resources(
            config["ANTARES_API_BASE_URL"]
            + "/".join(("loci", self.locus_id, "alerts")),
            _AlertSchema,
        )
        return list(alerts)

    def _fetch_lightcurve(self) -> pd.DataFrame:
        locus = _get_resource(
            config["ANTARES_API_BASE_URL"] + "/".join(("loci", self.locus_id)),
            _LocusSchema,
        )
        return locus.lightcurve

    def _fetch_catalog_objects(self) -> dict:
        catalog_matches = _list_resources(
            config["ANTARES_API_BASE_URL"]
            + "/".join(("loci", self.locus_id, "catalog-matches")),
            _CatalogEntrySchema,
        )
        catalog_matches = list(catalog_matches)
        catalog_objects = defaultdict(list)
        for match in catalog_matches:
            catalog_name = match["catalog_entry_id"].split(":")[0]
            catalog_objects[catalog_name].append(match["properties"])
        return catalog_objects

    @property
    def timeseries(self) -> astropy.timeseries.TimeSeries:
        """
        This `TimeSeries` contains all of the historical alert data associated with
        this object.
        """
        if self._timeseries is None:
            self._timeseries = astropy.timeseries.TimeSeries(
                data=[alert.properties for alert in self.alerts],
                time=[mjd_to_datetime(alert.mjd) for alert in self.alerts],
            )
        return self._timeseries

    @timeseries.setter
    def timeseries(self, value) -> None:
        self._timeseries = value

    @property
    def alerts(self) -> List[Alert]:
        """A list of alerts that are associated with this locus."""
        if self._alerts is None:
            self._alerts = self._fetch_alerts()
        return self._alerts

    @alerts.setter
    def alerts(self, value) -> None:
        self._alerts = value

    @property
    def catalog_objects(self) -> dict:
        """
        A dictionary of catalog objects that are associated with this locus. It has a
        structure like::

            {
                "<catalog_name">: [
                    { **<catalog_object_properties> },
                    { **<catalog_object_properties> },
                    ...
                ],
                ...
            }

        """
        if self._catalog_objects is None:
            self._catalog_objects = self._fetch_catalog_objects()
        return self._catalog_objects

    @catalog_objects.setter
    def catalog_objects(self, value) -> None:
        self._catalog_objects = value

    @property
    def lightcurve(self) -> pd.DataFrame:
        """Data frame representation of a subset of normalized alert properties."""
        if self._lightcurve is None:
            self._lightcurve = self._fetch_lightcurve()
        return self._lightcurve

    @lightcurve.setter
    def lightcurve(self, value) -> None:
        self._lightcurve = value

    @property
    def coordinates(self) -> SkyCoord:
        """Centroid of the locus as an AstroPy SkyCoord object."""
        if self._coordinates is None:
            self._coordinates = SkyCoord(f"{self.ra}d {self.dec}d")
        return self._coordinates


class GravWaveNoticeTypes(Enum):
    EARLY_WARNING = "EARLY_WARNING"
    EARLYWARNING = "EARLY_WARNING"
    PRELIMINARY = "PRELIMINARY"
    INITIAL = "INITIAL"
    UPDATE = "UPDATE"
    RETRACTION = "RETRACTION"


@dataclass
class GravWaveNotice:
    gracedb_id: str
    notice_type: GravWaveNoticeTypes
    notice_datetime: datetime.datetime
    id: Optional[int] = field(default_factory=lambda: None)
    event_datetime: Optional[datetime.datetime] = field(default_factory=lambda: None)
    false_alarm_rate: Optional[float] = field(default_factory=lambda: None)
    skymap_base64: Optional[str] = field(default_factory=lambda: None)
    external_coinc: Optional[dict] = field(default_factory=lambda: None)
    full_notice: Optional[dict] = field(default_factory=lambda: None)
    version_id: int = field(default_factory=lambda: 1)

    _max_level: ClassVar[int] = 29
    _skymap: InitVar[Union[Table, None]] = None
    _healpix_nested_indices: InitVar[Union[np.ndarray, None]] = None
    _healpix_sorter: InitVar[Union[np.ndarray, None]] = None
    _probability_density_sorter: InitVar[Union[np.ndarray, None]] = None
    _sorted_pixel_areas: InitVar[Union[np.ndarray, None]] = None
    _cumprob: InitVar[Union[np.ndarray, None]] = None

    @property
    def skymap(self):
        if self._skymap is None:
            skymap_bytes = b64decode(self.skymap_base64)
            self._skymap = Table.read(BytesIO(skymap_bytes))
        return self._skymap

    @property
    def healpix_nested_indices(self):
        if self._healpix_nested_indices is None:
            level, ipix = ah.uniq_to_level_ipix(self.skymap["UNIQ"])
            index = ipix * (2 ** (self._max_level - level)) ** 2
            self._healpix_nested_indices = index
        return self._healpix_nested_indices

    @property
    def healpix_sorter(self):
        # sorted indices by nested healpix indices
        if self._healpix_sorter is None:
            self._healpix_sorter = np.argsort(self.healpix_nested_indices)
        return self._healpix_sorter

    @property
    def probability_density_sorter(self):
        # sorted indices by probability density
        if self._probability_density_sorter is None:
            self._probability_density_sorter = np.argsort(self.skymap["PROBDENSITY"])
        return self._probability_density_sorter

    @property
    def sorted_pixel_areas(self):
        # pixel areas using probdensity sort order
        if self._sorted_pixel_areas is None:
            level, _ = ah.uniq_to_level_ipix(
                self.skymap["UNIQ"][self.probability_density_sorter]
            )
            pixel_area = ah.nside_to_pixel_area(ah.level_to_nside(level))
            self._sorted_pixel_areas = pixel_area
        return self._sorted_pixel_areas

    @property
    def cumprob(self):
        # cumulative probability using low-to-high prob density sort order
        if self._cumprob is None:
            prob = (
                self.sorted_pixel_areas
                * self.skymap["PROBDENSITY"][self.probability_density_sorter]
            )
            self._cumprob = np.cumsum(prob)  # low to high density
        return self._cumprob

    def get_probability_density(self, location: SkyCoord) -> float:
        max_nside = ah.level_to_nside(self._max_level)
        match_ipix = ah.lonlat_to_healpix(
            location.ra, location.dec, max_nside, order="nested"
        )

        i = self.healpix_sorter[
            np.searchsorted(
                self.healpix_nested_indices,
                match_ipix,
                side="right",
                sorter=self.healpix_sorter,
            )
            - 1
        ]
        return self.skymap[i]["PROBDENSITY"]

    def get_probability_contour_level_and_area(self, location: SkyCoord):
        prob_density = self.get_probability_density(location)

        i = (
            np.searchsorted(
                self.skymap["PROBDENSITY"],
                prob_density,
                side="right",
                sorter=self.probability_density_sorter,
            )
            - 1  # include duplicates
        )
        contour_level = (1.0 - self.cumprob[i].value) * 100.0
        area = self.sorted_pixel_areas[i:].sum().to(u.deg**2)
        return contour_level, area
