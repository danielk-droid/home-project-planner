// Regression: answer → "I'm not sure" → exactly one follow-up → answer it →
// original records Yes/No, follow-up disappears → Back → change → continue, no repeats.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getQuestions, deriveProject} from '../src/core.js';
import * as flow from '../src/question-flow.js';

const flows = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const TYPE = 'deck';
const flowQuestions = flows.find(f => f.id === TYPE).questions;

const s = {answers: {}, clarifierState: {}, meta: {}, index: 0, history: [], shown: []};
const ctx = () => ({answers: s.answers, clarifierState: s.clarifierState, clarificationMeta: s.meta, flowQuestions});
const all = () => getQuestions(TYPE, s.answers);
const cluster = () => flow.questionCluster(all(), s.index, ctx());
// Mirrors the app: answering a follow-up records the parent immediately.
function answerFollowUp(q, value) {
  s.clarifierState[q.id] = value;
  flow.applyFollowUps(q.parentId, {answers: s.answers, clarifierState: s.clarifierState, clarificationMeta: s.meta});
}
// Mirrors clicking an option on the original question.
function answerRoot(value) {
  const [root] = cluster();
  s.answers[root.id] = value;
  flow.clearFollowUps(root.id, {clarifierState: s.clarifierState, clarificationMeta: s.meta});
  s.index = flow.indexOfActive(all(), root.id, s.index);
  return root;
}
function submit() {
  const c = cluster();
  assert.ok(c.every(q => flow.clusterValue(q, ctx()) !== undefined), 'cluster complete');
  s.history.push(c[0].id);
  s.shown.push(c[0].id);
  s.index = flow.nextUnansweredIndex(all(), ctx());
}
const firstChoice = q => q.kind === 'choice' ? q.options.find(([v]) => v !== 'unsure')[0] : q.kind === 'multi' ? [q.options[0][0]] : q.kind === 'number' ? (q.min ?? 1) : 'x';

// 1. Normal answer: recorded, no follow-up.
const first = answerRoot(firstChoice(cluster()[0]));
assert.equal(cluster().length, 1);
submit();
assert.notEqual(s.answers[first.id], undefined);

for (let g = 0; cluster()[0].id !== 'electricalWork'; g++) {
  assert.ok(g < 50 && s.index < all().length, 'electricalWork reachable');
  answerRoot(firstChoice(cluster()[0])); submit();
}
const beforeUnsure = {...s.answers};

// 2–3. "I'm not sure" → exactly one follow-up, no "I'm not sure" in it.
answerRoot('unsure');
let c = cluster();
assert.equal(c.length, 2, 'exactly one follow-up');
assert.equal(c[1].followUpGroup, 'electricalWork');
assert.ok(!c[1].options.some(([v]) => v === 'unsure'));

// 4–5. Answer it → Yes recorded, follow-up gone.
answerFollowUp(c[1], 'yes');
assert.equal(s.answers.electricalWork, 'yes');
assert.equal(cluster().length, 1, 'follow-up disappears');
assert.equal(s.meta.__followups_electricalWork.inferredAnswer, 'yes');
submit();
assert.notEqual(all()[s.index]?.id, 'electricalWork');

// 6. Back → original shows its recorded answer, no follow-up.
const back = flow.backFromHistory(all(), s.history, all()[s.index]?.id);
s.history = back.history; s.index = back.index;
assert.equal(cluster()[0].id, 'electricalWork');
assert.equal(cluster().length, 1);
assert.equal(s.answers.electricalWork, 'yes');

// "I'm not sure" again → a fresh follow-up (no stale answer) → No recorded.
answerRoot('unsure');
c = cluster();
assert.equal(c.length, 2);
assert.equal(flow.clusterValue(c[1], ctx()), undefined, 'no stale follow-up answer');
answerFollowUp(c[1], 'no');
assert.equal(s.answers.electricalWork, 'no');
assert.equal(cluster().length, 1);
submit();
for (const [k, v] of Object.entries(beforeUnsure)) if (k !== 'electricalWork') assert.deepEqual(s.answers[k], v, `${k} not overwritten`);

// Continue: no repeats.
const answeredBefore = new Set(s.shown);
const tail = [];
for (let g = 0; s.index < all().length; g++) {
  assert.ok(g < 50, 'terminates');
  const id = cluster()[0].id;
  assert.ok(!answeredBefore.has(id), `${id} not re-asked`);
  tail.push(id);
  answerRoot(firstChoice(cluster()[0])); submit();
}
assert.equal(new Set(tail).size, tail.length, 'no duplicates after continuing');

// Rules receive the recorded answer.
const d = deriveProject(TYPE, s.answers);
assert.equal(d.electricalUncertain, false);

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.ok(app.includes('flow.applyFollowUps('));
assert.ok(app.includes('flow.clearFollowUps('));
console.log('clarification regression tests passed');
