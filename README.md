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
- Activation/QSO operational list with protected activity-read scope.
- Programme-owned hunter/activator award drafts, nested conditions, configurable levels, print profiles, draggable certificate fields, asset registration, and request/issuance visibility through the shared activity API on port 8004.
- Keyboard-friendly responsive layout with visible status, error and loading states.

The UI is programme-agnostic and does not encode any programme rules. It only
edits configuration supplied by each programme.

Programme configuration details, including the current Entity Types JSON
format, are documented in [`docs/programme-configuration.md`](docs/programme-configuration.md).

## Local run

Serve `web/` with any static server and set the API base to the gateway,
normally `http://localhost:8080`. The deployment Compose manifest starts this
UI on `http://localhost:8090`.

Award background and signature binaries are addressed by object keys in the
admin UI and can be uploaded through presigned MinIO/S3 URLs. Local Compose
provides MinIO for those assets; certificate rendering produces a PDF when the
registered background and signature are available, otherwise the immutable
issuance render specification can be retried later.
