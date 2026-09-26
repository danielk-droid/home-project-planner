// Preliminary feasibility report: consumes the existing zoning screen and rule
// results; all fixtures are SYNTHETIC test data, not real Newton properties.
import assert from 'node:assert/strict';
import { buildPlan } from '../src/core.js';
import { feasibilityReport, STATUS, formatNumber } from '../src/feasibility-report.js';
import { maxFar, ZONING_TABLE } from '../src/zoning.js';

const property = {resolvedAddress:'SYNTHETIC TEST ONLY', zoningDistrict:'SR2', lotSizeSqFt:10000, yearBuilt:2000, historicDistrict:null, historicExteriorReview:false, historicStatusUnknown:false, floodplain:false, conservationPotential:false, openPermitsUnknown:false};
const sr2 = ZONING_TABLE.districts.SR2;
const farMax = maxFar('SR2', 10000);
const base = {newArea:400, stories:1, zoningLotEra:'on_or_after_1953', zoningSideSetbackFt:20, zoningRearSetbackFt:20, zoningRoofType:'sloped', zoningHeightFt:28, zoningTotalFloorAreaSqFt:Math.floor(farMax*10000) - 200, zoningTotalCoverageSqFt:1500};
const rep = (answers, prop = property, type = 'addition') => feasibilityReport(buildPlan(type, prop, answers));
const dim = (r, m) => r.dimensions.find(d => d.metric === m);
const BANNED = /\b(illegal|rejected|denied|will not be approved|guaranteed|approved)\b/i;

function integrity(r) {
  const text = JSON.stringify(r);
  assert.ok(!/undefined|NaN/.test(text), 'no undefined/NaN in report');
  assert.ok(!BANNED.test(text.replace(/not a zoning determination, permit approval/g, '')), 'no approval/illegal language');
  assert.equal(new Set(r.dimensions.map(d => d.metric)).size, r.dimensions.length, 'no duplicate dimensions');
  assert.equal(new Set(r.askNewton).size, r.askNewton.length, 'no duplicate questions');
  assert.ok(r.askNewton.length <= 3);
  for (const q of r.askNewton) assert.ok(!/is my project allowed/i.test(q));
  if (r.overall === 'compatible') assert.equal(r.dimensions.filter(d => d.status !== STATUS.WITHIN).length, 0);
  if (r.dimensions.some(d => d.status === STATUS.CONFLICT)) assert.equal(r.overall, 'conflict');
}

// Fully known, within every limit.
let r = rep(base);
integrity(r);
assert.equal(r.dimensions.length, 5);
for (const d of r.dimensions) { assert.equal(d.status, STATUS.WITHIN, d.metric); assert.ok(d.proposedValue != null && d.applicableLimit != null && d.difference != null); }
assert.equal(dim(r, 'side_setback').applicableLimit, sr2.setbacks.on_or_after_1953.side);
assert.equal(dim(r, 'height').applicableLimit, sr2.heightFt.sloped);
assert.equal(dim(r, 'far').applicableLimit, farMax);
assert.equal(dim(r, 'height').difference, sr2.heightFt.sloped - 28);
assert.match(dim(r, 'height').explanation, /below the applicable maximum/);
assert.ok(!r.askNewton.some(q => /lot|height|roof|floor area/i.test(q)), 'no questions for determined dimensions');
assert.ok(r.askNewton.some(q => /front setback/i.test(q)), 'front setback always an explicit unresolved item');
assert.ok(!r.dimensions.some(d => /front/i.test(d.label)), 'no fabricated front-setback result');
assert.match(r.limitations, /not a zoning determination, permit approval/);

// Exceeding one limit.
const covLimit = sr2.lotCoveragePct.on_or_after_1953;
r = rep({...base, zoningTotalCoverageSqFt: (covLimit + 4) * 100});
integrity(r);
assert.equal(r.overall, 'conflict');
const c = dim(r, 'lot_coverage');
assert.equal(c.status, STATUS.CONFLICT);
assert.equal(c.proposedValue, covLimit + 4);
assert.equal(c.difference, 4);
assert.match(c.explanation, /above the applicable maximum.*by 4 percentage points\. Zoning relief may be needed/);
assert.equal(r.keyIssues.conflicts.length, 1);

// Missing measurement.
r = rep({...base, zoningTotalFloorAreaSqFt: null});
integrity(r);
assert.equal(dim(r, 'far').status, STATUS.NEEDS_CONFIRMATION);
assert.match(dim(r, 'far').explanation, /proposed total floor area is unavailable/);
assert.equal(dim(r, 'far').proposedValue, null);
assert.ok(r.informationNeeded.some(t => /gross floor area/i.test(t)));
assert.equal(r.overall, 'within_needs_confirmation');
r = rep({...base, zoningTotalFloorAreaSqFt:null, zoningTotalCoverageSqFt:null, zoningSideSetbackFt:null, zoningRearSetbackFt:null, zoningHeightFt:null});
integrity(r);
assert.equal(r.overall, 'insufficient');

