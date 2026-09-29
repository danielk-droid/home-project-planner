# Final live test (REV-006)

REV-006 stays **open** until the owner completes both tests below on the deployed site and records the result in the private review repository. Automation never closes it.

Site: the current Production deployment of `main` (Vercel project `home-project-planner`, e.g. https://home-project-planner-5onycgphw-daniel-projects16.vercel.app or the production domain).

## Pre-check already performed by automation (2026-09-29, not a substitute)

- `GET /api/feedback` on the deployment returned `{"ok":true,"configured":true,"stage":"ready"}` (Google credentials and sheet access work).
- One labeled POST was accepted with `{"ok":true}`. Its feedback text begins `AUTOMATED RELEASE-QA TEST SUBMISSION 2026-09-29`, role Other, project "Testing/reviewing HPP". Delete that row after confirming it appears.
- Newton's property map (GIS) was unreachable from the automation environment, so no real address lookup was performed.

## 1. Property test

1. Open the site in a normal browser on a home or phone network.
2. Enter a real Newton single-family address you know (for example your own) and run the lookup.
3. Success looks like: the matched address, parcel details (zoning district such as SR1/SR2/SR3, lot area), year built if the City returns it, and historic/floodplain lines that say what the City map returned. No "lookup failed" message.
4. Choose **Addition**, answer the questions, and generate the plan. Confirm the feasibility report appears before the checklist and lists measurements against limits.
5. If it fails, record: the address, time, the exact message shown, and a screenshot. A failed lookup must show an error, never "not in a historic district" or "not in a floodplain".

## 2. Feedback test

1. On the same site open **Feedback**.
2. Choose any options; message: `Owner live test <date>`; leave email blank.
3. Submit. Expected: the form's success message; no error.
4. Open the private HPP Feedback Google Sheet: a new row with the time, your choices and the message should appear on the first tab (`Sheet1`).
5. If it fails, record: time, the message shown, and the result of opening `/api/feedback` in the browser (the `stage` value).

When both pass, mark REV-006 resolved in the private review repository and update `data/governance/review_index.json` through a reviewed PR.
