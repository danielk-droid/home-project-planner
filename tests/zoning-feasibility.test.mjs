import assert from 'node:assert/strict';
import { zoningScreen, maxFar, toMeasurement } from '../src/zoning.js';
import { buildPlan, validateRules } from '../src/core.js';

const SR2 = {zoningDistrict: 'SR2', lotSizeSqFt: 10000};
const full = (over = {}) => ({
  zoningLotEra: 'on_or_after_1953', zoningSideSetbackFt: 20, zoningRearSetbackFt: 20,
  zoningRoofType: 'sloped', zoningHeightFt: 30, zoningTotalFloorAreaSqFt: 3000, zoningTotalCoverageSqFt: 1500, ...over
});
const st = (p, a, k) => zoningScreen(p, a).checks[k].status;
const ids = plan => plan.results.map(r => r.id);

// --- measurement normalization: missing/malformed never becomes zero ---
for (const bad of [null, undefined, '', 'abc', '12ft', -3, NaN, Infinity, 'unsure']) assert.equal(toMeasurement(bad), null, String(bad));
assert.equal(toMeasurement('12.5'), 12.5);
assert.equal(toMeasurement(0), 0);

// --- setbacks (SR2 post-1953: side 15, rear 15; pre-1953 side 7.5) ---
assert.equal(st(SR2, full({zoningSideSetbackFt: 20}), 'setbacks'), 'within');
assert.equal(st(SR2, full({zoningSideSetbackFt: 15}), 'setbacks'), 'within', 'exact minimum complies (min)');
assert.equal(st(SR2, full({zoningSideSetbackFt: 14.9}), 'setbacks'), 'exceeds');
assert.equal(st(SR2, full({zoningRearSetbackFt: 14}), 'setbacks'), 'exceeds');
assert.equal(st(SR2, full({zoningSideSetbackFt: null}), 'setbacks'), 'unknown');
assert.equal(st(SR2, full({zoningSideSetbackFt: 'ten'}), 'setbacks'), 'unknown');
// unknown lot era: 10 ft side is fine pre-1953 (7.5) but not post-1953 (15) -> unknown
assert.equal(st(SR2, full({zoningLotEra: 'unsure', zoningSideSetbackFt: 10}), 'setbacks'), 'unknown');
assert.equal(st(SR2, full({zoningLotEra: 'unsure', zoningSideSetbackFt: 16}), 'setbacks'), 'within');
assert.equal(st(SR2, full({zoningLotEra: 'unsure', zoningSideSetbackFt: 5}), 'setbacks'), 'exceeds');
assert.equal(st(SR2, full({zoningLotEra: 'before_1953', zoningSideSetbackFt: 7.5}), 'setbacks'), 'within');
// one side definitely short, other missing -> still exceeds
assert.equal(st(SR2, full({zoningSideSetbackFt: 3, zoningRearSetbackFt: null}), 'setbacks'), 'exceeds');

// --- lot coverage (SR2 post-1953 20%, pre-1953 30%) ---
assert.equal(st(SR2, full({zoningTotalCoverageSqFt: 1999}), 'lotCoverage'), 'within');
assert.equal(st(SR2, full({zoningTotalCoverageSqFt: 2000}), 'lotCoverage'), 'within', 'exact maximum complies');
assert.equal(st(SR2, full({zoningTotalCoverageSqFt: 2001}), 'lotCoverage'), 'exceeds');
assert.equal(st({zoningDistrict: 'SR2'}, full(), 'lotCoverage'), 'unknown', 'missing lot area');
assert.equal(st(SR2, full({zoningTotalCoverageSqFt: null}), 'lotCoverage'), 'unknown');
assert.equal(st(SR2, full({zoningTotalCoverageSqFt: 'lots'}), 'lotCoverage'), 'unknown');
assert.equal(st({zoningDistrict: 'SR2', lotSizeSqFt: 'n/a'}, full(), 'lotCoverage'), 'unknown', 'malformed lot area');
assert.equal(st(SR2, full({zoningLotEra: 'unsure', zoningTotalCoverageSqFt: 2500}), 'lotCoverage'), 'unknown');