// Unknown lot era: no inference from year built (1942 building).
r = rep({...base, zoningLotEra:'unsure', zoningSideSetbackFt:10}, {...property, yearBuilt:1942});
integrity(r);
assert.equal(r.snapshot.lotEra, null);
assert.equal(dim(r, 'side_setback').status, STATUS.NEEDS_CONFIRMATION);
assert.match(dim(r, 'side_setback').explanation, /lot creation date/);
assert.ok(r.askNewton.some(q => /December 7, 1953/.test(q)));
assert.ok(r.informationNeeded.some(t => /not the building’s year built/.test(t)));
// Unknown era where every possible limit agrees stays determined but shows the range.
r = rep({...base, zoningLotEra:'unsure'});
assert.equal(dim(r, 'side_setback').status, STATUS.WITHIN);
assert.match(dim(r, 'side_setback').limitDisplay, /depends on unresolved facts/);

// Unknown roof type.
r = rep({...base, zoningRoofType:'unsure', zoningHeightFt: sr2.heightFt.flat + 1});
integrity(r);
assert.equal(dim(r, 'height').status, STATUS.NEEDS_CONFIRMATION);
assert.match(dim(r, 'height').explanation, /roof type is not established/);
assert.ok(!JSON.stringify(r).includes('Which part of this work is involved'));

// Historic: existing logic surfaces unchanged.
r = rep(base, {...property, yearBuilt:1900});
integrity(r);
assert.ok(r.considerations.historic.some(h => h.ruleId === 'property.historic-age'));
r = rep(base, {...property, yearBuilt:null});
assert.ok(r.considerations.historicUnresolved.some(h => h.ruleId === 'property.historic-age-unknown'));
assert.ok(r.askNewton.length <= 3);
assert.ok(r.confirmations.some(x => x.issue === 'Historic review applicability'));

// Stormwater: missing measurements never become threshold matches.
r = rep(base);
assert.ok(!r.considerations.stormwater.some(s => s.status === 'required'));

// Permit pathway intact.
r = rep(base);
assert.ok(r.considerations.permits.some(p => p.ruleId === 'project.building'));

// Unsupported / unknown district.
r = rep(base, {...property, zoningDistrict:'MR1'});
integrity(r);
assert.equal(r.dimensions.length, 0);
assert.equal(r.overall, 'insufficient');
assert.ok(r.askNewton[0].includes('MR1'));
r = rep(base, {...property, zoningDistrict:null});
assert.equal(r.dimensions.length, 0);
assert.match(r.askNewton[0], /Which zoning district/);

// Exact boundaries and just over / under.
const side = sr2.setbacks.on_or_after_1953.side;
assert.equal(dim(rep({...base, zoningSideSetbackFt: side}), 'side_setback').status, STATUS.WITHIN);
assert.match(dim(rep({...base, zoningSideSetbackFt: side}), 'side_setback').explanation, /exactly at/);
assert.equal(dim(rep({...base, zoningSideSetbackFt: side - 0.1}), 'side_setback').status, STATUS.CONFLICT);
assert.equal(dim(rep({...base, zoningSideSetbackFt: side + 0.1}), 'side_setback').status, STATUS.WITHIN);
const h = sr2.heightFt.sloped;
assert.equal(dim(rep({...base, zoningHeightFt: h}), 'height').status, STATUS.WITHIN);
assert.equal(dim(rep({...base, zoningHeightFt: h + 0.1}), 'height').status, STATUS.CONFLICT);
const farAt = rep({...base, zoningTotalFloorAreaSqFt: farMax * 10000});
assert.equal(dim(farAt, 'far').status, STATUS.WITHIN);
const farOver = rep({...base, zoningTotalFloorAreaSqFt: farMax * 10000 + 1});
assert.equal(dim(farOver, 'far').status, STATUS.CONFLICT);
assert.notEqual(dim(farOver, 'far').displayValue, formatNumber(farMax, {max: 4}), 'rounding never shows an over-limit FAR as equal to the limit');

// Multiple simultaneous findings.
r = rep({...base, zoningHeightFt: h + 2, zoningRearSetbackFt: null}, {...property, yearBuilt:1900});
integrity(r);
assert.equal(r.overall, 'conflict');
assert.equal(dim(r, 'height').status, STATUS.CONFLICT);
assert.equal(dim(r, 'rear_setback').status, STATUS.NEEDS_CONFIRMATION);
assert.ok(r.keyIssues.within.includes('Floor area ratio (FAR)'));
assert.ok(r.considerations.historic.length > 0);
assert.ok(r.considerations.permits.length > 0);

// Non-zoning project: screen not triggered, no dimensions, no filler questions.
r = feasibilityReport(buildPlan('bathroom', property, {}));
integrity(r);
assert.equal(r.overall, 'not_triggered');
assert.equal(r.dimensions.length, 0);
assert.ok(!r.askNewton.some(q => /front setback/i.test(q)));

console.log('feasibility report tests passed');
