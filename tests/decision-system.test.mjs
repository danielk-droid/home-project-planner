import assert from 'node:assert/strict';
import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import { validateRules, evaluateRules, evaluationIssues, buildPlan } from '../src/core.js';
import { actionForResult, HISTORIC_AGE_UNKNOWN_ACTION } from '../src/result-presentation.js';

// The shipped rule set must be fully evaluable and fully traceable.
assert.deepEqual(validateRules(), []);
assert.deepEqual(evaluationIssues(), []);

// Malformed definitions are detected, not silently treated as "no match".
const bad = [
  { id: 'x.parse', when: 'property.zoningDistrict ~= R1', status: 'required', sourceIds: ['newton-zoning'] },
  { id: 'x.empty', when: '', status: 'required', sourceIds: ['newton-zoning'] },
  { id: 'x.source', when: 'project.deckNew == true', status: 'required', sourceIds: ['not-a-source'] },
  { id: 'x.status', when: 'project.deckNew == true', status: 'maybe', sourceIds: ['newton-zoning'] },
  { id: 'x.status', when: 'project.deckNew == true', status: 'required', sourceIds: [] }
];
const problems = validateRules(bad, sources).join('\n');
for (const expected of ['x.parse: condition cannot be parsed', 'x.empty: condition cannot be parsed',
  'x.source: unknown source not-a-source', 'x.status: unknown status maybe', 'x.status: duplicate id', 'x.status: no sources']) {
  assert.ok(problems.includes(expected), `missing problem: ${expected}`);
}
assert.equal(evaluationIssues(bad).length, 2);

// Evaluation never throws on missing facts and never drops a rule's source trace.
const ctxFor = (property, project) => ({ property, project, answers: {} });
assert.doesNotThrow(() => evaluateRules({}));
assert.doesNotThrow(() => evaluateRules(ctxFor(null, null)));
const unknownSource = evaluateRules({ project: { deckNew: true } }, [bad[2]]);
assert.deepEqual(unknownSource[0].missingSourceIds, ['not-a-source']);

// A missing year built is uncertain, not a confident answer either way. The
// general age-based rule now evaluates explicit age facts, so a missing year
// surfaces as its own needs_confirmation item instead of an indeterminate match.
const ageRule = rules.find(r => r.id === 'property.historic-age');
const unknownAgeRule = rules.find(r => r.id === 'property.historic-age-unknown');
assert.ok(ageRule, 'historic-age rule exists');
assert.ok(unknownAgeRule, 'historic-age-unknown rule exists');
const thisYear = new Date().getFullYear();
const agePlan = y => buildPlan('addition', { resolvedAddress: '1 Test St', zoningDistrict: 'SR2', yearBuilt: y }, {});
const ageResult = (y, id = 'property.historic-age') => agePlan(y).results.find(r => r.id === id);
assert.ok(ageResult(1920));
assert.equal(ageResult(1920).indeterminateFacts, undefined);
assert.equal(actionForResult(ageResult(1920)), ageRule.action, 'older property keeps the rule explanation');
assert.ok(ageResult('1920'), 'numeric strings are read as years');
assert.equal(ageResult(2005), undefined);
assert.equal(ageResult('2005'), undefined);
for (const missing of [null, undefined, 'unknown', NaN]) {
  assert.equal(ageResult(missing), undefined, `missing year (${missing}) never asserts the building is over 50`);
  const r = ageResult(missing, 'property.historic-age-unknown');
  assert.ok(r, `missing year (${missing}) keeps a building-age review item`);
  assert.equal(r.status, 'needs_confirmation');
  const action = actionForResult(r);
  assert.match(action, /year-built information was not returned/i);
  assert.match(action, /building-age condition could not be established/i);
  assert.doesNotMatch(action, /indicates a building (older|more) than 50 years/i);
}
// The presentation fallback from PR #11 still guards any indeterminate result.
assert.equal(actionForResult({ id: 'property.historic-age', action: ageRule.action, indeterminateFacts: ['property.yearBuilt'] }), HISTORIC_AGE_UNKNOWN_ACTION);
// The other half of the condition is still enforced.
assert.equal(ageResult(thisYear - 10), undefined, 'a building under 50 years old keeps the existing no-result behavior');
assert.equal(evaluateRules({ property: {}, project: { ageUnknown: true, exteriorConstruction: false, demolition: false } }, [unknownAgeRule]).length, 0);

// Every result in a real plan carries at least one resolved authoritative source,
// and uncertainty is surfaced on the plan.
const property = { resolvedAddress: '1 Test St', zoningDistrict: 'SR2', yearBuilt: null, historicExteriorReview: false, conservationPotential: false };
const plan = buildPlan('deck', property, { deckNew: 'yes', deckHeight: 4, stairsOrGuard: 'yes' });
assert.ok(plan.results.length > 0);
for (const r of plan.results) {
  assert.ok(r.sources.length > 0, `${r.id} has a source`);
  assert.equal(r.missingSourceIds, undefined, `${r.id} sources all resolve`);
}
assert.equal(plan.results.find(r => r.id === 'property.historic-age-unknown')?.status, 'needs_confirmation');
assert.deepEqual(plan.evaluationIssues, []);

// Explicit negative GIS facts are negative; only positive facts trigger these
// property pathways. Missing GIS facts remain covered by their uncertainty
// rules and must never become false-positive requirements.
const negativePropertyPlan = buildPlan('addition', {
  resolvedAddress: '1 Test St', zoningDistrict: 'SR2', lotSizeSqFt: 10000,
  yearBuilt: 2005, floodplain: false, historicDistrict: null,
  historicExteriorReview: false, historicStatusUnknown: false,
  conservationPotential: false, openPermitsUnknown: false
}, {
  newArea: 400, stories: 1, zoningLotEra: 'on_or_after_1953',
  zoningSideSetbackFt: 15, zoningRearSetbackFt: 15,
  zoningRoofType: 'sloped', zoningHeightFt: 36,
  zoningTotalFloorAreaSqFt: 3800, zoningTotalCoverageSqFt: 2000
});
assert.equal(negativePropertyPlan.results.find(r => r.id === 'property.floodplain'), undefined);
assert.equal(negativePropertyPlan.results.find(r => r.id === 'property.historic'), undefined);

console.log(`decision system tests: PASS (${rules.length} rules validated)`);
