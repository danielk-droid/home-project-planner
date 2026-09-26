// Addition journey regression: walks the Addition question flow the way the
// page does (getQuestions -> answer -> advance to the next visible question),
// then checks the answers reach deriveProject/zoningFacts and that the zoning
// screen cards come out of buildPlan. Guards against the flow stopping after
// newArea/stories or the zoning questions being filtered out.
// TEST ONLY: the property below is synthetic, not a real Newton parcel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getQuestions, buildPlan } from '../src/core.js';

const ZONING_IDS = ['zoningLotEra','zoningSideSetbackFt','zoningRearSetbackFt','zoningRoofType','zoningHeightFt','zoningTotalFloorAreaSqFt','zoningTotalCoverageSqFt'];
const PROPERTY = {resolvedAddress: 'TEST ONLY synthetic parcel', zoningDistrict: 'SR2', lotSizeSqFt: 10000};

// The page imports these modules directly (no bundler); make sure that stays true.
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(app, /import \{[^}]*getQuestions[^}]*\} from '\.\/src\/core\.js'/);
const core = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
assert.match(core, /import questionFlows from '\.\.\/data\/questions\.json' with \{ type: 'json' \}/);
assert.match(core, /import \{ zoningFacts \} from '\.\/zoning\.js'/);

// Walk the flow. `pick` supplies an answer for each shown question.
function walk(pick) {
  const answers = {};
  const shown = [];
  let index = 0;
  for (let guard = 0; guard < 100; guard++) {
    const all = getQuestions('addition', answers);
    if (index >= all.length) break;
    const q = all[index];
    shown.push(q.id);
    const value = pick(q);
    if (value !== undefined) answers[q.id] = value;
    const updated = getQuestions('addition', answers);
    index = updated.findIndex(x => x.id === q.id) + 1;
  }
  return {answers, shown};
}
const baseline = q => {
  if (q.id === 'newArea') return 400;
  if (q.id === 'stories') return 1;
  if (q.kind === 'text') return 'TEST ONLY rear addition';
  if (q.kind === 'choice') return (q.options.find(([v]) => v === 'no') || q.options[0])[0];
  if (q.kind === 'multi') return ['none'];
  return undefined; // numeric zoning measurement: filled per scenario
};
const scenario = (values) => walk(q => q.id in values ? values[q.id] : baseline(q));

// 1. The flow continues past newArea/stories and reaches every zoning question.
const inLimit = {zoningLotEra: 'on_or_after_1953', zoningSideSetbackFt: 20, zoningRearSetbackFt: 25, zoningRoofType: 'sloped', zoningHeightFt: 30, zoningTotalFloorAreaSqFt: 3000, zoningTotalCoverageSqFt: 1500};
const a = scenario(inLimit);
assert.deepEqual(a.shown.slice(0, 2), ['newArea', 'stories']);
assert.ok(a.shown.length > 2, 'flow must not stop after newArea and stories');
for (const id of ZONING_IDS) assert.ok(a.shown.includes(id), `zoning question ${id} must be reachable`);
for (const id of ZONING_IDS) assert.equal(a.answers[id], inLimit[id], `${id} answer must be kept`);

const ids = plan => plan.results.map(r => r.id);
const zoningCards = plan => plan.results.filter(r => r.id.startsWith('zoning.'));

// 2. In-limit values: no exceed/incomplete/district cards.
const planA = buildPlan('addition', PROPERTY, a.answers);
assert.equal(planA.project.zoningScreen.applies, true, 'answers must reach zoningFacts via deriveProject');
for (const k of ['setbacks','lotCoverage','height','far']) assert.equal(planA.project.zoningScreen.checks[k].status, 'within', k);
assert.deepEqual(zoningCards(planA).map(r => r.id), [], 'all screened limits within -> no zoning warning cards');

// 3. One missing measurement (height skipped): needs confirmation, never zero.
const b = scenario({...inLimit, zoningHeightFt: undefined});
assert.equal(b.answers.zoningHeightFt, undefined);
const planB = buildPlan('addition', PROPERTY, b.answers);
assert.ok(ids(planB).includes('zoning.screen-incomplete'));
assert.ok(!ids(planB).includes('zoning.height-exceeds'), 'missing height must not become an exceedance');
const incomplete = planB.results.find(r => r.id === 'zoning.screen-incomplete');
assert.equal(incomplete.status, 'needs_confirmation');

// 4. Above-limit measurement (side setback 10 ft in SR2 post-1953, min 15 ft).
const c = scenario({...inLimit, zoningSideSetbackFt: 10});
const planC = buildPlan('addition', PROPERTY, c.answers);
const setback = planC.results.find(r => r.id === 'zoning.setback-exceeds');
assert.ok(setback, 'above-limit setback must produce a card');
assert.equal(setback.status, 'potentially_required');

// 5. Unsupported / unknown district.
assert.ok(ids(buildPlan('addition', {...PROPERTY, zoningDistrict: 'MR1'}, a.answers)).includes('zoning.district-unsupported'));
assert.ok(ids(buildPlan('addition', {...PROPERTY, zoningDistrict: undefined}, a.answers)).includes('zoning.district-unknown'));

// Conservative wording on every zoning card: never approval/legality claims.
for (const plan of [planB, planC]) for (const r of zoningCards(plan)) {
  const text = JSON.stringify(r).toLowerCase();
  for (const bad of ['approved', 'is legal', 'illegal', 'rejected', 'guarantee']) assert.ok(!text.includes(bad), `${r.id} must not say "${bad}"`);
}
assert.match(JSON.stringify(setback).toLowerCase(), /relief/);

console.log('addition-flow tests passed');
