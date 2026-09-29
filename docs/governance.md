# HPP governance layer

HPP's trust chain: official source → source registry (tier, version) → rule (`data/rules.json`) → required facts with provenance → deterministic engine (`src/core.js`) → result + uncertainty → traceable explanation (`src/governance.js#traceResult`).

`src/governance.js` never decides applicability; it only audits. There is no second regulatory engine.

## Files
- `data/governance/source_registry.json` — authority tier (0 controlling law/code, 1 official City operational/GIS) and version label per source. Tier 4–5 sources are rejected for production rules.
- `data/governance/rule_registry.json` — human-governed metadata per rule: risk class (critical / high / moderate / abstention), human-review status, uncertainty companions, documented known gaps. Every critical rule must have a needs-confirmation companion or a documented gap.
- `data/governance/review_index.json` — review item IDs only. Review items, incidents and decision history live in the private repository `danielk-droid/hpp-governance-private` (GitHub-private; not served by the app). The release gate fails if either file reappears here. Earlier commits of this public repo still contain the old queue; it was checked and holds no secrets, credentials or personal data, so it is a harmless historical-public limitation (REV-007) — those copies are not private.
- `data/governance/release_record.json` — known-good commit and rollback path.
- `scripts/release-gate.mjs` — fails the build on registry drift, untraceable/ungoverned results, hidden uncertainty, non-finite numbers, or an open critical incident. Runs in `npm test` and CI.

## Fact provenance
`property.*` = City GIS, except fixed conservative defaults (`historicStatusUnknown`, `openPermitsUnknown`, ...) = system default; `answers.*` = user; `project.*` = derived deterministically.

## Change policy
Adding or changing a rule requires: official tier 0–1 source, registry entry, uncertainty behavior, boundary/missing-data tests, and a passing release gate. Substantive interpretations go through the review queue before merge; passing tests alone does not authorize them.

## Limitations
Legacy rules are marked `legacy_unreviewed` pending professional review (REV-002). Source versions other than the zoning ordinance are tracked by verification date only. Live GIS and Feedback delivery must be verified by the owner (REV-006).

## Enforced invariants (release gate)

- Every `high` or `critical` rule needs a real fallback — a `needs_confirmation` companion that fires on an explicit uncertainty signal (`*Uncertain`, `*Unknown`, `*Incomplete`, `*Boundary`, `*Unsupported` == true), proven by running it through the real `evaluateRules` and by seeing it fire from real answers in the gate sweep or a named test — or a public `knownGap: {reviewId, code}` tied to an OPEN review item (rationale prose stays private). `moderate` rules are exempt. Tested in `tests/governance-enforcement.test.mjs`.
- Every high/critical rule must fire in the gate sweep or be named in a test file.
- Every source carries `versionStatus`: only `newton-zoning-ordinance` is `VERSIONED` ("Last Amended 12-01-25"); all others are `DATE_VERIFIED_ONLY`. No effective date is claimed for any source. `ruleGovernance().evidenceVersioned` reports whether a rule rests on a versioned source.
- GIS overlay responses without a `features` array fail the lookup instead of reading as "not mapped".

- Sources marked `SOURCE_CONFLICT`/`SOURCE_UNAVAILABLE` cannot back a confident rule; future-effective or superseded sources fail the gate; tier 4–5 sources cannot back any rule. Tier 0–1 is required for every current rule because each one tells a homeowner what a City office or ordinance requires; no current rule relies on an explanatory source alone.
- Leak scan: the gate fails if any served file contains private review markers. `data/governance/review_index.json` carries only IDs, status and `openCriticalIncidents` (gate fails if non-empty).

Limitations: risk class affects fallback requirements, release enforcement and test coverage only — not change approval, incident severity or professional-review scheduling. Public CI cannot read the private repo, so it cannot confirm each public review ID exists there; the owner-side check `node scripts/verify-private-review.mjs <path-to-private-clone>` does that.

## Review states and launch blockers

`review_index.json` states: `open`, `owner_decided`, `professionally_reviewed`, `closed`. REV-002 (professional review of critical rules) and REV-006 (one live Newton lookup + one live Feedback submission) are `open` and `releaseBlocking`; the gate rejects closing or owner-deciding them, rejects any rule marked `professionally_reviewed` while REV-002 is not professionally reviewed, and prints them as public-launch blockers on every run. Automated tests are never professional or real-world validation. REV-003/004/005/007/008 are `owner_decided` (keep front-setback referral, keep facade-width limitation, keep GIS-only flood/wetland approach, accept historical public copies, keep minimal public metadata).

## External validation materials

- REV-002: `docs/professional-review-packet.md`, generated from the registries by `scripts/build-review-packet.mjs`; `npm test` fails if it is stale. It states that no rule is professionally reviewed.
- REV-006: `docs/live-validation-rev-006.md`, the owner live property + Feedback test.
