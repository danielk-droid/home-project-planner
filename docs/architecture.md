# Architecture notes

Short reference for the assumptions the code and tests rely on. Product scope and evidence states are in `core-mvp.md`.

## Project identity and persistence (`src/project-state.js`)

- Each project gets a random id (`crypto.randomUUID`) when it is started. The id never comes from the address, project type, or answers, so two projects at the same address stay separate.
- Projects are saved only in the browser's `localStorage`, under `nhpp-project:<id>`. Nothing is sent to a server. Records expire 30 days after their last update.
- A plan is saved automatically when it is generated. Saving again with the same id updates the same record, so refreshing or reopening never makes a copy.
- **The storage key decides identity.** Older records with no id, or with an id that doesn't match their key, take the id from their key. This way, saving one again updates it in place.
- Each record is read and checked separately. A record with bad JSON, the wrong shape, or no resolved address is skipped, and the other records still load. If a field has the wrong type (answers, steps, clarifier state), it is replaced with an empty value. If a saved project can't be rebuilt into a plan, the app stays on the saved list and shows a message.
- "Start New Project" replaces the entire in-memory state with `createEmptyProjectState()`. It does not clear individual fields one by one.

## Regulatory decision layer (`src/core.js`)

```text
answers + Newton GIS property -> deriveProject (normalized facts)
  -> evaluateRules (deterministic, data/rules.json)
  -> result status: required | potentially_required | needs_confirmation
  -> sources resolved from data/sources.json (traceability)
```

- Rule conditions are small expressions: `path op literal` joined with `&&` / `||`, using the operators `== != < > <= >=`. `validateRules()` checks that every condition parses, every status is known, ids are unique, and every cited source exists. The test suite requires it to return no problems.
- A condition that can't be parsed is reported through `evaluationIssues` and is never treated as a normal "does not apply". A result whose cited source can't be found carries `missingSourceIds`.
- **Missing facts stay uncertain.** A `<`/`>` comparison against a missing fact (for example, Newton GIS returned no year built) is not decided. The rule stays in the plan, which matches the conservative outcome from before. It is tagged `indeterminateFacts`, and the result card explains that the item could not be ruled out. Numeric strings are compared as numbers.
- The planner does not make up regulatory rules. Rules change only when the repository has authoritative source material to support the change.

## Running tests

```text
npm test                              # full suite
node tests/source-monitor.test.mjs    # source monitor (run separately in CI)
```

## Zoning dimensional screen (Sec. 3.1.3 / 3.1.9)

- `src/zoning.js` + `data/zoning_dimensional.json` screen side/rear setbacks, lot coverage, height and FAR for single-family detached houses in SR1/SR2/SR3 only. Front setbacks are not screened (Sec. 1.5.3 averaging).
- Known limitations (not determined by HPP): building type is not asked, so the single-family scope is assumed rather than confirmed; front setback (Sec. 1.5.3 averaging); open space; the 2.5-story limit; the Sec. 1.5.7 Residential Facade Build Out Ratio added by Ord. C-67 (needs front-elevation width and primary frontage, which HPP does not collect). Values verified against Chapter 30 "Last Amended 12-01-25". Real Newton GIS browser flows and live Feedback delivery to the Google Sheet can only be verified from an environment that reaches gisweb.newtonma.gov and on the production deployment.
- Results feed `deriveProject()` as flat facts; the rules in `rules.json` (`zoning.*`) are the only place results are produced — there is no second engine.
- Each check is `within` / `exceeds` / `unknown` / `not_applicable`. Missing or malformed numbers are `unknown`, never zero. When lot creation date or roof type is unknown, every possible limit is evaluated and only an outcome shared by all of them is reported. The pre-1953 +0.02 FAR allowance depends on post-1953 setback compliance (including front), so ratios inside that band stay `unknown`.
- Boundaries: minimum setbacks comply at exactly the minimum; maximum coverage/height/FAR comply at exactly the maximum.
- `within` produces no card (the existing zoning review cards remain); `exceeds` is `potentially_required`; `unknown` / unsupported / unknown district is `needs_confirmation`.
- Values were verified against the City-published Chapter 30 edition labeled “Last Amended 12-01-25”; exact section provenance and the scoped C-67 review are recorded in `data/zoning_dimensional.json` (`humanVerificationRequired: false`). This does not eliminate project-specific City review or any documented omitted determination.

## Question uncertainty and feasibility summary

- `src/question-guidance.js` permits a follow-up only when its choices can resolve the original scope fact. Lot-creation era and roof type therefore remain explicitly uncertain instead of receiving an unrelated yes/no prompt.
- A building year is evidence about the structure, not the legal lot-creation date. The UI explains that distinction and does not infer one from the other.
- `src/feasibility.js` summarizes the existing deterministic rule results before the checklist/workflow choice. It never supplies a separate approval decision: exceeded limits, historic review, unsupported districts, and missing facts remain referrals to the relevant Newton office.

## Preliminary feasibility report

`src/feasibility-report.js` assembles the result-page feasibility report from the existing pipeline output only: `plan.project.zoningScreen` (statuses and limits produced by `src/zoning.js` from `data/zoning_dimensional.json`) and evaluated rule results from `data/rules.json`. It contains no thresholds and never recomputes a within/exceeds status. Dimension statuses are `within_evaluated_limit`, `potential_conflict`, `needs_confirmation` (with the missing input or unresolved fact named) and `not_evaluated` (front setback, open space, stories, facade ratio, nonconformities). Overall status: conflict > insufficient (no evaluated dimension) > within-but-needs-confirmation > compatible with evaluated limits; non-footprint projects show "screen not triggered". City questions (max 3) are generated only from actual unresolved items. Numbers are displayed with the fewest decimals that preserve the evaluated comparison. Design decision: front setback is always listed as a not-evaluated City question for screened projects, but does not by itself downgrade the "compatible with evaluated limits" status, because the status wording is explicitly limited to evaluated dimensions.
