// Every "I'm not sure" question gets tailored follow-ups whose answers select
// the original answer only when the evidence supports it.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FOLLOW_UPS, followUpsFor, resolveFollowUps, followUpId} from '../src/unsure-followups.js';
import * as flow from '../src/question-flow.js';

const flows = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const REAL_FOLLOW_UPS = new Set(['sleepingRoomAdded', 'bathroomAdded', 'primaryWorkArea', 'exteriorChange']);
const parents = new Map();
for (const f of flows) for (const q of f.questions) if (q.options?.some(([v]) => v === 'unsure')) parents.set(q.id, q);

for (const [id, q] of parents) {
  if (REAL_FOLLOW_UPS.has(id)) { assert.equal(FOLLOW_UPS[id], undefined); continue; }
  const def = FOLLOW_UPS[id];
  assert.ok(def, `${id} has tailored follow-ups`);
  const fus = followUpsFor(q);
  assert.ok(fus.length >= 2, `${id} has at least 2 follow-ups`);
  const allowed = new Set(q.options.map(([v]) => v).filter(v => v !== 'unsure'));
  for (const [, , options] of def.questions) for (const [, , target] of options) {
    assert.ok(target === null || allowed.has(target), `${id} follow-up maps to a real answer (${target})`);
  }
  for (const fu of fus) assert.ok(fu.options.some(([v]) => v === 'unsure'), `${fu.id} offers "I don't know"`);
  // All "I don't know" never resolves.
  const dk = Object.fromEntries(def.questions.map(([k]) => [followUpId(id, k), 'unsure']));
  assert.equal(resolveFollowUps(id, dk), null, `${id}: I don't know stays unresolved`);
  // Nothing answered never resolves.
  assert.equal(resolveFollowUps(id, {}), null);
  // Some combination of answers can settle it.
  const reachable = new Set();
  const combos = (i, acc) => {
    if (i === def.questions.length) { const r = resolveFollowUps(id, acc); if (r) reachable.add(r); return; }
    const [k, , options] = def.questions[i];
    for (const [v] of [...options, ['unsure']]) combos(i + 1, {...acc, [followUpId(id, k)]: v});
  };
  combos(0, {});
  assert.ok(reachable.size >= 1, `${id} can be resolved`);
  for (const r of reachable) assert.ok(allowed.has(r), `${id} resolves to ${r}`);
}

// Specific rules from the homeowner's point of view.
const v = (p, o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [followUpId(p, k), x]));
assert.equal(resolveFollowUps('plumbingWork', v('plumbingWork', {fixtures: 'yes'})), 'yes', 'moving a sink means plumbing Yes');
assert.equal(resolveFollowUps('plumbingWork', v('plumbingWork', {fixtures: 'no', pipes: 'no', appliances: 'no'})), 'no', 'all no means plumbing No');
assert.equal(resolveFollowUps('plumbingWork', v('plumbingWork', {fixtures: 'no', pipes: 'no'})), null, 'No needs every follow-up answered');
assert.equal(resolveFollowUps('plumbingWork', v('plumbingWork', {fixtures: 'no', pipes: 'unsure', appliances: 'no'})), null, "I don't know blocks No");
assert.equal(resolveFollowUps('condo', v('condo', {fees: 'no'})), null, 'no condo fees alone does not prove not a condo');
assert.equal(resolveFollowUps('condo', v('condo', {deed: 'yes', fees: 'unsure'})), 'yes');
assert.equal(resolveFollowUps('condo', v('condo', {deed: 'no', fees: 'yes'})), null, 'conflicting evidence stays unsure');
assert.equal(resolveFollowUps('historicLocalLandmark', v('historicLocalLandmark', {list: 'unchecked', notice: 'no'})), null, 'unchecked landmark status stays unsure');
assert.equal(resolveFollowUps('zoningLotEra', v('zoningLotEra', {deed: 'before'})), 'before_1953');
assert.equal(resolveFollowUps('zoningLotEra', v('zoningLotEra', {deed: 'before', planning: 'after'})), null);
assert.equal(resolveFollowUps('historicAgeKnown', v('historicAgeKnown', {built: 'near', confirmed: 'notasked'})), null, 'boundary year stays unsure');
assert.equal(resolveFollowUps('trenchDewatering', v('trenchDewatering', {pump: 'unsure', trench: 'no'})), null, "I don't know blocks No");
assert.equal(resolveFollowUps('trenchDewatering', v('trenchDewatering', {pump: 'no', trench: 'yes'})), 'no');

// Applying follow-ups writes only the parent and drops a stale Yes.
{
  const state = {answers: {plumbingWork: 'unsure', gasWork: 'no'}, clarifierState: {}, clarificationMeta: {}};
  state.clarifierState[followUpId('plumbingWork', 'fixtures')] = 'yes';
  assert.equal(flow.applyFollowUps('plumbingWork', state), 'yes');
  assert.ok(state.clarificationMeta.__followups_plumbingWork);
  state.clarifierState[followUpId('plumbingWork', 'fixtures')] = 'unsure';
  assert.equal(flow.applyFollowUps('plumbingWork', state), 'unsure');
  assert.equal(state.clarificationMeta.__followups_plumbingWork, undefined);
  assert.equal(state.answers.gasWork, 'no');
  flow.clearFollowUps('plumbingWork', state);
  assert.deepEqual(state.clarifierState, {});
}

// Return to review stays in review-edit mode until the review screen shows.
{
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const handler = app.slice(app.indexOf("$('returnToReview')"), app.indexOf("$('skipQuestion')"));
  assert.ok(!handler.includes('editingFromReview=false') && !handler.includes('editingFromReview = false'), 'returning does not drop review-edit mode early');
  const review = app.slice(app.indexOf('function renderReview('), app.indexOf('function formatAnswer('));
  assert.ok(review.indexOf('if (unanswered.length)') < review.indexOf('editingFromReview = false'), 'review-edit mode ends only once review renders');
}
console.log('unsure follow-up tests passed');
