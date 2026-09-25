# Administration workflows

The administration web is intentionally programme-agnostic. It stores and publishes programme-owned data; it does not copy rules, charters, eligibility, award definitions, or content from POTA, MPOTA, or another programme.

## Geodata review

Open **Geodata review** and choose a programme. The map separates `CANDIDATE`, `PROPOSED`, `APPROVED`, `RETIRED`, and `REJECTED` entities into distinct visual layers. Select an entity on the map or in the list to open its inspector; the map automatically centers and zooms to the selected geometry.

The review queue is bound to the visible map bounding box. Panning or zooming
refreshes the queue through the geodata API with the current `minLon`,
`minLat`, `maxLon`, and `maxLat` values, so entities outside the selected map
area are not displayed.

The **Entity status** editor allows an approver to set the lifecycle status directly from the inspector. Status changes are recorded in the audit history and emit a status-change event. An `APPROVED` entity can only move to `RETIRED`; a retired entity cannot be reactivated. This protects historical QSOs from being associated with a later-invalidated entity.

The inspector provides:

- the original imported source feature/provenance beside the current platform geometry;
- a read-only geometry view until the explicit **Edit geometry** action is selected;
- Leaflet-Geoman draggable point or polygon vertices for a review-time geometry correction;
- a required-by-practice geometry note, which is retained in geometry history;
- proposal and approval/rejection actions with a reviewer note;
- combined review and geometry audit history.

Geometry edits never overwrite the stored source snapshot. Approval is an explicit state transition and remains subject to the authenticated approver scope enforced by the geodata service.

## Entity map

The **Entity map** page is a read-only Leaflet view of the complete stored
geodata catalogue. It loads the paged entity API, renders all entities with
geometry using lifecycle-specific colours, and fits the initial view to the
available data. Selecting a shape opens a popup containing the entity name,
stored location metadata, all shared category codes/labels, and the programmes
that explicitly contain the entity or are assigned one of its categories. The
page does not enable geometry editing; use Geodata review for audited changes.

Global administrators and GIS administrators can change an entity between
point and polygon geometry. Point-to-polygon conversion creates a small
editable starting area; polygon-to-point conversion uses the geometry
centroid. Both the previous geometry and the reason are retained in audit
history. Rejected entities also expose a permanent delete action to global or
GIS administrators. Deletion removes the entity, related conflation records,
and its audit record, and cannot be undone.

Use **New candidate** to choose a polygon area, way/trail, or point location. Leaflet-Geoman closes polygons when the first vertex is selected again (and also offers its normal finish control). For point entities, click once on the map. Add the name, select one or more shared entity categories from the database-backed multi-select, jurisdiction, and optional evidence URI, then submit it as a `CANDIDATE`. The first category is retained as the compatibility primary category; the complete list is persisted by the geodata service. Programme assignment is optional and remains a separate eligibility decision. The API validates geometry, coordinate ranges, CRS, feature size, and attachment metadata before accepting it.

The category list is never hardcoded in the browser. It is loaded from the
shared Master data catalogue. The same multi-select is available when editing
an existing entity, and category filters match entities containing any
selected category.

The service-side source manifests, refresh schedules, conflation decisions, disappearance policies, QGIS staging roles, and spatial APIs are documented in the platform repository’s [geodata production pipeline](https://github.com/myota-platform/myota-platform/blob/main/docs/geodata-production-pipeline.md).

## Content and translations

## Users and roles

Open **Identity** to edit account display name, email, status and optional
password reset. Users may hold multiple roles at once. The role catalogue
contains built-in least-privilege roles such as Identity administrator, GIS
administrator, Geodata approver, Programme administrator, Activity
administrator, and Auditor. Global administrators can create custom roles and
select from the controlled administrative permission catalogue; wildcard
access is reserved for the global administrator role.

Open **Content & translations** to manage programme-owned content keys by locale. A content version moves through:

`DRAFT` → `UNDER_REVIEW` → `APPROVED` → `PUBLISHED`

Reviewers can return a version as `CHANGES_REQUESTED`. Published versions are immutable; create a new draft to change them. Publishing requires an explicit effective date and publisher identity. Each locale can name a fallback locale, and the coverage panel reports published keys, missing keys, and percentage coverage for every programme locale.

## Rules and awards

Open **Rules & awards** to create programme-owned `RULES` or `AWARD` drafts. The schema is deliberately JSON because each programme defines its own thresholds, eligibility, award requirements, labels, and supporting metadata.

Policy versions move through the same draft/review/publish lifecycle. Publishing requires an explicit effective date and publisher identity. A published rules version becomes the programme’s effective rules snapshot; a published award is appended to the programme’s award catalogue with its version and effective date. Existing published versions are immutable.

## Local verification

The local Compose deployment serves this administration web on port `8090`. Use the bootstrap administrator configured in the local environment, then exercise each workflow against the sample programme data. The MPOTA records are synthetic sample data only and are not a source of platform rules.

## Sevilla sample map data

The local sample geodata contains three OSM-referenced parks around Sevilla: Parque de María Luisa, Parque del Alamillo, and Parque de los Príncipes. Two are seeded as approved references and Los Príncipes is seeded as a candidate so the review lifecycle is immediately visible. Each record keeps its OSM way reference, source URL, ODbL metadata, and source feature snapshot.

The map uses the standard HTTPS OpenStreetMap tile endpoint only for the tiles currently visible in the interactive viewport. It supports drag panning, mouse-wheel zoom, and explicit zoom controls, and displays `© OpenStreetMap contributors` plus a “Report a map issue” link. The page and nginx response use `strict-origin-when-cross-origin`, so the browser sends a valid origin `Referer`; browser JavaScript cannot set a `User-Agent`, so the browser supplies its normal identifiable one. Requests are not prefetched or made available offline, and normal browser caching is preserved. Production deployments should review traffic volume and the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/) before using the public tile service at scale; a managed or self-hosted tile provider is the planned production option for heavier usage.
