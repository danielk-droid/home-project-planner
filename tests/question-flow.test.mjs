// Regression tests for the "I'm not sure" / clarification / navigation state machine.
// Simulates the browser flow with the same pure functions app.js uses.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getQuestions, inferClarifiedAnswer} from '../src/core.js';
import * as flow from '../src/question-flow.js';
import {unsureGuidance} from '../src/question-guidance.js';

const data = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const flows = Array.isArray(data) ? data : (data.flows || data.questionFlows);
const flowQuestions = type => flows.find(f => f.id === type).questions;

function session(type) {
  const s = {type, answers: {}, clarifierState: {}, clarificationMeta: {}, index: 0, visits: []};
  s.ctx = () => ({answers: s.answers, clarifierState: s.clarifierState, clarificationMeta: s.clarificationMeta, flowQuestions: flowQuestions(type)});
  s.all = () => getQuestions(type, s.answers);
  s.cluster = () => flow.questionCluster(s.all(), s.index, s.ctx());
  s.cleanup = () => {
    const visible = new Set(s.all().map(q => q.id));
    for (const k of Object.keys(s.answers)) if (!visible.has(k)) delete s.answers[k];
  };
  // Mirrors saveClusterValues + nextQuestion in app.js.
  s.submit = (values, precomputed) => {
    const cluster = precomputed || s.cluster();
    s.visits.push(cluster[0].id);
    cluster.forEach((q, i) => {
      const v = values[i];
      if (flow.isSyntheticClarifier(q)) s.clarifierState[q.id] = v;
      else { s.answers[q.id] = v; if (q.parentId) s.clarifierState[q.id] = v; }
      if (q.parentId) {
        const inferred = inferClarifiedAnswer(q.parentId, v);
        if (inferred) {
          s.answers[q.parentId] = inferred;
          s.clarificationMeta[q.id] = {parentId: q.parentId, inferredAnswer: inferred, value: v, questionId: q.id};
        }
      }
    });
    s.cleanup();
    s.index = flow.nextUnansweredIndex(s.all(), s.ctx());
  };
  s.back = () => { s.index = flow.previousQuestionIndex(s.all(), s.index, s.ctx()); };
  return s;
}
const pick = (q, prefer) => {
  if (q.kind === 'choice') return q.options.some(([v]) => v === prefer) ? prefer : q.options[0][0];
  if (q.kind === 'multi') return [q.options[0][0]];
  if (q.kind === 'number') return q.min ?? 1;
  return 'Test detail';
};
// Answer the root, then (if the root is unsure) resolve through the clarification.
function answerStep(s, prefer) {
  const [root] = s.cluster();
  const rootValue = pick(root, prefer);
  s.answers[root.id] = rootValue; // user clicks the option first (live re-render)
  s.index = flow.indexOfActive(s.all(), root.id, s.index); // keepActive re-render
  const cluster = s.cluster();
  s.submit(cluster.map((q, i) => i === 0 ? rootValue : pick(q, prefer)), cluster);
}
function runToEnd(s, prefer) {
  for (let guard = 0; s.index < s.all().length; guard++) {
    assert.ok(guard < 200, s.type + ' did not terminate');
    answerStep(s, prefer);
  }
}
function assertNoRepeats(s, label) {
  const seen = new Set();
  for (const id of s.visits) {
    assert.ok(!seen.has(id), label + ': question re-asked in forward flow: ' + id + ' sequence=' + s.visits.join(','));
    seen.add(id);
  }
}
function assertReviewComplete(s, label) {
  const unanswered = s.all().filter(q => s.answers[q.id] === undefined && !q.optional);
  assert.deepEqual(unanswered.map(q => q.id), [], label + ': review would bounce back to answered questions');
}

// 1. Full forward flows with every answer "I'm not sure" (and with first options) – no repeats.
for (const f of flows) {
  for (const prefer of ['unsure', 'yes', 'no', null]) {
    const s = session(f.id);
    runToEnd(s, prefer);
    assertNoRepeats(s, f.id + '/' + prefer);
    assertReviewComplete(s, f.id + '/' + prefer);
  }
}

// 2. Gated questions are never treated as clarifications of the parent.
{
  const s = session('general_project');
  const all = getQuestions('general_project', {exteriorChange: 'unsure'});
  const idx = all.findIndex(q => q.id === 'exteriorChange');
  const cluster = flow.questionCluster(all, idx, {answers: {exteriorChange: 'unsure'}, flowQuestions: flowQuestions('general_project')});
  assert.ok(!cluster.some(q => q.id.startsWith('historic')), 'historic questions must not be inline clarifiers');
  assert.equal(cluster[1]?.id, 'exteriorChangeDetail');
  assert.ok(flow.isInlineClarifier({id: 'bathroomAdded'}, flowQuestions('basement_finish').find(q => q.id === 'bathroomIntent')));
  assert.ok(!flow.isInlineClarifier({id: 'bathroomAdded'}, flowQuestions('basement_finish').find(q => q.id === 'plumbingWork')));
  void s;
}

