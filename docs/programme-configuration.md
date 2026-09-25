# Programme configuration guide

The Programme Editor is designed so programme owners can configure their own
policy without inheriting rules from another programme. The common controls
cover minimum activation QSOs, minimum hunter QSOs, activation validity,
public-access requirements, overlap handling, and theme colors.

## Entity categories (JSON compatibility field)

Entity categories are shared Master data, not owned by one programme. The
Programme Editor keeps its legacy JSON field for compatibility, while the
Master data page defines the catalogue and Programme Management assigns shared
categories to one or more programmes. Geodata imports and review use the full
database-backed catalogue even when an entity has no programme assignment.

The editor intentionally keeps this field in JSON until a dedicated category
builder is added.

Use an array of objects. Each object should contain:

- `code`: stable machine identifier used by imports and historical records.
- `label`: human-readable name shown to administrators and participants.
- `geometry` or `geometryTypes`: accepted GeoJSON/PostGIS geometry types. The
  supported values are `POINT`, `LINESTRING`, `MULTILINESTRING`, `POLYGON`,
  and `MULTIPOLYGON`; one category can allow more than one type.

Example:

```json
[
  {
    "code": "MUNICIPAL_PARK",
    "label": "Municipal park",
    "geometryTypes": ["POLYGON", "MULTIPOLYGON"]
  },
  {
    "code": "RIVERSIDE_SITE",
    "label": "Riverside site",
    "geometryTypes": ["POLYGON"]
  }
]
```

Codes should not be renamed after publication. Existing entities, imports, and
historical activity records may refer to them. If the meaning changes, create
a new code and retire the old one through a future policy version.

Programme owners may add metadata fields, but the platform currently relies on
the three fields above for display, import normalization, and geometry checks.
The JSON describes category assignments and geometry hints only; eligibility,
access rules, awards, and approval policy remain programme-owned configuration.
