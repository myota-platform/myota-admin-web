# MyOTA Administration Web

Authenticated, programme-aware administration surface for the MyOTA Outdoor
Activation Platform. This is intentionally separate from the public
`myota-web` experience: administrator navigation, review queues, audit context,
and account controls do not leak into the participant-facing application.

## Initial slice

- Signed-token login, refresh and logout through the identity service.
- Role-aware global-admin shell with programme context and breadcrumb/audit context.
- Dashboard for service health, programmes, review queue, active work and security events.
- Programme create/update/archive and policy/theme editing.
- Geodata candidate/proposal review and manual GeoJSON import launch.
- Identity account search, multi-role user editing, least-privilege role creation/editing, privacy export and deactivation.
- Map-bounds-filtered geodata review, rejected-entity deletion, and protected point/polygon geometry-type conversion for global or GIS administrators.
- Leaflet-based geodata review with a persistent viewport queue, explicit geometry edit mode, Leaflet-Geoman point/way/polygon drawing, and source/audit-aware inspection.
- Read-only Entity map page showing all stored geometries with lifecycle styling, clustered Leaflet markers, and popups for name, location metadata, shared categories, and programme memberships.
- Database-backed multi-category selection for new candidates and reviewed entities; the first category remains the compatibility primary value.
- Asynchronous geodata import submission for pasted or uploaded datasets, optional paste text when a file is selected, and clickable import-run summaries with entity counts, provenance, and errors.
- Activation/QSO operational list with protected activity-read scope.
- Programme-owned hunter/activator award drafts, nested conditions, configurable levels, print profiles, draggable certificate fields, asset registration, and request/issuance visibility through the shared activity API on port 8004.
- Keyboard-friendly responsive layout with visible status, error and loading states.

The UI is programme-agnostic and does not encode any programme rules. It only
edits configuration supplied by each programme.

## Map tiles and editing

The review map uses vendored, pinned Leaflet and Leaflet-Geoman assets. The
default raster tile source is the configurable
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`. The map displays the required
OpenStreetMap attribution and a “Report a map issue” link, requests tiles only
for the visible viewport, does not prefetch or provide offline tiles, and lets
the browser honor tile caching headers. The nginx response and HTML referrer
policy are `strict-origin-when-cross-origin`, which sends a valid origin
referrer to the tile server. Browsers supply their own User-Agent header;
client-side JavaScript cannot set or spoof it. If a deployment proxies tiles,
that proxy must provide an identifiable User-Agent and follow the provider’s
terms. See the [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
before changing the tile provider or request behavior.

Programme configuration details, including the legacy shared Entity Categories
JSON compatibility format and geometry type rules, are documented in
[`docs/programme-configuration.md`](docs/programme-configuration.md).

## Local run

Serve `web/` with any static server and set the API base to the gateway,
normally `http://localhost:8080`. The deployment Compose manifest starts this
UI on `http://localhost:8090`.

Award background and signature binaries are addressed by object keys in the
admin UI and can be uploaded through presigned MinIO/S3 URLs. Local Compose
provides MinIO for those assets; certificate rendering produces a PDF when the
registered background and signature are available, otherwise the immutable
issuance render specification can be retried later.
