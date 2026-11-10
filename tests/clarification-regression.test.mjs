// Regression: answer → "not sure" → concrete follow-up → Back → change follow-up
// → "I still don't know" → original returns to "not sure" → continue, no repeats.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getQuestions, inferClarifiedAnswer, deriveProject} from '../src/core.js';
import * as flow from '../src/question-flow.js';

const flows = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const TYPE = 'deck';
const flowQuestions = flows.find(f => f.id === TYPE).questions;

// Mirrors app.js state: answers, clarifierState, clarificationMeta, visitHistory.
const s = {answers: {}, clarifierState: {}, meta: {}, index: 0, history: [], shown: []};
const ctx = () => ({answers: s.answers, clarifierState: s.clarifierState, clarificationMeta: s.meta, flowQuestions});
const all = () => getQuestions(TYPE, s.answers);
const cluster = () => flow.questionCluster(all(), s.index, ctx());
// Mirrors applyClarificationInference in app.js.
function applyInference(q, value) {
  if (q.followUpGroup) { flow.applyFollowUps(q.parentId, {answers: s.answers, clarifierState: s.clarifierState, clarificationMeta: s.meta}); return; }
  const inferred = inferClarifiedAnswer(q.parentId, value);
  const parent = flow.parentAnswerAfterClarifier(inferred, value, !!s.meta[q.id]);
  if (inferred) s.meta[q.id] = {parentId: q.parentId, inferredAnswer: inferred, value, questionId: q.id};
  else delete s.meta[q.id];
  if (parent) s.answers[q.parentId] = parent;
}
// Mirrors the change handler for a follow-up control.
function changeFollowUp(q, value) {
  if (flow.isSyntheticClarifier(q)) s.clarifierState[q.id] = value;
  else { s.answers[q.id] = value; s.clarifierState[q.id] = value; }
  applyInference(q, value);
}
// Mirrors saveClusterValues + Continue: reads the rendered controls (parent from answers).
function submit() {
  const c = cluster();
  for (const q of c) if (q.kind === 'multi') assert.ok(!flow.isAmbiguousMultiSelection(flow.clusterValue(q, ctx())), 'no ambiguous submit');
  s.history.push(c[0].id);
  s.shown.push(c[0].id);
  for (const q of c.slice(1)) applyInference(q, flow.clusterValue(q, ctx()));
  s.index = flow.nextUnansweredIndex(all(), ctx());
}
function answerRoot(value) {
  const [root] = cluster();
  s.answers[root.id] = value;
  s.index = flow.indexOfActive(all(), root.id, s.index);
  return root;
}
const firstChoice = q => q.kind === 'choice' ? q.options.find(([v]) => v !== 'unsure')[0] : q.kind === 'multi' ? [q.options[0][0]] : q.kind === 'number' ? (q.min ?? 1) : 'x';

// 1. User answers a question.
const first = answerRoot(firstChoice(cluster()[0]));
submit();
assert.equal(s.answers[first.id] !== undefined, true);

// Advance (answering concretely) until the electrical question.
for (let g = 0; cluster()[0].id !== 'electricalWork'; g++) {
  assert.ok(g < 50 && s.index < all().length, 'electricalWork reachable');
  answerRoot(firstChoice(cluster()[0])); submit();
}
const beforeUnsure = {...s.answers};

// 2–3. "I'm not sure" → a follow-up clarification appears.
answerRoot('unsure');
let c = cluster();
assert.equal(c[0].id, 'electricalWork');
assert.ok(c.length > 1, 'clarification appears');
const follow = c.slice(1);
assert.ok(follow.length >= 3, 'several tailored follow-ups appear');
assert.ok(follow.every(q => q.followUpGroup === 'electricalWork'), 'follow-ups are about electrical work');
assert.equal(new Set(follow.map(q => q.text)).size, follow.length, 'each follow-up is a different question');

// 4–5. A concrete "yes" follow-up selects Yes for the original question.
changeFollowUp(follow[0], 'yes');
assert.equal(s.answers.electricalWork, 'yes', 'Yes selected for you');
changeFollowUp(follow[1], 'no'); changeFollowUp(follow[2], 'no');
assert.equal(s.answers.electricalWork, 'yes');
submit();
const afterElectrical = s.index;
assert.notEqual(all()[afterElectrical]?.id, 'electricalWork');

// 6. Back → same question, follow-up answers intact.
const back = flow.backFromHistory(all(), s.history, all()[s.index]?.id);
s.history = back.history; s.index = back.index;
c = cluster();
assert.equal(c[0].id, 'electricalWork');
assert.equal(flow.clusterValue(c[1], ctx()), 'yes', 'Back preserves follow-up answer');

// 7. All "no" → No is selected for you.
changeFollowUp(c[1], 'no');
assert.equal(s.answers.electricalWork, 'no', 'No selected for you');

// 8–9. "I don't know" on any follow-up → original returns to genuinely unresolved.
changeFollowUp(c[2], 'unsure');
assert.equal(s.answers.electricalWork, 'unsure');
assert.equal(Object.values(s.meta).some(m => m.parentId === 'electricalWork'), false);
assert.deepEqual(flow.exclusiveMultiSelection(['unsure', 'a'], 'a', true), ['a'], 'multi-select exclusivity still holds');

// 10–12. Continue: no repeat, no reintroduced answered question.
submit();
assert.equal(s.answers.electricalWork, 'unsure', 'stays unsure after Continue');
for (const [k, v] of Object.entries(beforeUnsure)) if (k !== 'electricalWork') assert.deepEqual(s.answers[k], v, `${k} not overwritten`);
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
const walked = s.shown.filter((id, i) => s.shown.indexOf(id) !== i);
assert.deepEqual(walked, ['electricalWork'], 'only the deliberate Back revisit repeats');

// 13. Rules receive "not sure" → needs confirmation, not Yes/No.
const d = deriveProject(TYPE, s.answers);
assert.equal(d.electricalUncertain, true);
assert.equal(d.electricalWork, false);

// App wires the helpers.
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.ok(app.includes('flow.exclusiveMultiSelection('));
assert.ok(app.includes('flow.isAmbiguousMultiSelection('));
assert.ok(app.includes('flow.parentAnswerAfterClarifier('));
console.log('clarification regression tests passed');
