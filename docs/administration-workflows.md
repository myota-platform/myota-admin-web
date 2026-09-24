# Administration workflows

The administration web is intentionally programme-agnostic. It stores and publishes programme-owned data; it does not copy rules, charters, eligibility, award definitions, or content from POTA, MPOTA, or another programme.

## Geodata review

Open **Geodata review** and choose a programme. The map separates `CANDIDATE`, `PROPOSED`, `APPROVED`, and `REJECTED` entities into distinct visual layers. Select an entity on the map or in the list to open its inspector.

The inspector provides:

- the original imported source feature/provenance beside the current platform geometry;
- draggable point or polygon vertices for a review-time geometry correction;
- a required-by-practice geometry note, which is retained in geometry history;
- proposal and approval/rejection actions with a reviewer note;
- combined review and geometry audit history.

Geometry edits never overwrite the stored source snapshot. Approval is an explicit state transition and remains subject to the authenticated approver scope enforced by the geodata service.

## Content and translations

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

The map uses the standard HTTPS OpenStreetMap tile endpoint only for the tiles currently visible in the interactive viewport. It supports drag panning, mouse-wheel zoom, and explicit zoom controls, and displays `© OpenStreetMap contributors` attribution. Production deployments should review traffic volume and the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/) before using the public tile service at scale; a managed or self-hosted tile provider is the planned production option for heavier usage.
