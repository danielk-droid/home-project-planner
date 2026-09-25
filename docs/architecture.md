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
