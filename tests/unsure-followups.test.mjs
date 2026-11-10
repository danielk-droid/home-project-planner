// "I'm not sure" opens exactly ONE follow-up, with no "I'm not sure" option,
// and every follow-up answer records a definite answer to the original question.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FOLLOW_UPS, followUpsFor, resolveFollowUps, followUpId} from '../src/unsure-followups.js';
import * as flow from '../src/question-flow.js';
import {getQuestions} from '../src/core.js';

const flows = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const parents = new Map();
for (const f of flows) for (const q of f.questions) if (q.options?.some(([v]) => v === 'unsure')) parents.set(q.id, q);
assert.equal(parents.size, 50, 'all 50 "I\'m not sure" questions are covered');

for (const [id, q] of parents) {
  const fus = followUpsFor(q);
  assert.equal(fus.length, 1, `${id}: exactly one follow-up`);
  const fu = fus[0];
  assert.ok(fu.options.length >= 2, `${id}: follow-up has answers`);
  assert.ok(!fu.options.some(([v, l]) => v === 'unsure' || /not sure|don.t know/i.test(l)), `${id}: no "I'm not sure" option`);
  const allowed = new Set(q.options.map(([v]) => v).filter(v => v !== 'unsure'));
  for (const [v] of fu.options) {
    const r = resolveFollowUps(id, {[fu.id]: v});
    assert.ok(allowed.has(r), `${id}: "${v}" records a definite answer (${r})`);
  }
  assert.equal(resolveFollowUps(id, {}), null, `${id}: unanswered follow-up records nothing`);
}

// Specific mappings.
const pick = (p, v) => resolveFollowUps(p, {[followUpId(p)]: v});
assert.equal(pick('plumbingWork', 'yes'), 'yes');
assert.equal(pick('plumbingWork', 'no'), 'no');
assert.equal(pick('sleepingRoomAdded', 'sleeping'), 'yes');
assert.equal(pick('sleepingRoomAdded', 'other'), 'no');
assert.equal(pick('exteriorChange', 'site'), 'no');
assert.equal(pick('exteriorChange', 'opening'), 'yes');
assert.equal(pick('deckNew', 'none'), 'yes');
assert.equal(pick('deckNew', 'existing'), 'no');
assert.equal(pick('zoningLotEra', 'before'), 'before_1953');

// Acceptance flow on real project data.
const ctx = s => ({answers: s.answers, clarifierState: s.clarifierState, clarificationMeta: s.clarificationMeta, flowQuestions: flows.find(f => f.id === 'bathroom')?.questions || []});
for (const projectType of ['bathroom', 'basement_finish', 'general_project']) {
  const all0 = getQuestions(projectType, {});
  const parent = all0.find(q => FOLLOW_UPS[q.id]);
  if (!parent) continue;
  const s = {answers: {}, clarifierState: {}, clarificationMeta: {}};
  const idx = () => getQuestions(projectType, s.answers).findIndex(q => q.id === parent.id);
  const cluster = () => flow.questionCluster(getQuestions(projectType, s.answers), idx(), ctx(s));
  // 1. Normal answer: recorded, no follow-up.
  s.answers[parent.id] = parent.options[0][0];
  assert.equal(cluster().length, 1, `${projectType}: normal answer shows no follow-up`);
  // 2/3. "I'm not sure": exactly one follow-up.
  s.answers[parent.id] = 'unsure';
  flow.clearFollowUps(parent.id, s);
  assert.equal(cluster().length, 2, `${projectType}: exactly one follow-up appears`);
  const fu = cluster()[1];
  assert.ok(!fu.options.some(([v]) => v === 'unsure'));
  // Data-defined inline clarifier is replaced, not shown as an extra step.
  const steps = flow.stepRoots(getQuestions(projectType, s.answers), ctx(s));
  assert.ok(!steps.some(id => getQuestions(projectType, s.answers).find(q => q.id === id)?.showWhen?.[0]?.[0] === parent.id && getQuestions(projectType, s.answers).find(q => q.id === id)?.showWhen?.[0]?.[1] === 'unsure'), `${projectType}: no extra clarification step`);
  // 4/5. Answer it: parent recorded, follow-up gone.
  for (const [v] of fu.options) {
    s.answers[parent.id] = 'unsure';
    flow.clearFollowUps(parent.id, s);
    s.clarifierState[fu.id] = v;
    const recorded = flow.applyFollowUps(parent.id, s);
    assert.equal(recorded, resolveFollowUps(parent.id, {[fu.id]: v}));
    assert.notEqual(recorded, 'unsure');
    assert.equal(cluster().length, 1, `${projectType}: follow-up hidden after answering "${v}"`);
    assert.equal(s.clarificationMeta[`__followups_${parent.id}`].inferredAnswer, recorded);
  }
  // Direct answer clears stale follow-up state.
  s.answers[parent.id] = parent.options[0][0];
  flow.clearFollowUps(parent.id, s);
  assert.deepEqual(s.clarifierState, {});
  assert.deepEqual(s.clarificationMeta, {});
}

// Return to review stays in review-edit mode until the review screen shows.
{
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const handler = app.slice(app.indexOf("$('returnToReview')"), app.indexOf("$('skipQuestion')"));
  assert.ok(!handler.includes('editingFromReview=false') && !handler.includes('editingFromReview = false'));
  const review = app.slice(app.indexOf('function renderReview('), app.indexOf('function formatAnswer('));
  assert.ok(review.indexOf('if (unanswered.length)') < review.indexOf('editingFromReview = false'));
}
console.log('unsure follow-up tests passed');
