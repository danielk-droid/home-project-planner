// Age-based historic pathways: general exterior Historic Review (> 50 years)
// and historic demolition review (>= 50 years), kept independent from each
// other and from the status-specific historic pathways.
import assert from 'node:assert/strict';
import { buildPlan, historicAgeFacts } from '../src/core.js';

const Y = new Date().getFullYear();
const base = { resolvedAddress: '1 Test St', zoningDistrict: 'SR2', historicDistrict: null, historicExteriorReview: false, conservationPotential: false };
const plan = (type, yearBuilt, answers = {}, extra = {}) => buildPlan(type, { ...base, yearBuilt, ...extra }, answers);
const get = (p, id) => p.results.find(r => r.id === id);
const EXT = 'property.historic-age', DEMO = 'property.historic-age-demolition';
const exterior = { primaryWorkArea: 'exterior', exteriorChange: 'yes', structuralChanges: 'no', demolition: 'no' };
const demo = { primaryWorkArea: 'interior', demolition: 'yes', structuralChanges: 'yes' };

// Exact boundary arithmetic with a fixed date (year-only data spans two ages).
const on = d => y => historicAgeFacts({ yearBuilt: y }, {}, new Date(d));
const f2026 = on('2026-09-25');
assert.deepEqual([f2026(1974).ageOver50, f2026(1975).ageOver50, f2026(1976).ageOver50], [true, false, false], '1976 is not > 50 in 2026');
assert.equal(f2026(1975).ageOver50Boundary, true, 'built 1975: 50 or 51 years old, boundary');
assert.equal(f2026(1976).ageOver50Boundary, false, 'built 1976: at most 50, not > 50');
assert.deepEqual([f2026(1975).ageAtLeast50, f2026(1976).ageAtLeast50, f2026(1977).ageAtLeast50], [true, false, false]);
assert.equal(f2026(1976).ageBoundaryUncertain, true, 'built 1976: 49 or 50 years old, demolition boundary');
assert.equal(f2026(1977).ageBoundaryUncertain, false);
assert.equal(on('2026-01-01')(null).ageUnknown, true);
assert.equal(historicAgeFacts({ yearBuilt: null }, { historicAgeKnown: 'yes' }).ageAtLeast50, true, 'owner-confirmed 50+ counts for demolition');

// 1. 1920 property + exterior addition -> independent age-based Historic Review.
let p = plan('addition', 1920);
assert.equal(get(p, EXT)?.status, 'potentially_required');
assert.match(get(p, EXT).action, /does not mean a Newton Historical Commission hearing or approval is required/);
assert.equal(get(p, DEMO), undefined, 'no demolition review without demolition scope');

// 2. Year exactly 51 years ago: may be 50 or 51 -> boundary confirmation, not a > 50 result.
p = plan('general_project', Y - 51, exterior);
assert.equal(get(p, EXT), undefined);
assert.equal(get(p, 'property.historic-age-boundary-exterior')?.status, 'needs_confirmation');
p = plan('general_project', Y - 52, exterior);
assert.equal(get(p, EXT)?.status, 'potentially_required', 'established > 50 triggers');

// 3. Exactly 50 (built Y-50, at most 50) + exterior alteration -> general rule not triggered.
p = plan('general_project', Y - 50, exterior);
assert.equal(get(p, EXT), undefined);
assert.equal(get(p, 'property.historic-age-boundary-exterior'), undefined);

// 4. > 50 + demolition -> demolition review REQUIRED.
assert.equal(get(plan('general_project', 1920, demo), DEMO)?.status, 'required');
// 5. Exactly 50 + demolition -> REQUIRED when the age is established (owner confirms 50+);
//    year-only data at the boundary asks for confirmation without also claiming Required.
assert.equal(get(plan('general_project', Y - 50, { ...demo, historicAgeKnown: 'yes' }), DEMO)?.status, 'required');
assert.equal(get(plan('general_project', Y - 51, demo), DEMO)?.status, 'required', 'at least 50 on every date of the year');
p = plan('general_project', Y - 50, demo);
assert.equal(get(p, DEMO), undefined);
assert.equal(get(p, 'project.age-boundary-uncertain')?.status, 'needs_confirmation');
// 6. < 50 + demolition -> not triggered.
assert.equal(get(plan('general_project', Y - 20, demo), DEMO), undefined);
assert.equal(get(plan('general_project', 1920, { ...demo, historicAgeKnown: 'no' }), DEMO), undefined, 'owner-confirmed under 50');

// 7. Missing year built + exterior work -> NEEDS_CONFIRMATION, never a silent no-result.
for (const y of [null, undefined, '', 'unknown']) {
  p = plan('general_project', y, exterior);
  assert.equal(get(p, EXT), undefined);
  assert.equal(get(p, 'property.historic-age-unknown')?.status, 'needs_confirmation');
}
assert.equal(get(plan('general_project', null, demo), 'property.historic-age-unknown')?.status, 'needs_confirmation');
assert.equal(get(plan('general_project', null, { ...demo, historicAgeKnown: 'yes' }), 'property.historic-age-unknown'), undefined);
assert.equal(get(plan('basement_finish', null, { exteriorChange: 'no', siteWork: 'no', demolition: 'no' }), 'property.historic-age-unknown'), undefined, 'interior-only work is unaffected');

// 8. Addition + qualifying partial demolition -> both pathways independently.
p = plan('addition', 1920, { demolition: 'yes' });
assert.equal(get(p, EXT)?.status, 'potentially_required');
assert.equal(get(p, DEMO)?.status, 'required');

// 9/10. Status-specific pathways stay independent of age.
p = plan('general_project', Y - 10, exterior, { historicDistrict: 'Newtonville', historicExteriorReview: true });
assert.equal(get(p, 'property.historic')?.status, 'required');
assert.equal(get(p, EXT), undefined);
p = plan('general_project', Y - 10, { ...exterior, historicLocalLandmark: 'yes' });
assert.equal(get(p, 'property.local-landmark')?.status, 'required');
assert.equal(get(p, EXT), undefined);
p = plan('general_project', 1920, { ...exterior, historicLocalLandmark: 'yes' });
assert.ok(get(p, 'property.local-landmark') && get(p, EXT), 'landmark and age pathways both appear');

console.log('historic age pathway tests: PASS');
