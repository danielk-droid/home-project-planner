// PR #5 stormwater rules combined with the PR #11 missing-data evaluator.
// A missing square-footage measurement must never satisfy a stormwater
// threshold; it is surfaced through the explicit uncertainty rule instead.
import assert from 'node:assert/strict';
import rules from '../data/rules.json' with { type: 'json' };
import { buildPlan, evaluateRules } from '../src/core.js';

const property = { resolvedAddress: '1 Test St', zoningDistrict: 'SR2', yearBuilt: 1990, historicDistrict: null, historicExteriorReview: false, conservationPotential: false };
const THRESHOLD = ['project.stormwater-land-disturbance', 'project.stormwater-minor-impervious', 'project.stormwater-major-impervious'];
const ids = p => p.results.map(r => r.id);
const requiredStormwater = p => p.results.filter(r => r.id.startsWith('project.stormwater') && r.status === 'required').map(r => r.id);
const thresholdHits = p => ids(p).filter(id => THRESHOLD.includes(id));
const site = extra => ({ primaryWorkArea: 'site', siteWork: 'yes', exteriorChange: 'yes', landDisturbanceKnown: 'yes', retainingWallNew: 'no', trenchDewatering: 'no', ...extra });

// 1. Interior renovation, no site work, no stormwater facts.
let p = buildPlan('basement_finish', property, { exteriorChange: 'no', siteWork: 'no' });
assert.deepEqual(requiredStormwater(p), [], 'interior renovation: no Required stormwater');
assert.ok(!ids(p).includes('project.stormwater-uncertain'));

// 2. HVAC/mechanical-only, no site work.
p = buildPlan('general_project', property, { primaryWorkArea: 'interior', mechanicalWork: 'yes', systemType: 'hvac', mechanicalExterior: 'no', exteriorChange: 'no', siteWork: 'no' });
assert.deepEqual(requiredStormwater(p), [], 'HVAC-only: no Required stormwater');
assert.deepEqual(thresholdHits(p), []);

// 3. Exterior project, stormwater relevant, measurements missing.
p = buildPlan('general_project', property, { primaryWorkArea: 'site', siteWork: 'yes', exteriorChange: 'yes' });
assert.deepEqual(thresholdHits(p), [], 'missing measurements never meet a threshold');
const unc = p.results.find(r => r.id === 'project.stormwater-uncertain');
assert.ok(unc, 'missing measurements produce the explicit confirmation item');
assert.equal(unc.status, 'needs_confirmation');
p = buildPlan('addition', property, {});
assert.deepEqual(thresholdHits(p), [], 'addition without measurements: no threshold result');
assert.equal(p.results.find(r => r.id === 'project.stormwater-uncertain')?.status, 'needs_confirmation');

// 4/5. Known disturbance below / above threshold (thresholds unchanged).
assert.ok(!ids(buildPlan('general_project', property, site({ landDisturbanceSqFt: 5000, newImperviousSqFt: 0 }))).includes('project.stormwater-land-disturbance'));
p = buildPlan('general_project', property, site({ landDisturbanceSqFt: 5001, newImperviousSqFt: 0 }));
assert.equal(p.results.find(r => r.id === 'project.stormwater-land-disturbance')?.status, 'required');

// 6/7. Known new impervious area below / within / above thresholds.
p = buildPlan('general_project', property, site({ landDisturbanceSqFt: 100, newImperviousSqFt: 400 }));
assert.deepEqual(thresholdHits(p), [], '400 sq ft impervious: no threshold result');
p = buildPlan('general_project', property, site({ landDisturbanceSqFt: 500, newImperviousSqFt: 401 }));
assert.equal(p.results.find(r => r.id === 'project.stormwater-minor-impervious')?.status, 'required');
p = buildPlan('general_project', property, site({ landDisturbanceSqFt: 1500, newImperviousSqFt: 1001 }));
assert.equal(p.results.find(r => r.id === 'project.stormwater-major-impervious')?.status, 'required');
assert.ok(!ids(p).includes('project.stormwater-minor-impervious'));

// Only one measurement known: the missing one cannot trigger its thresholds.
p = buildPlan('general_project', property, site({ landDisturbanceSqFt: 200 }));
assert.deepEqual(thresholdHits(p), []);

// 8. Addition + HVAC + electrical, stormwater measurements missing.
p = buildPlan('addition', property, { mechanicalWork: 'yes', systemType: 'hvac', electricalWork: 'yes', exteriorChange: 'yes' });
assert.deepEqual(requiredStormwater(p).filter(id => THRESHOLD.includes(id)), [], 'combined scope: no false Required threshold');
assert.equal(p.results.find(r => r.id === 'project.stormwater-uncertain')?.status, 'needs_confirmation');

// 9. The evaluator itself still treats a missing numeric fact as indeterminate
// (PR #11 behavior is not changed globally), rather than true/false by coercion.
const bare = { id: 'x', when: 'project.n > 5', status: 'required', sourceIds: rules[0].sourceIds };
for (const missing of [null, undefined, '', 'abc', NaN]) {
  const r = evaluateRules({ project: { n: missing } }, [bare]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].indeterminateFacts, ['project.n']);
}
assert.equal(evaluateRules({ project: { n: 3 } }, [bare]).length, 0);
assert.equal(evaluateRules({ project: { n: 6 } }, [bare])[0].indeterminateFacts, undefined);
// ...while the guarded stormwater rules never fire on a missing value.
for (const id of THRESHOLD) {
  const rule = rules.find(r => r.id === id);
  for (const missing of [null, undefined, '', 'abc', NaN]) {
    const ctx = { project: { landDisturbanceSqFt: missing, newImperviousSqFt: missing, landDisturbanceSqFtKnown: false, newImperviousSqFtKnown: false } };
    assert.equal(evaluateRules(ctx, [rule]).length, 0, `${id} with ${missing}`);
  }
}

console.log('stormwater integration tests: PASS');