// --- height (36 sloped / 30 flat) ---
assert.equal(st(SR2, full({zoningHeightFt: 36}), 'height'), 'within');
assert.equal(st(SR2, full({zoningHeightFt: 36.1}), 'height'), 'exceeds');
assert.equal(st(SR2, full({zoningRoofType: 'flat', zoningHeightFt: 30}), 'height'), 'within');
assert.equal(st(SR2, full({zoningRoofType: 'flat', zoningHeightFt: 31}), 'height'), 'exceeds');
assert.equal(st(SR2, full({zoningRoofType: 'unsure', zoningHeightFt: 33}), 'height'), 'unknown');
assert.equal(st(SR2, full({zoningRoofType: 'unsure', zoningHeightFt: 29}), 'height'), 'within');
assert.equal(st(SR2, full({zoningHeightFt: null}), 'height'), 'unknown');
assert.equal(st(SR2, full({zoningHeightFt: 'tall'}), 'height'), 'unknown');

// --- FAR table (Sec. 3.1.9) ---
assert.equal(maxFar('SR2', 10000), 0.38);
assert.equal(maxFar('SR2', 12000), 0.36);
assert.equal(maxFar('SR1', 25000), 0.26);
assert.equal(maxFar('SR3', 6000), 0.48);
assert.equal(maxFar('SR3', 17000), 0.38);
assert.equal(maxFar('SR2', null), null);
assert.equal(st(SR2, full({zoningTotalFloorAreaSqFt: 3800}), 'far'), 'within', 'exact max FAR complies');
assert.equal(st(SR2, full({zoningTotalFloorAreaSqFt: 3801}), 'far'), 'exceeds');
assert.equal(st(SR2, full({zoningTotalFloorAreaSqFt: 3700}), 'far'), 'within');
assert.equal(st({zoningDistrict: 'SR2'}, full(), 'far'), 'unknown', 'missing lot size');
assert.equal(st(SR2, full({zoningTotalFloorAreaSqFt: null}), 'far'), 'unknown');
assert.equal(st(SR2, full({zoningTotalFloorAreaSqFt: 'big'}), 'far'), 'unknown');
// pre-1953 +0.02 band depends on post-1953 setback compliance -> unknown
assert.equal(st(SR2, full({zoningLotEra: 'before_1953', zoningTotalFloorAreaSqFt: 3900}), 'far'), 'unknown');
assert.equal(st(SR2, full({zoningLotEra: 'before_1953', zoningTotalFloorAreaSqFt: 4001}), 'far'), 'exceeds');

// --- district handling ---
assert.equal(zoningScreen({zoningDistrict: 'MR1', lotSizeSqFt: 9000}, full()).districtStatus, 'unsupported');
assert.equal(zoningScreen({zoningDistrict: null}, full()).districtStatus, 'unknown');
assert.equal(zoningScreen({zoningDistrict: ' sr-2 ', lotSizeSqFt: 10000}, full()).districtStatus, 'supported');
assert.deepEqual(zoningScreen(SR2, full(), false).checks, {}, 'not applicable -> no checks');

