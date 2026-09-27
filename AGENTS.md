# Engineering rules

- Keep question clarification logic in `src/question-guidance.js` so semantic uncertainty behavior is testable without a browser.
- Derive the feasibility-first summary from deterministic plan results in `src/feasibility.js`; never create a second regulatory engine.
- Treat Newton building year and legal lot-creation date as separate facts; never infer one from the other.
- Human review items and incidents live only in the private repo danielk-droid/hpp-governance-private — the main repo is public, so it keeps IDs only.
