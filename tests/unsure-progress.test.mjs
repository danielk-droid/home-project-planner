// Regression tests: honest progress counting and "I'm not sure" resolution.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getQuestions, inferClarifiedAnswer, deriveProject} from '../src/core.js';
import * as flow from '../src/question-flow.js';
import {clarifierForQuestion, unsureGuidance} from '../src/question-guidance.js';

const flows = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const flowQuestions = type => flows.find(f => f.id === type).questions;

// Mirrors app.js: answers/clarifierState/meta + visit history + nextUnansweredIndex.
function session(type) {
  const s = {type, answers: {}, clarifierState: {}, clarificationMeta: {}, index: 0, history: [], shown: []};
  s.ctx = () => ({answers: s.answers, clarifierState: s.clarifierState, clarificationMeta: s.clarificationMeta, flowQuestions: flowQuestions(type)});
  s.all = () => getQuestions(type, s.answers);
  s.cluster = () => flow.questionCluster(s.all(), s.index, s.ctx());
  s.progress = () => flow.progressFor(s.all(), s.index, s.ctx(), s.history);
  s.submit = (values, cluster) => {
    s.history.push(cluster[0].id);
    cluster.forEach((q, i) => {
      const v = values[i];
      if (flow.isSyntheticClarifier(q)) s.clarifierState[q.id] = v;
      else { s.answers[q.id] = v; if (q.parentId) s.clarifierState[q.id] = v; }
      if (q.parentId) {
        const inferred = inferClarifiedAnswer(q.parentId, v);
        if (inferred) { s.answers[q.parentId] = inferred; s.clarificationMeta[q.id] = {parentId: q.parentId, inferredAnswer: inferred, value: v, questionId: q.id}; }
      }
    });
    const visible = new Set(s.all().map(q => q.id));
    for (const k of Object.keys(s.answers)) if (!visible.has(k)) delete s.answers[k];
    s.index = flow.nextUnansweredIndex(s.all(), s.ctx());
  };
  s.back = () => { const r = flow.backFromHistory(s.all(), s.history, s.all()[s.index]?.id); s.history = r.history; s.index = r.index; };
  return s;
}
const pick = (q, prefer) => {
  if (q.kind === 'choice') return q.options.some(([v]) => v === prefer) ? prefer : q.options[0][0];
  if (q.kind === 'multi') return [q.options.some(([v]) => v === prefer) ? prefer : q.options[0][0]];
  if (q.kind === 'number') return q.min ?? 1;
  return 'Test detail';
};
function step(s, prefer, clarPrefer = prefer) {
  const [root] = s.cluster();
  const v = pick(root, prefer);
  s.answers[root.id] = v;
  s.index = flow.indexOfActive(s.all(), root.id, s.index);
  const cluster = s.cluster();
  s.shown.push(cluster[0].id);
  s.submit(cluster.map((q, i) => i === 0 ? v : pick(q, clarPrefer)), cluster);
}
function walk(s, prefer, clarPrefer) {
  const positions = [];
  for (let g = 0; s.index < s.all().length; g++) {
    assert.ok(g < 200, 'terminates');
    const p = s.progress();
    positions.push(p);
    step(s, prefer, clarPrefer);
  }
  return positions;
}
function assertHonest(positions, label) {
  positions.forEach((p, i) => {
    assert.equal(p.position, i + 1, `${label}: step ${i + 1} displayed as ${p.position}`);
    assert.ok(p.total >= p.position, `${label}: total below position`);
    if (i < positions.length - 1) assert.ok(p.position < p.total || p.atLeast, `${label}: reached max prematurely at ${p.position}/${p.total}`);
  });
}

// 1. Progress counts every flow step by step: +1 per Continue, never a jump.
for (const f of flows) {
  for (const prefer of ['yes', 'no', 'unsure', null]) {
    for (const clar of ['unsure', null]) {
      const s = session(f.id);
      const positions = walk(s, prefer, clar);
      assertHonest(positions, `${f.id}/${prefer}/${clar}`);
      assert.equal(new Set(s.shown).size, s.shown.length, `${f.id}/${prefer}: duplicate question`);
    }
  }
}

// 2. Short path: deck with all "no" has exactly 10 steps; last step shows 10 of 10.
{
  const s = session('deck');
  const positions = walk(s, 'no');
  assert.equal(positions.length, 10);
  assert.equal(positions.at(-1).position, 10);
  assert.equal(positions.at(-1).total, 10);
}

// 3. Conditional questions: general project total grows honestly when exterior "yes" adds steps.
{
  const s = session('general_project');
  const before = s.progress();
  assert.ok(before.atLeast, 'unanswered gating questions mean the total is not final');
  const positions = walk(s, 'yes');
  assertHonest(positions, 'general/yes conditional');
  assert.ok(positions.at(-1).total > before.total, 'total grew as conditional questions were added');
}

// 4. Addition 8 -> next must be 9, never 21 (the reported bug), including an unsure clarifier at Q8.
{
  const s = session('addition');
  for (let i = 0; i < 7; i++) step(s, 'no');
  assert.equal(s.progress().position, 8);
  step(s, 'unsure', 'unsure'); // siteWork unsure -> follow-up -> still don't know
  assert.equal(s.progress().position, 9, 'after Q8 the next question is 9');
  assert.equal(s.answers.siteWork, 'unsure');
  s.back();
  assert.equal(s.progress().position, 8, 'Back shows 8 again');
}

