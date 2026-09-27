// Adversarial inputs. Each case asserts HPP never becomes more confident than
// its inputs allow: no crashes, no NaN, no silent "within limits", no
// untraceable results, no missing value treated as a pass.
import assert from 'node:assert/strict';
import { buildPlan, PROJECTS } from '../src/core.js';
import { auditPlan } from '../src/governance.js';
import { feasibilityReport } from '../src/feasibility-report.js';

const base = {resolvedAddress: 'SYNTHETIC TEST ONLY', zoningDistrict: 'SR2', lotSizeSqFt: 10000, yearBuilt: 1990, historicDistrict: null, historicExteriorReview: false, historicStatusUnknown: false, floodplain: false, conservationPotential: false, openPermitsUnknown: false};
const hostile = [null, undefined, '', ' ', 'NaN', 'Infinity', '-5', '0', '1e9', 'abc', -1, 0, NaN, Infinity, 1e12, '__proto__', {}, []];

let count = 0;
for (const projectType of Object.keys(PROJECTS)) {
  for (const v of hostile) {
    const answers = {};
    for (const q of PROJECTS[projectType].questions) answers[q.id] = v;
    const plan = buildPlan(projectType, base, answers);
    assert.deepEqual(auditPlan(plan), [], `${projectType} with ${String(v)}`);
    const report = feasibilityReport(plan);
    for (const d of report?.dimensions || []) {
      if (d.status === 'within_evaluated_limit') {
        assert.ok(Number.isFinite(Number(d.proposed ?? d.proposedValue)), 'within requires a finite proposed value');
      }
    }
    assert.notEqual(report?.overall, 'compatible', `${projectType}: hostile value ${String(v)} must not yield "compatible"`);
    count++;
  }
}

// Hostile property data: missing/garbage GIS facts must not remove pathways silently.
for (const bad of [{}, {zoningDistrict: 'ZZ9'}, {zoningDistrict: null, lotSizeSqFt: -100}, {lotSizeSqFt: 'lots'}, {yearBuilt: 'old'}, {yearBuilt: 3000}]) {
  const plan = buildPlan('addition', {...base, ...bad}, {newArea: 500, stories: 1});
  assert.deepEqual(auditPlan(plan), []);
  const report = feasibilityReport(plan);
  assert.notEqual(report?.overall, 'compatible', `garbage property ${JSON.stringify(bad)} must not be compatible`);
}

// Missing year built never reads as "under 50".
const noYear = buildPlan('addition', {...base, yearBuilt: null}, {newArea: 300, stories: 1});
assert.ok(noYear.results.some(r => r.id === 'property.historic-age-unknown'));

// Prototype pollution through answers must not leak into the engine.
buildPlan('addition', base, JSON.parse('{"__proto__": {"buildingWork": true}, "newArea": 10}'));
assert.equal(({}).buildingWork, undefined);

console.log(`red-team tests passed (${count} hostile flow cases)`);
