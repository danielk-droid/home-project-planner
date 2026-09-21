# Regulatory monitoring

This layer monitors a curated set of official Newton and Massachusetts sources without allowing a changed webpage to silently rewrite the planner.

## Three layers

1. Raw source evidence: fetched text, timestamp, source URL, content hash, and changed excerpts.
2. HPP interpretation: explicit mapping from a source to known HPP rules.
3. Application mapping: affected project types and question IDs.

## Daily flow

Official source -> fetch -> normalize -> compare -> classify -> map to HPP -> safety gate -> review proposal -> tests.

The scheduled GitHub Action runs daily. A first run with no prior state is a baseline and does not generate proposals.

## Change classes

A_NO_MEANINGFUL_CHANGE
B_ADMINISTRATIVE_FORMATTING_CHANGE
C_INFORMATIONAL_IRRELEVANT_TO_HPP
D_RELEVANT_INFORMATIONAL_CHANGE
E_POTENTIALLY_REGULATORY_CHANGE
F_CLEAR_REGULATORY_CHANGE
G_AMBIGUOUS_CHANGE
SOURCE_UNAVAILABLE

The V1 safety policy is review-only. Even a primary-source change is not treated as permission for an automated legal interpretation. This is deliberate.

## State and auditability

The monitor keeps its durable state on the dedicated monitor-state branch and keeps detailed reports as GitHub Actions artifacts for 90 days. Git history preserves any later HPP data changes.

A source outage never deletes or weakens the last verified state.

## Sources

The registry starts with official Newton planning, zoning, permits, trade permits, fire, trees, conservation, historic preservation, FAR, inspections, closeout, energy, NewGov and checklist material, plus Massachusetts 780 CMR. Secondary sites are not used as regulatory authorities.

## Review

Potentially regulatory changes are represented with the source URL, old/new hashes, changed excerpts, affected HPP rules, affected questions, affected project types and the safety decision. V1 uses the GitHub Actions artifact as the detailed review record.

## Secrets

No credentials are stored in source. If email is added later, SMTP credentials belong in GitHub Actions secrets only.

## Rollback

Because production knowledge changes remain ordinary Git changes, a bad merged change can be reverted with Git and retested. The monitoring state is separate from production data.

## Adding a source

Add the official source to monitor/config/sources.json, give it an authority tier and parser, add topics and rule IDs, then add its mapping to monitor/config/knowledge-map.json and a fixture to monitor/tests.