// --- integration through the single rule engine ---
assert.deepEqual(validateRules(), []);
const ok = buildPlan('addition', SR2, {newArea: 400, stories: 1, footprintChange: 'yes', ...full()});
assert.ok(!ids(ok).some(id => id.startsWith('zoning.')), 'fully within: no zoning screen cards');
assert.ok(ids(ok).includes('property.zoning') && ids(ok).includes('addition.setback'), 'existing zoning review cards remain');
const over = buildPlan('addition', SR2, {newArea: 400, stories: 1, ...full({zoningSideSetbackFt: 8, zoningHeightFt: 40, zoningTotalFloorAreaSqFt: 5000, zoningTotalCoverageSqFt: 2600})});
for (const id of ['zoning.setback-exceeds', 'zoning.height-exceeds', 'zoning.far-exceeds', 'zoning.lot-coverage-exceeds']) {
  const r = over.results.find(x => x.id === id);
  assert.ok(r, id);
  assert.equal(r.status, 'potentially_required');
  assert.match(r.action, /not a zoning determination/);
  assert.ok(r.sources.some(s => s.id === 'newton-zoning-ordinance'));
}
const blank = buildPlan('addition', SR2, {newArea: 400, stories: 1});
assert.ok(ids(blank).includes('zoning.screen-incomplete'));
assert.ok(!ids(blank).some(id => id.endsWith('-exceeds')), 'blank measurements never trigger exceedances');
assert.ok(ids(buildPlan('addition', {zoningDistrict: 'BU1'}, {})).includes('zoning.district-unsupported'));
assert.ok(ids(buildPlan('addition', {zoningDistrict: null}, {})).includes('zoning.district-unknown'));
const interior = buildPlan('bathroom_renovation', SR2, {plumbingWork: 'yes'});
assert.ok(!ids(interior).some(id => id.startsWith('zoning.')), 'interior project: screen not applicable');
const ambiguousText = JSON.stringify(over.results.filter(r => r.id.startsWith('zoning.')));
assert.doesNotMatch(ambiguousText, /\b(approved|is legal|definitely)\b/i);

console.log('zoning feasibility screen tests: PASS');

// --- Official-table regression: every value checked against Newton Zoning
// Ordinance Chapter 30, "Last Amended 12-01-25" (Secs. 3.1.3, 3.1.9). ---
{
  const OFFICIAL = {
    SR1: {post: {side: 20, rear: 25, cov: 15}, pre: {side: 12.5, rear: 25, cov: 20}},
    SR2: {post: {side: 15, rear: 15, cov: 20}, pre: {side: 7.5, rear: 15, cov: 30}},
    SR3: {post: {side: 10, rear: 15, cov: 30}, pre: {side: 7.5, rear: 15, cov: 30}}
  };
  for (const [d, eras] of Object.entries(OFFICIAL)) {
    const P = {zoningDistrict: d, lotSizeSqFt: 10000};
    for (const [era, v] of [['on_or_after_1953', eras.post], ['before_1953', eras.pre]]) {
      const a = o => full({zoningLotEra: era, zoningSideSetbackFt: 50, zoningRearSetbackFt: 50, ...o});
      assert.equal(st(P, a({zoningSideSetbackFt: v.side}), 'setbacks'), 'within', `${d} ${era} side at min`);
      assert.equal(st(P, a({zoningSideSetbackFt: v.side - 0.1}), 'setbacks'), 'exceeds', `${d} ${era} side below`);
      assert.equal(st(P, a({zoningRearSetbackFt: v.rear}), 'setbacks'), 'within', `${d} ${era} rear at min`);
      assert.equal(st(P, a({zoningRearSetbackFt: v.rear - 0.1}), 'setbacks'), 'exceeds', `${d} ${era} rear below`);
      assert.equal(st(P, a({zoningTotalCoverageSqFt: v.cov * 100}), 'lotCoverage'), 'within', `${d} ${era} coverage at max`);
      assert.equal(st(P, a({zoningTotalCoverageSqFt: v.cov * 100 + 1}), 'lotCoverage'), 'exceeds', `${d} ${era} coverage above`);
    }
    for (const [roof, max] of [['sloped', 36], ['flat', 30]]) {
      assert.equal(st(P, full({zoningRoofType: roof, zoningHeightFt: max}), 'height'), 'within', `${d} ${roof} at max`);
      assert.equal(st(P, full({zoningRoofType: roof, zoningHeightFt: max + 0.1}), 'height'), 'exceeds', `${d} ${roof} above`);
    }
  }
  // Sec. 3.1.9 FAR table endpoints and equations.
  const FAR = [
    ['SR1', 4999, 0.46], ['SR1', 5000, 0.46], ['SR1', 6999, 0.460 - 0.000015 * 1999], ['SR1', 7000, 0.43],
    ['SR1', 9999, 0.43 - 0.000033 * 2999], ['SR1', 10000, 0.33], ['SR1', 14999, 0.33 - 0.000004 * 4999],
    ['SR1', 15000, 0.31], ['SR1', 19999, 0.31 - 0.000006 * 4999], ['SR1', 20000, 0.28],
    ['SR1', 24999, 0.28 - 0.000004 * 4999], ['SR1', 25000, 0.26], ['SR1', 80000, 0.26],
    ['SR2', 4999, 0.46], ['SR2', 6000, 0.46 - 0.000015 * 1000], ['SR2', 7000, 0.43], ['SR2', 8500, 0.43 - 0.000017 * 1500],
    ['SR2', 10000, 0.38], ['SR2', 12000, 0.38 - 0.00001 * 2000], ['SR2', 15000, 0.33], ['SR2', 40000, 0.33],
    ['SR3', 4999, 0.48], ['SR3', 6999, 0.48], ['SR3', 7000, 0.48], ['SR3', 9000, 0.48 - 0.000023 * 2000],
    ['SR3', 10000, 0.41], ['SR3', 12500, 0.41 - 0.000006 * 2500], ['SR3', 15000, 0.38], ['SR3', 19999, 0.38],
    ['SR3', 20000, 0.38], ['SR3', 22000, 0.38 - 0.000004 * 2000], ['SR3', 25000, 0.36]
  ];
  for (const [d, lot, expected] of FAR) assert.ok(Math.abs(maxFar(d, lot) - expected) < 1e-6, `${d} ${lot} FAR ${maxFar(d, lot)} vs ${expected}`);
  // Pre-1953 +0.02 (Sec. 3.1.9.A.1) is conditional -> unknown inside the band, exceeds above it.
  const pre = o => full({zoningLotEra: 'before_1953', ...o});
  assert.equal(st(SR2, pre({zoningTotalFloorAreaSqFt: 3800}), 'far'), 'within');
  assert.equal(st(SR2, pre({zoningTotalFloorAreaSqFt: 3900}), 'far'), 'unknown');
  assert.equal(st(SR2, pre({zoningTotalFloorAreaSqFt: 4000}), 'far'), 'unknown', 'exactly base+0.02 is not a definite exceedance');
  assert.equal(st(SR2, pre({zoningTotalFloorAreaSqFt: 4001}), 'far'), 'exceeds');
  assert.equal(st(SR2, full({zoningTotalFloorAreaSqFt: 3801}), 'far'), 'exceeds', 'post-1953 has no bonus');
}

