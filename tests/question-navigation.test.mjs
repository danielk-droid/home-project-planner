import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getQuestions} from '../src/core.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(app, /function previousQuestionIndex\(all, currentIndex\)/);
assert.match(app, /questionIndex = previousQuestionIndex\(getQuestions\(type, answers\), questionIndex\)/);
assert.match(app, /questionIndex = previousQuestionIndex\(all, all.length\)/);
assert.doesNotMatch(app, /if \(questionIndex > 0\) \{ questionIndex--; renderQuestionCard\(\); \}/);

function inlineClarifierFor(parent, q) {
  return (q.showWhen || []).some(([key, value]) => key === parent.id && value === 'unsure') ||
    (q.showWhenAny || []).some(([key, value]) => key === parent.id && value === 'unsure');
}
function clusterAt(all, index) {
  const cluster = [all[index]];
  let parent = all[index];
  for (let i = index + 1; i < all.length; i++) {
    if (!inlineClarifierFor(parent, all[i])) break;
    cluster.push(all[i]);
    parent = all[i];
  }
  return cluster;
}
function nextIndex(all, index) {
  const cluster = clusterAt(all, index);
  return index + 1 + cluster.slice(1).filter(q => all.some(x => x.id === q.id)).length;
}
function previousIndex(all, currentIndex) {
  let cursor = 0;
  let previous = 0;
  while (cursor < currentIndex && cursor < all.length) {
    previous = cursor;
    const next = nextIndex(all, cursor);
    if (next >= currentIndex) return previous;
    cursor = next;
  }
  return previous;
}

for (const type of ['basement_finish', 'bathroom_renovation', 'deck', 'addition', 'general_project']) {
  const answers = {};
  let all = getQuestions(type, answers);
  let index = 0;
  for (let guard = 0; index < all.length && guard < 200; guard++) {
    const q = all[index];
    if (q.kind === 'choice') answers[q.id] = q.options.some(([v]) => v === 'unsure') ? 'unsure' : q.options[0][0];
    else if (q.kind === 'multi') answers[q.id] = [q.options[0][0]];
    else if (q.kind === 'number') answers[q.id] = q.min ?? 1;
    else answers[q.id] = 'Test project detail';
    const rootId = q.id;
    all = getQuestions(type, answers);
    index = all.findIndex(x => x.id === rootId);
    assert.ok(index >= 0, `${type}: answered root ${rootId} must remain visible`);
    const forward = nextIndex(all, index);
    if (forward < all.length) assert.equal(previousIndex(all, forward), index, `${type}: Back must return to the prior rendered root`);
    index = forward;
  }
  assert.ok(index >= all.length, `${type}: flow must terminate`);
  assert.equal(previousIndex(all, all.length), (() => {
    let cursor = 0, last = 0;
    while (cursor < all.length) { last = cursor; cursor = nextIndex(all, cursor); }
    return last;
  })(), `${type}: review Back must return to the last rendered root`);
}

console.log('question-navigation tests passed');