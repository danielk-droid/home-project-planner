# HPP Regulatory Rule Inventory Audit — 2026-09-23

## Status

Structured inventory created for TECH consumption. No frontend/application rules/questions were modified.

- Inventory: `data/regulatory_rule_inventory_2026-09-23.json`
- Rules: **54**
- Deterministic rules: **45**
- Rules requiring confirmation/unknown-state handling: **49**
- Rules flagged for professional review before authoritative publication: **18**
- Verification date: **2026-09-23**
- Scope: Newton residential renovation/planning pathways currently represented in HPP, plus Massachusetts code where applicable.

## Highest-risk rules for professional validation

1. Building-permit applicability and exemptions (BLD-001)
2. Structural alteration classification (BLD-003)
3. Demolition classification and interaction with historic review (BLD-004)
4. Zoning use/change-of-use determinations (ZON-001)
5. Setback compliance (ZON-003)
6. Height/story/dimensional calculations (ZON-004)
7. Dwelling-unit/ADU classification (ZON-006)
8. Mechanical/HVAC permit classification (MEC-001)
9. Fire review workflow and advance-approval timing (FIR-001)
10. Fire-protection-system document/permit classification (FIR-003)
11. National Register review scope (HIS-004)
12. 50+ year demolition/partial-demolition interpretation (HIS-005)
13. Stormwater threshold interaction and exemptions (STM-001)
14. Newton fossil-free major-renovation classification (ENE-002)
15. Basement EERO applicability (EER-001)
16. Basement sleeping-room EERO (EER-002)
17. EERO dimensional/exception compliance (EER-003)
18. Water/sewer checklist trigger (ENG-002)

These are not necessarily legally ambiguous. They are flagged because an incorrect automated interpretation could produce a materially wrong permitting instruction, because multiple facts/interacting rules must be evaluated, or because the authoritative public material does not provide a complete deterministic matrix.

## Unresolved research gaps

- Newton does not publish a complete homeowner-facing equipment-by-equipment mechanical permit matrix. Keep HVAC permit classification conditional until Newton confirms the exact matrix.
- Newton Fire's current plan-review webpage broadly states that all building-permit applications require Fire approval, while the detailed Rev. 2/2024 Fire requirements describe scope-dependent advance approval and say ISD determines whether approval is required for issuance. Preserve both facts; do not collapse them into a universal standalone Fire permit.
- Complete zoning decision logic for every interior alteration, nonconforming condition, and special-permit interaction is not established by the reviewed public guidance.
- Historic age language is not perfectly uniform ("over 50 years" versus "50 years old or older"). Do not use a simplistic date subtraction as the sole legal classifier.
- Stormwater exceptions/waivers were not exhaustively modeled. Thresholds are verified; exemption/waiver logic remains source-driven.
- Water/sewer triggers in the building checklist are useful screening rules but the checklist itself should not be promoted to a standalone ordinance without current Engineering confirmation.
- 780 CMR contains many fact-specific exceptions. EERO, fire/life-safety, energy, structural and existing-building determinations should retain a professional-review path when required facts are incomplete.

## Exact recommendations for TECH

### 1. Treat the JSON as a rule registry, not prose content

Implement each rule as an immutable rule record with:

- `id`
- `question`
- `jurisdiction`
- `authority`
- `sourceUrl`
- `sourceSection`
- `effectiveOrVerified`
- `triggeringFacts`
- `requiredFacts`
- `unknownHandling`
- `result`
- `versionOrEffectiveDate`
- `exceptions`
- `boundaryConditions`
- `deterministicAutomation`
- `professionalReview`

### 2. Never convert missing facts into NO

If a required fact is unknown, return `NEEDS_CONFIRMATION` or `CONDITIONAL` according to the rule record. Do not default unknown property status, tree status, historic status, floodplain status, dimensions, or permit scope to false.

### 3. Separate pathways

Keep these as independent outputs that can coexist:

- building
- zoning/use/dimensional
- trade
- mechanical
- Fire
- historic
- tree
- conservation/floodplain/wetlands
- stormwater
- energy/fossil-free
- Engineering/water/sewer
- inspections
- closeout/open permits

