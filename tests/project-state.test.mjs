import assert from 'node:assert/strict';
import {
  createStorage,
  createEmptyProjectState,
  saveProject,
  loadProject,
  listSavedProjects,
  restoreProjectState,
  findSavedByIdentity,
  projectIdentity,
  storageKeyForId
} from '../src/project-state.js';

// Minimal localStorage stand-in, mirroring the Web Storage API the app uses.
function memoryBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    snapshot() { return Object.fromEntries(map); }
  };
}

const projectA = () => ({
  type: 'basement_finish',
  property: { resolvedAddress: '130 Wheeler Road', zoningDistrict: 'R3' },
  answers: { sleepingRoomAdded: 'yes', bathroomAdded: 'no' },
  clarifierState: { sleepingUse: 'sleeping' },
  steps: [{ id: 'property', status: 'complete' }, { id: 'scope', status: 'not_started' }]
});

const projectB = () => ({
  type: 'deck',
  property: { resolvedAddress: '22 Commonwealth Avenue', zoningDistrict: 'SR2' },
  answers: { projectCatalogId: 'deck', deckHeight: 4 },
  steps: [{ id: 'property', status: 'not_started' }]
});

// --- new project state is genuinely blank -----------------------------------
{
  const blank = createEmptyProjectState();
  assert.equal(blank.id, null);
  assert.equal(blank.type, null);
  assert.equal(blank.property, null);
  assert.deepEqual(blank.answers, {});
  assert.deepEqual(blank.clarifierState, {});
  assert.deepEqual(blank.clarificationMeta, {});
  assert.deepEqual(blank.clarifierQuestionMemory, {});
  assert.deepEqual(blank.steps, []);
  assert.equal(blank.questionIndex, 0);
  assert.equal(blank.editingFromReview, false);

  const other = createEmptyProjectState();
  blank.answers.leaked = true;
  assert.equal(other.answers.leaked, undefined, 'new project states must not share objects');
}

// --- save, stable identity, no duplicates -----------------------------------
{
  const store = createStorage(memoryBackend());
  const first = saveProject(store, projectA());
  assert.ok(first.id, 'saved project gets a stable id');
  assert.equal(first.storageKey, storageKeyForId(first.id));

  // Re-generating the same project must update, not duplicate.
  const again = saveProject(store, { ...projectA(), id: first.id });
  assert.equal(again.id, first.id);
  assert.equal(listSavedProjects(store).length, 1);

  // Even without the id in hand (e.g. after a refresh), identity dedupes.
  const rediscovered = saveProject(store, projectA());
  assert.equal(rediscovered.id, first.id);
  assert.equal(listSavedProjects(store).length, 1);
}

// --- project A and project B stay independent -------------------------------
{
  const store = createStorage(memoryBackend());
  const a = saveProject(store, projectA());
  const b = saveProject(store, projectB());
  assert.notEqual(a.id, b.id);
  assert.equal(listSavedProjects(store).length, 2);

  const reopenedA = loadProject(store, a.storageKey);
  assert.equal(reopenedA.property.resolvedAddress, '130 Wheeler Road');
  assert.equal(reopenedA.type, 'basement_finish');
  assert.deepEqual(reopenedA.answers, { sleepingRoomAdded: 'yes', bathroomAdded: 'no' });
  assert.equal(reopenedA.answers.deckHeight, undefined, 'project B answers must not appear in A');
  assert.equal(reopenedA.steps[0].status, 'complete');

  const reopenedB = loadProject(store, b.storageKey);
  assert.equal(reopenedB.property.resolvedAddress, '22 Commonwealth Avenue');
  assert.equal(reopenedB.answers.sleepingRoomAdded, undefined, 'project A answers must not appear in B');

  // Mutating a restored state must not affect the stored record or the sibling.
  const stateA = restoreProjectState(reopenedA);
  stateA.answers.bathroomAdded = 'yes';
  stateA.property.resolvedAddress = 'mutated';
  const reloadedA = loadProject(store, a.storageKey);
  assert.equal(reloadedA.answers.bathroomAdded, 'no');
  assert.equal(reloadedA.property.resolvedAddress, '130 Wheeler Road');
  assert.equal(loadProject(store, b.storageKey).property.resolvedAddress, '22 Commonwealth Avenue');
}

// --- refresh: saved data survives a fresh storage wrapper --------------------
{
  const backend = memoryBackend();
  const store = createStorage(backend);
  const a = saveProject(store, projectA());
  saveProject(store, projectB());

  const afterRefresh = createStorage(memoryBackend(backend.snapshot()));
  const saved = listSavedProjects(afterRefresh);
  assert.equal(saved.length, 2, 'saved projects survive a refresh');
  const restored = restoreProjectState(loadProject(afterRefresh, a.storageKey));
  assert.equal(restored.id, a.id, 'project identity is stable across a refresh');
  assert.equal(restored.type, 'basement_finish');
  assert.equal(restored.property.resolvedAddress, '130 Wheeler Road');
  assert.deepEqual(restored.answers, { sleepingRoomAdded: 'yes', bathroomAdded: 'no' });
  assert.deepEqual(restored.clarifierState, { sleepingUse: 'sleeping' });
  assert.equal(restored.steps.length, 2);
}

// --- expiry and invalid records ---------------------------------------------
{
  const store = createStorage(memoryBackend());
  const saved = saveProject(store, projectA(), Date.now() - 40 * 24 * 60 * 60 * 1000);
  assert.equal(listSavedProjects(store).length, 0, 'expired projects are dropped');
  assert.equal(loadProject(store, saved.storageKey), null);

  store.set('nhpp-project:broken', 'not json');
  assert.equal(listSavedProjects(store).length, 0);
}

// --- identity helpers --------------------------------------------------------
{
  const store = createStorage(memoryBackend());
  const a = saveProject(store, projectA());
  assert.equal(
    findSavedByIdentity(store, projectIdentity(projectA())).id,
    a.id
  );
  assert.equal(findSavedByIdentity(store, projectIdentity(projectB())), null);
}

// --- storage unavailable (privacy mode) --------------------------------------
{
  const broken = createStorage({
    get length() { return 0; },
    key() { return null; },
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); }
  });
  assert.equal(broken.available, false);
  assert.equal(saveProject(broken, projectA()), null);
  assert.deepEqual(listSavedProjects(broken), []);
}

console.log('project state isolation & persistence tests: PASS');
