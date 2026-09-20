# Core MVP

## Product promise

The planner helps a Newton homeowner understand what may apply to a home project, what information they should prepare, what remains uncertain, and what to confirm with the City. It is not a permit application and never treats an unknown fact as approval or compliance.

## Flow

Address -> official Newton GIS -> PropertyContext -> adaptive questions -> uncertainty clarification -> deterministic rules -> preparation guidance -> dependency plan -> evidence-backed report.

## Adaptive questions

Questions are stored in `data/questions.json`.

Each question can be:
- a three-state choice: Yes / No / I'm not sure
- a numeric estimate
- conditionally shown based on earlier answers

"I'm not sure" is a real state. The rule engine preserves uncertainty and can create a confirmation item instead of silently converting it to No.

## Evidence states

- **Required**: the current rule conditions indicate this workflow should be considered applicable.
- **Potentially required**: additional project or site facts determine whether it applies.
- **Needs confirmation**: the planner lacks enough information to safely resolve the issue.

Every rule has source IDs. Important conclusions are not generated without provenance.

## Property resolution

The property resolver uses Newton's official Address layer first, then resolves the parcel spatially from the address-point geometry. A small spatial tolerance and address-field fallback handle GIS boundary/formatting imperfections. Zoning, historic-district, and floodplain checks are then made from the official GIS point.

## Deliberate limitations

The planner does not:
- issue permits
- determine final code compliance
- guarantee approval
- replace City staff
- infer missing dimensions or project facts
- treat an unanswered/uncertain question as No
- claim that the preparation list is the complete City application checklist

Newton's current application systems can require additional information or documents depending on project type and scope.

## Beta readiness target

Before external testing, verify:
1. representative Newton addresses resolve to a parcel;
2. all four project flows can be completed;
3. adaptive follow-up questions appear and disappear correctly;
4. uncertainty produces confirmation items rather than false certainty;
5. every displayed requirement has an official source;
6. the project report is understandable without an explanation from the developer;
7. the regression suite covers realistic combinations and edge cases;
8. mobile layout and print output are usable.

## V1 project types

- Basement finish
- Bathroom renovation
- Deck
- Residential addition

These are intentionally different enough to exercise interior, trade, exterior/site, and expansion workflows without attempting to cover every Newton project.