### 4. Preserve threshold boundaries exactly

For numeric rules, implement explicit comparison operators and tests around the boundary:

- tree DBH: 5.99 / 6 / 6.01 in
- wetland buffer: 99 / 100 / 101 ft
- perennial-stream buffer: 199 / 200 / 201 ft
- stormwater land disturbance: 4,999 / 5,000 / 5,001 sq ft
- new impervious area: 400 / 401 / 1,000 / 1,001 sq ft
- minor residential disturbance: 21,780 / 21,781 sq ft
- major-renovation thresholds: exact 1,000-sq-ft and percentage boundaries
- 50+ year historic rules: preserve the City's current age classification rather than inventing a birthday calculation.

### 5. Model status dimensions independently

Do not use a single `historic=true` flag. Store at minimum:

- local historic district
- Local Landmark
- Preservation Restriction
- National Register
- age/historic-review classification

Likewise keep floodplain, wetlands/resource area, tree-protection status, zoning district, nonconformity, and dwelling-unit status separate.

### 6. Make source/version metadata executable

Every rule should retain its authoritative URL and verification/effective date. A future monitoring process should invalidate or re-review rules when the source changes.

### 7. Add a professional-review gate

For records with `professionalReview = Yes`, HPP should not present a definitive legal/compliance conclusion from incomplete facts. It can present the verified rule, the known trigger, and the missing facts, and route the user to the responsible authority/professional.

### 8. Keep screening evidence distinct from legal determinations

Newton GIS, assessor data, permit-search records, and public FAQs can be used to collect facts and screen pathways. They should not automatically be treated as the final legal determination where the City identifies an application/review process.

### 9. Do not infer absent pathways

The inventory is a rule registry for currently represented HPP pathways. Do not add new project categories or questions merely because a source mentions an unrelated permit type.

## Authoritative source set

The inventory uses current official Newton and Massachusetts sources, including Newton ISD, Planning & Development, Fire, Engineering, Conservation, Urban Forestry, Historic Preservation, Newton GIS, the current Newton Zoning Ordinance, Massachusetts 780 CMR/BBRS, and Massachusetts energy/electrical-code materials.

Key source pages include:

- Newton ISD: https://www.newtonma.gov/government/inspectional-services
- Newton electrical/plumbing/gas: https://www.newtonma.gov/government/inspectional-services/plumbing-gas-and-electrical
- Newton Fire Plan Reviews: https://www.newtonma.gov/government/fire/fire-prevention/plan-reviews
- Newton Planning: https://www.newtonma.gov/government/planning
- Newton ZBA/NewGov planning process: https://www.newtonma.gov/government/planning/zoning-board-of-appeals
- Newton FAR FAQ: https://apps.newtonma.gov/apps/far/FARfaqs.htm
- Newton Historic Preservation: https://www.newtonma.gov/government/planning/historic-preservation
- Newton Wetlands: https://www.newtonma.gov/government/planning/divisions/conservation-office/wetlands-permitting-rev
- Newton Floodplains/Stormwater: https://www.newtonma.gov/government/planning/conservation-office/floodplains-and-stormwater
- Newton Tree Preservation: https://www.newtonma.gov/government/parks-recreation-culture/urban-forestry/tree-preservation-ordinance
- Newton Energy Code: https://www.newtonma.gov/government/inspectional-services/energy-code
- Newton Inspection Requests: https://www.newtonma.gov/government/inspectional-services/inspection-requests-2376
- Newton Close Open Permits: https://www.newtonma.gov/government/inspectional-services/how-to-close-open-permits
- Newton GIS: https://gisweb.newtonma.gov/browser.html
- Massachusetts Building Code: https://www.mass.gov/handbook/tenth-edition-of-the-ma-state-building-code-780
- Massachusetts Building Energy Codes: https://www.mass.gov/info-details/massachusetts-building-energy-codes
- BBRS EERO interpretation 2026-08: https://www.mass.gov/info-details/bbrs-official-interpretation-no-2026-08-rfi-bulkheads-and-emergency-escape-rescue-openings
