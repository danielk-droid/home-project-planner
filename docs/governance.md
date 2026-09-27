# HPP governance layer

HPP's trust chain: official source → source registry (tier, version) → rule (`data/rules.json`) → required facts with provenance → deterministic engine (`src/core.js`) → result + uncertainty → traceable explanation (`src/governance.js#traceResult`).

`src/governance.js` never decides applicability; it only audits. There is no second regulatory engine.

## Files
- `data/governance/source_registry.json` — authority tier (0 controlling law/code, 1 official City operational/GIS) and version label per source. Tier 4–5 sources are rejected for production rules.
- `data/governance/rule_registry.json` — human-governed metadata per rule: risk class (critical / high / moderate / abstention), human-review status, uncertainty companions, documented known gaps. Every critical rule must have a needs-confirmation companion or a documented gap.
- `data/governance/review_queue.json` — genuine consequential questions awaiting the owner. AI does not resolve these.
- `data/governance/incidents.json` — failures found and the regression that prevents recurrence.
- `data/governance/release_record.json` — known-good commit and rollback path.
- `scripts/release-gate.mjs` — fails the build on registry drift, untraceable/ungoverned results, hidden uncertainty, non-finite numbers, or an open critical incident. Runs in `npm test` and CI.

## Fact provenance
`property.*` = City GIS, except fixed conservative defaults (`historicStatusUnknown`, `openPermitsUnknown`, ...) = system default; `answers.*` = user; `project.*` = derived deterministically.

## Change policy
Adding or changing a rule requires: official tier 0–1 source, registry entry, uncertainty behavior, boundary/missing-data tests, and a passing release gate. Substantive interpretations go through the review queue before merge; passing tests alone does not authorize them.

## Limitations
Legacy rules are marked `legacy_unreviewed` pending professional review (REV-002). Source versions other than the zoning ordinance are tracked by verification date only. Live GIS and Feedback delivery must be verified by the owner (REV-006).
