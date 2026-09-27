// Governance enforcement: the release invariants must reject unsafe registries,
// and the property lookup must never turn broken GIS data into a negative fact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registryProblems, gapProblem, fallbackProblem, ruleGovernance, VERSION_STATUSES } from '../src/governance.js';
import { resolveProperty, buildPlan } from '../src/core.js';

const baseRules = [
  {id: 'x.rule', status: 'required', when: 'project.buildingWork == true', sourceIds: ['newton-isd']},
  {id: 'x.fallback', status: 'needs_confirmation', when: 'project.buildingWorkUncertain == true', sourceIds: ['newton-isd']},
  {id: 'x.fake', status: 'needs_confirmation', when: 'project.buildingWork == false', sourceIds: ['newton-isd']}
];
const reg = meta => ({rules: [{ruleId: 'x.rule', interpretationStatus: 't', humanReview: 't', uncertaintyCompanions: [], ...meta},
  {ruleId: 'x.fallback', riskClass: 'abstention', uncertaintyCompanions: []}, {ruleId: 'x.fake', riskClass: 'abstention', uncertaintyCompanions: []}]});
const check = meta => registryProblems({rules: baseRules, ruleRegistry: reg(meta), reviewIds: ['REV-005']}).filter(p => p.startsWith('x.rule'));
const goodGap = 'Depends on mapped GIS signals only; unmapped areas cannot be detected by HPP. See REV-005.';

// 1-2: HIGH/CRITICAL with no fallback and no gap fail.
assert.ok(check({riskClass: 'high'}).some(p => /no valid uncertainty fallback/.test(p)));
assert.ok(check({riskClass: 'critical'}).some(p => /no valid uncertainty fallback/.test(p)));
// 3, 5: valid fallback passes.
assert.deepEqual(check({riskClass: 'high', uncertaintyCompanions: ['x.fallback']}), []);
assert.deepEqual(check({riskClass: 'critical', uncertaintyCompanions: ['x.fallback']}), []);
// 4: documented genuine gap passes.
assert.deepEqual(check({riskClass: 'high', knownGap: goodGap}), []);
// 6: empty / placeholder / untracked gaps fail.
for (const g of ['', '   ', 'TBD', 'Review later — we will look at this after launch. REV-005', 'A long explanation that references nothing tracked anywhere at all.', 'A long explanation of the gap with an unknown tracker id REV-999.'])
  assert.ok(check({riskClass: 'high', knownGap: g}).length, `gap must fail: ${JSON.stringify(g)}`);
assert.equal(gapProblem(goodGap, ['REV-005']), null);
// 7: a fallback that cannot fire on uncertainty fails, and cannot rescue the rule.
assert.match(fallbackProblem('x.rule', 'x.fake', baseRules), /uncertainty signal/);
assert.ok(check({riskClass: 'critical', uncertaintyCompanions: ['x.fake']}).some(p => /no valid uncertainty fallback/.test(p)));
assert.match(fallbackProblem('x.rule', 'x.rule', baseRules), /itself/);
assert.match(fallbackProblem('x.rule', 'x.missing', baseRules), /does not exist/);
// Moderate rules are not forced to carry a fallback (risk class changes the rule).
assert.deepEqual(check({riskClass: 'moderate'}), []);
// The real registry satisfies the invariant.
assert.deepEqual(registryProblems(), []);

// Source versioning: honest states only.
const src = JSON.parse(fs.readFileSync(new URL('../data/governance/source_registry.json', import.meta.url)));
for (const s of src.sources) assert.ok(VERSION_STATUSES.includes(s.versionStatus), s.sourceId);
assert.equal(src.sources.find(s => s.sourceId === 'newton-zoning-ordinance').versionStatus, 'VERSIONED');
assert.equal(src.sources.find(s => s.sourceId === 'newton-zoning-ordinance').versionLabel, 'Last Amended 12-01-25');
assert.ok(src.sources.every(s => s.effectiveFrom === null), 'no effective date may be claimed without evidence');
const fakeVersioned = {sources: [{sourceId: 'x', versionStatus: 'VERSIONED', versionLabel: null, retrievalStatus: 'verified_by_date_only', lastVerified: '2026-01-01'}]};
assert.ok(registryProblems({rules: [], ruleRegistry: {rules: []}, sourceRegistry: fakeVersioned}).some(p => /VERSIONED requires/.test(p)));
const fakeEffective = {sources: [{sourceId: 'x', versionStatus: 'DATE_VERIFIED_ONLY', effectiveFrom: '2025-01-01', lastVerified: '2026-01-01'}]};
assert.ok(registryProblems({rules: [], ruleRegistry: {rules: []}, sourceRegistry: fakeEffective}).some(p => /effective date claimed/.test(p)));
// Date-verified sources are not reported as versioned evidence.
assert.equal(ruleGovernance('project.building').evidenceVersioned, false);

// Floodplain: mapped feature (with or without a name) => true; malformed => failure, never false.
function mockGis(overlays) {
  globalThis.fetch = async url => {
    const layer = Number(String(url).match(/\/(\d+)\/query/)?.[1]);
    const body = layer in overlays ? overlays[layer]
      : {features: [{attributes: {Address: '1 SYNTHETIC ST', MAP_PAR_ID: 'SYN', Zoning: 'SR2', Lot_Size: 9000, Year_Built: 1990}, geometry: {x: 1, y: 1}}], spatialReference: {wkid: 2249}};
    return {ok: true, json: async () => body};
  };
}
const none = {features: []};
const empty = {39: none, 41: none, 27: none, 26: none, 29: none, 16: none, 24: {features: [{attributes: {Zoning: 'SR2'}}]}};
mockGis({...empty, 41: {features: [{attributes: {}}]}});
let prop = await resolveProperty('1 Synthetic St');
assert.equal(prop.floodplain, true, 'nameless flood feature is still a floodplain');
assert.equal(prop.floodplainName, null);
assert.equal(prop.evidence.find(e => e.label === 'Floodplain').value, 'Mapped (name not returned)');
const plan = buildPlan('addition', prop, {siteWork: 'yes', newArea: 400, stories: 1});
assert.equal(plan.project.siteReviewRelevant, true);
assert.ok(plan.results.some(r => r.id === 'property.floodplain'), 'mapped nameless floodplain must trigger the floodplain rule');
mockGis({...empty, 39: {features: [{attributes: {}}]}});
prop = await resolveProperty('1 Synthetic St');
assert.equal(prop.historicExteriorReview, true);
assert.equal(prop.evidence.find(e => e.label === 'Historic district').value, 'Mapped (name not returned)');
mockGis(empty);
prop = await resolveProperty('1 Synthetic St');
assert.equal(prop.floodplain, false);
for (const bad of [{}, {features: null}, {error: {message: 'x'}}]) {
  mockGis({...empty, 41: bad});
  await assert.rejects(resolveProperty('1 Synthetic St'), 'malformed flood layer must fail, not read as no floodplain');
}
// A string floodplain value (the old bug shape) never triggers the rule silently as true.
assert.ok(!buildPlan('addition', {...prop, floodplain: 'Flood Zone'}, {siteWork: 'yes'}).results.some(r => r.id === 'property.floodplain'));

console.log('governance enforcement tests passed');