// --- Sec. 1.5.2.D.2 garage exemption from lot coverage (house existing 12/27/1922) ---
{
  const over = full({zoningTotalCoverageSqFt: 2500, projectCatalogId: 'garage'});
  assert.equal(st({...SR2, yearBuilt: 1910}, over, 'lotCoverage'), 'unknown', 'pre-1922 house garage: exemption may apply');
  assert.equal(st({...SR2, yearBuilt: 1922}, over, 'lotCoverage'), 'unknown', '1922 house may have existed on 12/27/1922');
  assert.equal(st({...SR2}, over, 'lotCoverage'), 'unknown', 'missing year built never assumed post-1922');
  assert.equal(st({...SR2, yearBuilt: 'n/a'}, over, 'lotCoverage'), 'unknown');
  assert.equal(st({...SR2, yearBuilt: 1923}, over, 'lotCoverage'), 'exceeds', 'post-1922 house: no exemption');
  assert.equal(st({...SR2, yearBuilt: 1910}, full({zoningTotalCoverageSqFt: 2500}), 'lotCoverage'), 'exceeds', 'non-garage project unaffected');
  assert.equal(st({...SR2, yearBuilt: 1910}, full({zoningTotalCoverageSqFt: 1500, projectCatalogId: 'garage'}), 'lotCoverage'), 'within');
  assert.ok(zoningScreen({...SR2, yearBuilt: 1910}, over).missing.some(m => m.includes('1.5.2.D.2')));
}
console.log('zoning official-table regression ok');
