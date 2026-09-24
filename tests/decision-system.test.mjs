import assert from 'node:assert/strict';
import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import { validateRules, evaluateRules, evaluationIssues, buildPlan } from '../src/core.js';

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

// A missing numeric fact is uncertain, not a confident answer either way.
const ageRule = rules.find(r => r.id === 'property.historic-age');
assert.ok(ageRule, 'historic-age rule exists');
const withYear = y => evaluateRules(ctxFor({ yearBuilt: y }, { exteriorConstruction: true }), [ageRule]);
assert.equal(withYear(1920).length, 1);
assert.equal(withYear(1920)[0].indeterminateFacts, undefined);
assert.equal(withYear('1920').length, 1, 'numeric strings are compared as numbers');
assert.equal(withYear(2005).length, 0);
assert.equal(withYear('2005').length, 0);
for (const missing of [null, undefined, 'unknown', NaN]) {
  const r = withYear(missing);
  assert.equal(r.length, 1, `missing year (${missing}) keeps the review item`);
  assert.deepEqual(r[0].indeterminateFacts, ['property.yearBuilt']);
}
// The other half of the condition is still enforced.
assert.equal(evaluateRules(ctxFor({ yearBuilt: null }, { exteriorConstruction: false }), [ageRule]).length, 0);

// Every result in a real plan carries at least one resolved authoritative source,
// and uncertainty is surfaced on the plan.
const property = { resolvedAddress: '1 Test St', zoningDistrict: 'SR2', yearBuilt: null, historicExteriorReview: false, conservationPotential: false };
const plan = buildPlan('deck', property, { deckNew: 'yes', deckHeight: 4, stairsOrGuard: 'yes' });
assert.ok(plan.results.length > 0);
for (const r of plan.results) {
  assert.ok(r.sources.length > 0, `${r.id} has a source`);
  assert.equal(r.missingSourceIds, undefined, `${r.id} sources all resolve`);
}
assert.ok(plan.indeterminate.some(x => x.ruleId === 'property.historic-age'));
assert.deepEqual(plan.evaluationIssues, []);

console.log(`decision system tests: PASS (${rules.length} rules validated)`);
