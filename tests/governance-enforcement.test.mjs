// Governance enforcement: the release invariants must reject unsafe registries,
// and the property lookup must never turn broken GIS data into a negative fact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewIndexProblems, publicReleaseBlockers, registryProblems, gapProblem, fallbackProblem, fallbackExecutes, ruleGovernance, VERSION_STATUSES } from '../src/governance.js';
import { resolveProperty, buildPlan, evaluateRules } from '../src/core.js';

const baseRules = [
  {id: 'x.rule', status: 'required', when: 'project.buildingWork == true', sourceIds: ['newton-isd']},
  {id: 'x.fallback', status: 'needs_confirmation', when: 'project.buildingWorkUncertain == true', sourceIds: ['newton-isd']},
  {id: 'x.fake', status: 'needs_confirmation', when: 'project.buildingWork == false', sourceIds: ['newton-isd']}
];
const reg = meta => ({rules: [{ruleId: 'x.rule', interpretationStatus: 't', humanReview: 't', uncertaintyCompanions: [], ...meta},
  {ruleId: 'x.fallback', riskClass: 'abstention', uncertaintyCompanions: []}, {ruleId: 'x.fake', riskClass: 'abstention', uncertaintyCompanions: []}]});
const check = meta => registryProblems({rules: baseRules, ruleRegistry: reg(meta), reviewIds: ['REV-005']}).filter(p => p.startsWith('x.rule'));
const goodGap = {reviewId: 'REV-005', code: 'GIS_SIGNAL_ONLY_NO_UNKNOWN_PATHWAY'};

// 1-2: HIGH/CRITICAL with no fallback and no gap fail.
assert.ok(check({riskClass: 'high'}).some(p => /no valid uncertainty fallback/.test(p)));
assert.ok(check({riskClass: 'critical'}).some(p => /no valid uncertainty fallback/.test(p)));
// 3, 5: valid fallback passes.
assert.deepEqual(check({riskClass: 'high', uncertaintyCompanions: ['x.fallback']}), []);
assert.deepEqual(check({riskClass: 'critical', uncertaintyCompanions: ['x.fallback']}), []);
// 4: documented genuine gap passes.
assert.deepEqual(check({riskClass: 'high', knownGap: goodGap}), []);
// 6: empty / placeholder / untracked gaps fail.
for (const g of ['', 'TBD', 'Long prose gap explanation referencing REV-005 in text form only.', {}, [], {reviewId: 'REV-005'}, {reviewId: 'REV-005', code: 'TBD'}, {reviewId: 'REV-005', code: 'REVIEW_LATER_SOON'}, {reviewId: 'REV-999', code: 'GIS_SIGNAL_ONLY_NO_UNKNOWN_PATHWAY'}, {reviewId: 'REV-005', code: 'GIS_SIGNAL_ONLY_NO_UNKNOWN_PATHWAY', rationale: 'private prose'}])
  assert.ok(check({riskClass: 'high', knownGap: g}).length, `gap must fail: ${JSON.stringify(g)}`);
assert.equal(gapProblem(goodGap, ['REV-005']), null);
// A decided/closed review item cannot excuse a missing fallback.
assert.match(gapProblem(goodGap, []), /unknown or closed/);
// Fallbacks are checked behaviorally through the real evaluator.
assert.equal(fallbackExecutes(baseRules[1], evaluateRules), true);
assert.equal(fallbackExecutes({id: 'x.contra', status: 'needs_confirmation', when: 'project.buildingWorkUncertain == true && project.buildingWorkUncertain == false', sourceIds: ['newton-isd']}, evaluateRules), false);
assert.equal(fallbackExecutes({id: 'x.wrong', status: 'required', when: 'project.buildingWorkUncertain == true', sourceIds: ['newton-isd']}, evaluateRules), false);
// Sources: conflict/unavailable on a confident rule, future-effective, superseded all fail.
const srcReg = extra => ({sources: [{sourceId: 'newton-isd', tier: 1, versionStatus: 'DATE_VERIFIED_ONLY', lastVerified: '2026-01-01', ...extra}]});
const srcCheck = extra => registryProblems({rules: baseRules, ruleRegistry: reg({riskClass: 'moderate'}), sourceRegistry: srcReg(extra), reviewIds: ['REV-005'], today: '2026-09-27'});
assert.deepEqual(srcCheck({}), []);
assert.ok(srcCheck({versionStatus: 'SOURCE_CONFLICT'}).some(p => /SOURCE_CONFLICT/.test(p)));
assert.ok(srcCheck({versionStatus: 'SOURCE_UNAVAILABLE'}).some(p => /SOURCE_UNAVAILABLE/.test(p)));
assert.ok(srcCheck({versionStatus: 'VERSIONED', versionLabel: 'X', retrievalStatus: 'text_verified', effectiveFrom: '2027-01-01'}).some(p => /not yet in effect/.test(p)));
assert.ok(srcCheck({supersededBy: 'newer'}).some(p => /superseded/.test(p)));
assert.ok(srcCheck({tier: 4}).some(p => /tier 4/.test(p)), 'low-authority source cannot support a rule');
assert.ok(registryProblems({rules: [{...baseRules[0], sourceIds: ['nope']}], ruleRegistry: reg({riskClass: 'moderate'}), sourceRegistry: srcReg({}), reviewIds: []}).some(p => /missing from source registry/.test(p)));
assert.ok(registryProblems({rules: [...baseRules, {id: 'x.unreg', status: 'required', when: 'project.buildingWork == true', sourceIds: ['newton-isd']}], ruleRegistry: reg({riskClass: 'moderate'}), sourceRegistry: srcReg({}), reviewIds: []}).some(p => /x.unreg: missing from governance/.test(p)));
// 7: a fallback that cannot fire on uncertainty fails, and cannot rescue the rule.
assert.match(fallbackProblem('x.rule', 'x.fake', baseRules), /uncertainty signal/);
assert.ok(check({riskClass: 'critical', uncertaintyCompanions: ['x.fake']}).some(p => /no valid uncertainty fallback/.test(p)));
assert.match(fallbackProblem('x.rule', 'x.rule', baseRules), /itself/);
assert.match(fallbackProblem('x.rule', 'x.missing', baseRules), /does not exist/);
// Moderate rules are not forced to carry a fallback (risk class changes the rule).
assert.deepEqual(check({riskClass: 'moderate'}), []);
// The real registry satisfies the invariant.
assert.deepEqual(registryProblems(), []);

