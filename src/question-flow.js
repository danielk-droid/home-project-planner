// Pure question-flow navigation shared by the browser UI and regression tests.
//
// Single source of truth:
//   answers            – every real question's answer (flow questions only)
//   clarifierState     – answers to synthetic "__clarifier_" questions only
//   clarificationMeta  – which clarifier resolved which parent answer
//   questionIndex      – index of the active cluster root in getQuestions()
//
// A real flow question is an inline clarification of its parent ONLY when it
// exists solely to resolve that parent's "I'm not sure" answer: its showWhen is
// exactly [[parent, 'unsure']] and it has no showWhenAny. Questions that are
// merely gated by several answers (for example historic or plumbing questions
// shown for "yes" OR "unsure") are ordinary questions with their own step.
import {clarifierForQuestion, withStillUnsure} from './question-guidance.js';

export function isSyntheticClarifier(q) {
  return typeof q?.id === 'string' && q.id.startsWith('__clarifier_');
}

export function isInlineClarifier(parent, q) {
  if (!parent || !q || q.showWhenAny?.length) return false;
  const conditions = q.showWhen || [];
  return conditions.length === 1 && conditions[0][0] === parent.id && conditions[0][1] === 'unsure';
}

// Value shown/validated for a cluster member.
export function clusterValue(q, {answers = {}, clarifierState = {}} = {}) {
  if (isSyntheticClarifier(q)) return clarifierState[q.id];
  return answers[q.id] !== undefined ? answers[q.id] : (q.parentId ? clarifierState[q.id] : undefined);
}

export function questionCluster(all, index, {answers = {}, clarificationMeta = {}, flowQuestions = []} = {}) {
  const root = all[index];
  if (!root) return [];
  const cluster = [root];
  const resolved = Object.values(clarificationMeta).find(meta => meta.parentId === root.id);
  if (resolved) {
    const source = flowQuestions.find(q => q.id === resolved.questionId);
    const remembered = source ? {...source} : clarifierForQuestion(root);
    if (remembered) cluster.push({...remembered, options: withStillUnsure(remembered.options), parentId: root.id});
    return cluster;
  }
  const next = all[index + 1];
  if (next && isInlineClarifier(root, next)) {
    cluster.push({...next, options: withStillUnsure(next.options), parentId: root.id});
    return cluster;
  }
  if (root.kind === 'choice' && answers[root.id] === 'unsure') {
    const synthetic = clarifierForQuestion(root);
    if (synthetic) cluster.push({...synthetic, parentId: root.id});
  }
  return cluster;
}

// Number of slots in `all` a cluster occupies (synthetic/hidden members occupy none).
export function clusterSpan(all, cluster) {
  return 1 + cluster.slice(1).filter(q => all.some(x => x.id === q.id)).length;
}

export function nextQuestionIndex(all, index, ctx) {
  return index + clusterSpan(all, questionCluster(all, index, ctx));
}

export function previousQuestionIndex(all, currentIndex, ctx) {
  let cursor = 0;
  let previous = 0;
  while (cursor < currentIndex && cursor < all.length) {
    previous = cursor;
    const next = nextQuestionIndex(all, cursor, ctx);
    if (next >= currentIndex) return previous;
    cursor = next;
  }
  return previous;
}

// Index of the cluster root that owns `index` (so editing a clarifier opens its parent).
export function clusterRootIndex(all, index, ctx) {
  let cursor = 0;
  while (cursor < all.length) {
    const next = nextQuestionIndex(all, cursor, ctx);
    if (index >= cursor && index < next) return cursor;
    cursor = next;
  }
  return Math.min(index, all.length);
}

// After answers change, continue from the cluster root identified by id.
export function indexAfterCluster(all, rootId, fallbackIndex, ctx) {
  const rootIndex = all.findIndex(q => q.id === rootId);
  if (rootIndex < 0) return Math.min(fallbackIndex, all.length);
  return nextQuestionIndex(all, rootIndex, ctx);
}

// Forward navigation target: the first cluster root, in flow order, that has
// never been answered. Answered questions are never re-asked going forward;
// a conditional question that became applicable because of a later answer is
// asked once, then the flow returns to the frontier.
export function nextUnansweredIndex(all, ctx) {
  const answers = ctx?.answers || {};
  let cursor = 0;
  while (cursor < all.length) {
    if (answers[all[cursor].id] === undefined) return cursor;
    cursor = nextQuestionIndex(all, cursor, ctx);
  }
  return all.length;
}

// Re-locate the active question by id after the list changes (answers can
// insert or remove conditional questions before the current position).
export function indexOfActive(all, activeId, fallbackIndex) {
  const i = activeId ? all.findIndex(q => q.id === activeId) : -1;
  return i >= 0 ? i : Math.min(fallbackIndex, all.length);
}

// Back retraces the completed-step history (most recent first), skipping
// entries that are no longer applicable or equal to the current question.
export function backFromHistory(all, history, currentId) {
  const h = [...history];
  while (h.length) {
    const id = h.pop();
    if (id === currentId) continue;
    const i = all.findIndex(q => q.id === id);
    if (i >= 0) return {index: i, history: h};
  }
  return {index: -1, history: h};
}

// Ordered cluster roots (one per step the user sees) for the current answers.
export function stepRoots(all, ctx) {
  const roots = [];
  let cursor = 0;
  while (cursor < all.length) {
    roots.push(all[cursor].id);
    cursor = nextQuestionIndex(all, cursor, ctx);
  }
  return roots;
}

// Could an unanswered question still add conditional questions to this path?
export function pathMayGrow(all, ctx) {
  const answers = ctx?.answers || {};
  const shown = new Set(all.map(q => q.id));
  return (ctx?.flowQuestions || []).some(q => !shown.has(q.id) &&
    [...(q.showWhen || []), ...(q.showWhenAny || [])].some(([key]) => shown.has(key) && answers[key] === undefined));
}

// Honest progress for the active step, based on the path actually walked:
//   position – steps already completed on this path (visit history) + 1
//   total    – steps in the path for the current answers (never below position)
//   atLeast  – true when unanswered questions could still add steps
//   percent  – completed steps / total
// It never counts a step the user has not reached.
export function progressFor(all, index, ctx, history = []) {
  const roots = stepRoots(all, ctx);
  const answers = ctx?.answers || {};
  const currentId = all[index]?.id;
  const walked = [];
  for (const id of history) if (roots.includes(id) && !walked.includes(id)) walked.push(id);
  const at = walked.indexOf(currentId);
  let position;
  if (at >= 0) position = at + 1;
  else if (!walked.length && currentId && answers[currentId] !== undefined) position = roots.indexOf(currentId) + 1;
  else position = walked.filter(id => id !== currentId).length + 1;
  const total = Math.max(position, roots.length);
  const completed = Math.min(position - 1, total);
  return {position, total, atLeast: pathMayGrow(all, ctx), percent: total ? Math.round(completed / total * 100) : 0};
}
