# Programme configuration guide

The Programme Editor is designed so programme owners can configure their own
policy without inheriting rules from another programme. The common controls
cover minimum activation QSOs, minimum hunter QSOs, activation validity,
public-access requirements, overlap handling, and theme colors.

## Entity types (JSON)

Entity types are the programme's catalogue of places that can participate. The
editor intentionally keeps this field in JSON until a dedicated entity-type
builder is added.

Use an array of objects. Each object should contain:

- `code`: stable machine identifier used by imports and historical records.
- `label`: human-readable name shown to administrators and participants.
- `geometry`: expected PostGIS geometry, normally `POINT`, `POLYGON`, or
  `MULTIPOLYGON`.

Example:

```json
[
  {
    "code": "MUNICIPAL_PARK",
    "label": "Municipal park",
    "geometry": "MULTIPOLYGON"
  },
  {
    "code": "RIVERSIDE_SITE",
    "label": "Riverside site",
    "geometry": "POLYGON"
  }
]
```

Codes should not be renamed after publication. Existing entities, imports, and
historical activity records may refer to them. If the meaning changes, create
a new code and retire the old one through a future policy version.

Programme owners may add metadata fields, but the platform currently relies on
the three fields above for display, import normalization, and geometry checks.
The JSON describes the catalogue only; eligibility, access rules, awards, and
approval policy remain programme-owned configuration.