// 3. "I'm not sure" -> clarification -> same question resolved -> next question.
{
  const s = session('basement_finish');
  const all = s.all();
  s.index = all.findIndex(q => q.id === 'sleepingRoomAdded');
  const after = s.index;
  s.answers.sleepingRoomAdded = 'unsure';
  const cluster = s.cluster();
  assert.equal(cluster[0].id, 'sleepingRoomAdded');
  assert.equal(cluster[1].id, 'sleepingUse');
  s.submit(['unsure', 'sleeping'], cluster);
  assert.equal(s.answers.sleepingRoomAdded, 'yes', 'clarification resolves the same question');
  assert.notEqual(s.all()[s.index]?.id, 'sleepingUse', 'clarifier is not re-asked as its own step');
  assert.ok(s.index > after, 'flow moves forward, index not reset');
  s.back();
  assert.equal(s.all()[s.index].id, 'sleepingRoomAdded', 'Back returns to resolved question');
  assert.equal(s.cluster()[1]?.id, 'sleepingUse', 'resolved clarification shown with its parent');
}

// 4. Synthetic clarifier (no data follow-up) occupies no slot: skip/next don't jump over a question.
{
  const s = session('addition');
  const all = s.all();
  const i = all.findIndex(q => q.id === 'structuralChanges');
  assert.ok(i >= 0);
  s.index = i;
  s.answers.structuralChanges = 'unsure';
  const cluster = s.cluster();
  assert.equal(cluster[1].id, '__clarifier_structuralChanges');
  assert.equal(flow.nextQuestionIndex(s.all(), i, s.ctx()), i + 1, 'synthetic clarifier must not skip the next question');
}

// 5. Back -> change answer -> forward continues from the correct point without replay.
for (const type of ['addition', 'deck', 'basement_finish', 'general_project']) {
  const s = session(type);
  for (let k = 0; k < 4; k++) answerStep(s, 'unsure');
  const before = s.index;
  s.back(); s.back();
  const target = s.all()[s.index].id;
  const saved = s.answers[target];
  assert.notEqual(saved, undefined, 'Back preserves the answer');
  s.visits = [];
  answerStep(s, 'no');
  answerStep(s, 'no');
  assert.ok(s.index >= Math.min(before, s.all().length) - 2, type + ': forward resumed from the correct point');
  runToEnd(s, 'unsure');
  assertNoRepeats(s, type + ' after back/change');
  assertReviewComplete(s, type + ' after back/change');
}

// 6. Editing a clarifier from review opens its parent cluster, not a standalone copy.
{
  const answers = {sleepingRoomAdded: 'unsure'};
  const all = getQuestions('basement_finish', answers);
  const child = all.findIndex(q => q.id === 'sleepingUse');
  const root = flow.clusterRootIndex(all, child, {answers, flowQuestions: flowQuestions('basement_finish')});
  assert.equal(all[root].id, 'sleepingRoomAdded');
}

// 7. Every "I'm not sure" question has contextual guidance, not one generic message.
const generic = unsureGuidance({id: '__none__'});
for (const f of flows) for (const q of f.questions) {
  if (q.options?.some(([v]) => v === 'unsure')) {
    const text = unsureGuidance(q);
    assert.ok(text && text !== generic, 'missing contextual unsure guidance for ' + q.id);
  }
}

// 7b. Choosing "I'm not sure" that inserts earlier conditional questions keeps the same question on screen,
// and those newly applicable questions are asked once without replaying answered ones.
{
  const s = session('general_project');
  runToEnd(s, 'no');
  assertNoRepeats(s, 'general no');
}
{
  const s = session('general_project');
  for (let g = 0; g < 200 && s.index < s.all().length; g++) {
    const root = s.all()[s.index];
    if (root.id === 'exteriorChange') {
      s.answers.exteriorChange = 'unsure';
      s.index = flow.indexOfActive(s.all(), 'exteriorChange', s.index);
      assert.equal(s.all()[s.index].id, 'exteriorChange', 'same question stays active after choosing unsure');
    }
    answerStep(s, 'unsure');
  }
  assertNoRepeats(s, 'general exteriorChange unsure');
  assert.ok(s.visits.includes('historicLocalLandmark'), 'newly applicable question asked once');
  assertReviewComplete(s, 'general exteriorChange unsure');
}

// 7c. Back retraces the actual path when a later answer inserted an earlier question.
{
  const all = getQuestions('general_project', {exteriorChange: 'yes'});
  const r = flow.backFromHistory(all, ['useChange', 'unitCountChange', 'exteriorChange'], 'historicLocalLandmark');
  assert.equal(all[r.index].id, 'exteriorChange');
  const r2 = flow.backFromHistory(all, r.history, 'exteriorChange');
  assert.equal(all[r2.index].id, 'unitCountChange');
}

// 8. app.js uses the shared flow module (single source of truth for navigation).
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(app, /from '\.\/src\/question-flow\.js'/);
assert.doesNotMatch(app, /questionIndex \+= cluster\.length/);
assert.doesNotMatch(app, /function inlineClarifierFor/);
assert.match(app, /keepActive:true/);
assert.match(app, /nextUnansweredIndex/);
assert.match(app, /backFromHistory/);

console.log('question-flow regression tests passed');
