from io import StringIO

import pandas as pd
from marshmallow import fields


class _Lightcurve(fields.Field):
    """Field that represents an ANTARES lightcurve as a pandas dataframe"""

    def _deserialize(self, value, attr, data, **kwargs):
        return pd.read_csv(StringIO(value))