// Owner decisions: REV-002 and REV-006 stay open and block public launch.
const idx = JSON.parse(fs.readFileSync(new URL('../data/governance/review_index.json', import.meta.url)));
const realReg = JSON.parse(fs.readFileSync(new URL('../data/governance/rule_registry.json', import.meta.url)));
assert.deepEqual(reviewIndexProblems(idx, realReg), []);
assert.deepEqual(publicReleaseBlockers(idx), ['REV-002', 'REV-006']);
for (const id of ['REV-002', 'REV-006']) assert.equal(idx.items.find(i => i.id === id).status, 'open');
assert.ok(!realReg.rules.some(r => r.humanReview === 'professionally_reviewed'), 'no rule may claim professional review yet');
const withItem = (id, patch) => ({...idx, items: idx.items.map(i => i.id === id ? {...i, ...patch} : i)});
// A critical rule cannot be marked professionally reviewed while REV-002 is open.
const fakePro = {rules: realReg.rules.map(r => r.ruleId === 'property.zoning' ? {...r, humanReview: 'professionally_reviewed'} : r)};
assert.ok(reviewIndexProblems(idx, fakePro).some(p => /claims professional review/.test(p)));
// Closing or owner-deciding a release blocker is rejected; so are bad statuses and missing blockers.
assert.ok(reviewIndexProblems(withItem('REV-002', {status: 'closed'}), realReg).length);
assert.ok(reviewIndexProblems(withItem('REV-006', {status: 'owner_decided'}), realReg).length);
assert.ok(reviewIndexProblems(withItem('REV-006', {status: 'professionally_reviewed'}), realReg).length);
assert.ok(reviewIndexProblems(withItem('REV-003', {status: 'done'}), realReg).length);
assert.ok(reviewIndexProblems(withItem('REV-003', {releaseBlocking: 'yes'}), realReg).length);
assert.ok(reviewIndexProblems({...idx, items: idx.items.filter(i => i.id !== 'REV-006')}, realReg).length);
assert.ok(reviewIndexProblems(idx, {rules: [{ruleId: 'x', riskClass: 'critical', humanReview: 'not_required_abstention'}]}).length);

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
// GIS unavailable (network error / HTTP failure) also fails, never "not mapped".
globalThis.fetch = async () => { throw new Error('offline'); };
await assert.rejects(resolveProperty('1 Synthetic St'));
globalThis.fetch = async () => ({ok: false, status: 503, json: async () => ({})});
await assert.rejects(resolveProperty('1 Synthetic St'));
// Historic district: named, no feature, malformed.
mockGis({...empty, 39: {features: [{attributes: {Name: 'Example District'}}]}});
prop = await resolveProperty('1 Synthetic St');
assert.equal(prop.historicDistrict, 'Example District');
assert.equal(prop.historicExteriorReview, true);
mockGis(empty);
prop = await resolveProperty('1 Synthetic St');
assert.equal(prop.historicExteriorReview, false);
assert.equal(prop.evidence.find(e => e.label === 'Historic district').value, 'None returned by layer');
for (const bad of [{}, {features: 'x'}]) { mockGis({...empty, 39: bad}); await assert.rejects(resolveProperty('1 Synthetic St')); }
mockGis(empty);
prop = await resolveProperty('1 Synthetic St');
// A string floodplain value (the old bug shape) never triggers the rule silently as true.
assert.ok(!buildPlan('addition', {...prop, floodplain: 'Flood Zone'}, {siteWork: 'yes'}).results.some(r => r.id === 'property.floodplain'));

console.log('governance enforcement tests passed');
