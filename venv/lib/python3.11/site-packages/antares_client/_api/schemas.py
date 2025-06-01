import marshmallow
from marshmallow import post_load
from marshmallow_jsonapi import Schema, fields

from .fields import _Lightcurve


class _ClientConfigStreamingSchema(Schema):
    class Meta:
        type_ = "client_config_streaming"
        unknown = marshmallow.EXCLUDE

    id = fields.String()
    type = fields.String()
    options = fields.Dict()


class _AlertSchema(Schema):
    class Meta:
        type_ = "alert"
        unknown = marshmallow.EXCLUDE

    id = fields.String(attribute="alert_id")
    properties = fields.Dict()
    processed_at = fields.DateTime()
    mjd = fields.Float()
    grav_wave_events = fields.List(fields.Dict())
    thumbnails = fields.Relationship()
    resource_meta = fields.ResourceMeta()
    document_meta = fields.DocumentMeta()

    @post_load
    def make_alert(self, data: dict, **_):
        from ..models import Alert

        return Alert(**data)


class _CatalogEntrySchema(Schema):
    class Meta:
        type_ = "catalog_entry"
        unknown = marshmallow.EXCLUDE

    id = fields.Str(attribute="catalog_entry_id")
    object_id = fields.Str()
    object_name = fields.Str()
    name = fields.Str()
    ra = fields.Float()
    dec = fields.Float()
    properties = fields.Dict()
    catalog = fields.Relationship()
    resource_meta = fields.ResourceMeta()
    document_meta = fields.DocumentMeta()


class _LocusSchema(Schema):
    class Meta:
        type_ = "locus"
        unknown = marshmallow.EXCLUDE

    id = fields.Str(attribute="locus_id")
    htm16 = fields.Int()
    ra = fields.Float()
    dec = fields.Float()
    grav_wave_events = fields.List(fields.Str())
    properties = fields.Dict()
    lightcurve = _Lightcurve()
    alerts = fields.Relationship()
    tags = fields.List(fields.Str())
    catalogs = fields.List(fields.Str())
    catalog_matches = fields.List(fields.Dict())
    resource_meta = fields.ResourceMeta()
    document_meta = fields.DocumentMeta()

    @post_load
    def make_locus(self, data: dict, **_):
        from ..models import Locus

        return Locus(**data)


class _LocusListingSchema(Schema):
    class Meta:
        type_ = "locus_listing"
        unknown = marshmallow.EXCLUDE

    id = fields.Str(attribute="locus_id")
    htm16 = fields.Int()
    ra = fields.Float()
    dec = fields.Float()
    properties = fields.Dict()
    locus = fields.Relationship()
    alerts = fields.Relationship()
    tags = fields.List(fields.Str())
    catalogs = fields.List(fields.Str())
    resource_meta = fields.ResourceMeta()
    document_meta = fields.DocumentMeta()

    @post_load
    def make_locus(self, data: dict, **_):
        from ..models import Locus

        return Locus(**data)


class _GravWaveNoticeSchema(Schema):
    from ..models import GravWaveNoticeTypes

    class Meta:
        type_ = "grav_wave_notice"
        unknown = marshmallow.EXCLUDE

    id = fields.Int()
    gracedb_id = fields.Str()
    notice_type = fields.Enum(GravWaveNoticeTypes)
    notice_datetime = fields.DateTime(allow_none=True)
    event_datetime = fields.DateTime(allow_none=True)
    false_alarm_rate = fields.Float(allow_none=True)
    skymap_base64 = fields.Str(allow_none=True)
    external_coinc = fields.Dict(allow_none=True)
    full_notice = fields.Dict(allow_none=True)
    version_id = fields.Int(allow_none=True)

    @post_load
    def make_grav_wave_event(self, data: dict, **_):
        from ..models import GravWaveNotice

        return GravWaveNotice(**data)


class _CatalogSampleSchema(Schema):
    class Meta:
        type_ = "catalog_sample"
        unknown = marshmallow.EXCLUDE

    id = fields.String(attribute="object_id")
    catalog_name = fields.String()
    data = fields.Dict()
    document_meta = fields.DocumentMeta()


class _AlertThumbnailSchema(Schema):
    class Meta:
        type_ = "alert_thumbnail"
        unknown = marshmallow.EXCLUDE

    id = fields.Str()
    filename = fields.Str()
    filemime = fields.Str()
    src = fields.Str()
    thumbnail_type = fields.Str()
    resource_meta = fields.Dict()
    document_meta = fields.DocumentMeta()