// 5. "I'm not sure" adding a real follow-up does not add a separate step.
{
  const s = session('basement_finish');
  const start = s.progress().total;
  s.answers.sleepingRoomAdded = 'unsure';
  assert.equal(s.cluster().length, 2);
  assert.equal(s.progress().position, 1);
  assert.ok(s.progress().total <= start, 'inline follow-up shares the step');
}

// 6. Audit every "I'm not sure" question.
const REAL_FOLLOW_UPS = {sleepingRoomAdded: 'sleepingUse', bathroomAdded: 'bathroomIntent', primaryWorkArea: 'primaryWorkAreaDetail', exteriorChange: 'exteriorChangeDetail'};
const NON_RESOLVING = new Set(['primaryWorkArea']); // detail narrows scope but cannot determine the area
for (const f of flows) {
  for (const q of f.questions) {
    if (!q.options?.some(([v]) => v === 'unsure')) continue;
    const answers = {unsure: true};
    const s = session(f.id);
    // Make q visible with a plausible path.
    for (const [k, v] of [...(q.showWhen || []), ...(q.showWhenAny || []).slice(0, 1)]) s.answers[k] = v;
    s.answers[q.id] = 'unsure';
    const all = s.all();
    s.index = all.findIndex(x => x.id === q.id);
    assert.ok(s.index >= 0, `${f.id}.${q.id} visible`);
    const cluster = s.cluster();
    assert.ok(unsureGuidance(q).length > 20, `${q.id} has contextual guidance`);
    const other = {...s.answers};
    if (cluster.length === 1) {
      // Case B: stays unsure through to the engine.
      s.submit(['unsure'], cluster);
      assert.equal(s.answers[q.id], 'unsure', `${q.id} stays unsure`);
    } else {
      const follow = cluster[1];
      if (REAL_FOLLOW_UPS[q.id]) assert.equal(follow.id, REAL_FOLLOW_UPS[q.id]);
      else assert.equal(follow.id, '__clarifier_' + q.id);
      assert.ok(follow.options.some(([v]) => v === 'unsure'), `${q.id} follow-up offers "I still don't know"`);
      // "I still don't know" keeps the parent unsure.
      const keep = session(f.id); Object.assign(keep.answers, s.answers); keep.index = s.index;
      keep.submit(['unsure', follow.kind === 'multi' ? ['unsure'] : 'unsure'], keep.cluster());
      assert.equal(keep.answers[q.id], 'unsure', `${q.id}: still-unsure follow-up keeps parent unsure`);
      // Each concrete follow-up answer either derives yes/no in the parent field only, or leaves it unsure.
      for (const [v] of follow.options.filter(([v]) => v !== 'unsure')) {
        const t = session(f.id); Object.assign(t.answers, s.answers); t.index = s.index;
        const c = t.cluster();
        t.submit(['unsure', c[1].kind === 'multi' ? [v] : v], c);
        const derived = t.answers[q.id];
        if (NON_RESOLVING.has(q.id)) assert.equal(derived, 'unsure', `${q.id}:${v} does not resolve`);
        else if (!(q.id === 'exteriorChange' && v === 'site')) assert.ok(['yes', 'no'].includes(derived), `${q.id}:${v} derives an answer (got ${derived})`);
        else assert.equal(derived, 'unsure', 'site-only work does not answer the building-exterior question');
        for (const [k, val] of Object.entries(other)) if (k !== q.id && t.answers[k] !== undefined) assert.deepEqual(t.answers[k], val, `${q.id}:${v} overwrote ${k}`);
      }
    }
    void answers;
  }
}

// 7. Restating follow-ups are gone: these remain explicit uncertainty.
for (const id of ['condo', 'condoApproval', 'guttingExtent', 'deckNew', 'zoningLotEra', 'zoningRoofType', 'historicLocalLandmark', 'egressType']) {
  assert.equal(clarifierForQuestion({id}), null, `${id} has no restating follow-up`);
}

// 8. Engine receives unknown, not yes/no.
{
  const d = deriveProject('deck', {deckNew: 'unsure', condo: 'unsure', electricalWork: 'unsure', stairsOrGuard: 'unsure'});
  assert.equal(d.deckNew, false); assert.equal(d.deckNewUncertain, true);
  assert.equal(d.condoUncertain, true); assert.equal(d.electricalUncertain, true); assert.equal(d.stairsOrGuardUncertain, true);
  const b = deriveProject('basement_finish', {sleepingRoomAdded: 'unsure', sleepingUse: 'unsure'});
  assert.equal(b.sleepingRoomAdded, false); assert.equal(b.sleepingRoomUncertain, true);
  const r = deriveProject('basement_finish', {sleepingRoomAdded: 'yes'});
  assert.equal(r.sleepingRoomAdded, true); assert.equal(r.sleepingRoomUncertain, false);
  const g = deriveProject('general_project', {exteriorChange: 'unsure', exteriorChangeDetail: 'site'});
  assert.equal(g.exteriorChangeUncertain, true); assert.equal(g.exteriorChange, false);
}

// 9. App uses the shared honest progress calculation, not index/length.
{
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('flow.progressFor('));
  assert.ok(!/questionIndex \/ all\.length/.test(app));
  assert.ok(!/\(questionIndex\+1\) \+ ' of '/.test(app));
}

console.log('unsure + progress tests passed');

// 10. At the final question of a finished path the total is exact, not "at least".
for (const f of flows) {
  const s = session(f.id);
  const positions = walk(s, 'unsure', 'unsure');
  assert.equal(positions.at(-1).atLeast, false, `${f.id}: last step total is final`);
  assert.equal(positions.at(-1).position, positions.at(-1).total, `${f.id}: last step is N of N`);
}
console.log('final-step exact total tests passed');
