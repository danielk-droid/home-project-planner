import assert from 'node:assert/strict';
import {
  createStorage,
  createEmptyProjectState,
  saveProject,
  loadProject,
  listSavedProjects,
  restoreProjectState,
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
  assert.equal(typeof blank.id, 'string');
  assert.ok(blank.id.length > 0, 'a new project gets its own id at creation');
  assert.notEqual(createEmptyProjectState().id, blank.id, 'every new project gets a different id');
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

  // Identical inputs without the same id are a different project, never merged.
  const separate = saveProject(store, projectA());
  assert.notEqual(separate.id, first.id);
  assert.equal(listSavedProjects(store).length, 2);
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

// Simulates the app flow: Start New Project -> fill in -> Generate Plan (save).
function startProject() { return createEmptyProjectState(); }
function fill(state, { address, type, answers, catalogId = null, clarifier = {} }) {
  state.property = { resolvedAddress: address, zoningDistrict: 'SR2' };
  state.type = type;
  state.selectedCatalogId = catalogId;
  state.answers = { ...(catalogId ? { projectCatalogId: catalogId } : {}), ...answers };
  state.clarifierState = { ...clarifier };
  state.steps = [{ id: 'property', status: 'not_started' }, { id: 'scope', status: 'not_started' }];
  return state;
}
const generate = (store, state) => saveProject(store, { ...state, planGenerated: true });
const SAME = '12 Oak Street';

// --- Test A: complete new-project reset --------------------------------------
{
  const store = createStorage(memoryBackend());
  const a = fill(startProject(), { address: SAME, type: 'addition', catalogId: 'addition',
    answers: { footprintIncrease: 'yes', stories: 2 }, clarifier: { sleepingUse: 'sleeping' } });
  a.clarificationMeta = { x: { asked: true } };
  a.clarifierQuestionMemory = { q1: 'yes' };
  a.questionIndex = 3;
  a.editingFromReview = true;
  const savedA = generate(store, a);

  const next = startProject();
  assert.notEqual(next.id, savedA.id, 'new project id differs from A');
  assert.equal(next.property, null);
  assert.equal(next.type, null);
  assert.equal(next.selectedCatalogId, null);
  assert.deepEqual(next.answers, {});
  assert.deepEqual(next.clarifierState, {});
  assert.deepEqual(next.clarificationMeta, {});
  assert.deepEqual(next.clarifierQuestionMemory, {});
  assert.deepEqual(next.steps, []);
  assert.equal(next.questionIndex, 0);
  assert.equal(next.editingFromReview, false);
  assert.ok(loadProject(store, savedA.storageKey), 'project A remains saved');
  assert.equal(listSavedProjects(store).length, 1);
}

// --- Test B: same address, different project type ----------------------------
// --- Test C: same address, same project type, different details ----------------
{
  const store = createStorage(memoryBackend());
  const a = generate(store, fill(startProject(), { address: SAME, type: 'addition', catalogId: 'addition', answers: { stories: 1 } }));
  const b = generate(store, fill(startProject(), { address: SAME, type: 'general_project', catalogId: 'kitchen_renovation', answers: { layoutChange: 'yes' } }));
  const c = generate(store, fill(startProject(), { address: SAME, type: 'addition', catalogId: 'addition', answers: { stories: 2 } }));
  const d = generate(store, fill(startProject(), { address: SAME, type: 'basement_finish', answers: { bathroomAdded: 'yes' } }));
  assert.equal(new Set([a.id, b.id, c.id, d.id]).size, 4, 'every project has its own id');
  assert.equal(listSavedProjects(store).length, 4, 'all projects at the same address coexist');

  const ra = restoreProjectState(loadProject(store, a.storageKey));
  assert.equal(ra.id, a.id); assert.equal(ra.type, 'addition'); assert.deepEqual(ra.answers, { projectCatalogId: 'addition', stories: 1 });
  const rb = restoreProjectState(loadProject(store, b.storageKey));
  assert.equal(rb.id, b.id); assert.equal(rb.selectedCatalogId, 'kitchen_renovation'); assert.equal(rb.answers.stories, undefined);
  const rc = restoreProjectState(loadProject(store, c.storageKey));
  assert.equal(rc.id, c.id); assert.equal(rc.type, 'addition'); assert.equal(rc.answers.stories, 2, 'same address + type is still a separate project');
}

// --- Test D: regeneration does not duplicate ---------------------------------
{
  const store = createStorage(memoryBackend());
  const a = fill(startProject(), { address: SAME, type: 'addition', catalogId: 'addition', answers: { stories: 1 } });
  const first = generate(store, a);
  const second = generate(store, a);
  a.answers.stories = 2;
  const third = generate(store, a);
  assert.equal(first.id, a.id); assert.equal(second.id, a.id); assert.equal(third.id, a.id);
  assert.equal(listSavedProjects(store).length, 1, 'regenerating updates the same record');
  assert.equal(restoreProjectState(loadProject(store, first.storageKey)).answers.stories, 2, 'latest state restored');
}

// --- Test E: A -> B -> A -> B switching, including across a refresh ----------
{
  const backend = memoryBackend();
  let store = createStorage(backend);
  const a = generate(store, fill(startProject(), { address: SAME, type: 'addition', catalogId: 'addition', answers: { stories: 1 }, clarifier: { use: 'a' } }));
  const b = generate(store, fill(startProject(), { address: SAME, type: 'addition', catalogId: 'addition', answers: { stories: 3 }, clarifier: { use: 'b' } }));
  for (let round = 0; round < 4; round++) {
    if (round === 2) store = createStorage(memoryBackend(backend.snapshot()));
    for (const [rec, stories, use] of [[a, 1, 'a'], [b, 3, 'b']]) {
      const s = restoreProjectState(loadProject(store, rec.storageKey));
      assert.equal(s.id, rec.id);
      assert.equal(s.property.resolvedAddress, SAME);
      assert.equal(s.type, 'addition');
      assert.equal(s.answers.stories, stories);
      assert.deepEqual(s.clarifierState, { use });
      assert.equal(s.steps.length, 2);
      s.answers.stories = 99; // mutating an open project must not leak anywhere
    }
  }
  assert.equal(listSavedProjects(store).length, 2);
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

// Legacy record with no id, and a record whose id disagrees with its key:
// re-saving must update the same key, never create a second copy.
{
  const now = Date.now();
  const legacy = { ...projectA(), updatedAt: new Date(now).toISOString() };
  delete legacy.id;
  const mismatched = { ...projectB(), id: 'other-id', updatedAt: new Date(now).toISOString() };
  const backend = memoryBackend({
    'nhpp-project:basement_finish|basement|130 Wheeler Road': JSON.stringify(legacy),
    'nhpp-project:real-id': JSON.stringify(mismatched)
  });
  const store = createStorage(backend);
  const listed = listSavedProjects(store, now);
  assert.equal(listed.length, 2);
  for (const saved of listed) {
    const state = restoreProjectState(saved);
    assert.equal(storageKeyForId(state.id), saved.storageKey);
    saveProject(store, { ...saved, id: state.id }, now + 1000);
  }
  assert.equal(listSavedProjects(store, now + 2000).length, 2);
  assert.equal(Object.keys(backend.snapshot()).length, 2);
}

// One corrupted record (bad JSON, wrong field shapes, non-object) must not stop
// the others from loading, and wrong-shaped fields are replaced safely.
{
  const now = Date.now();
  const good = saveProject(createStorage(memoryBackend()), projectA(), now);
  const backend = memoryBackend({
    [good.storageKey]: JSON.stringify(good),
    'nhpp-project:bad-json': '{not json',
    'nhpp-project:array': '[1,2,3]',
    'nhpp-project:null': 'null',
    'nhpp-project:no-address': JSON.stringify({ type: 'deck', property: {}, updatedAt: new Date(now).toISOString() }),
    'nhpp-project:bad-shapes': JSON.stringify({
      type: 'deck', property: { resolvedAddress: '22 Commonwealth Avenue' },
      answers: 'oops', steps: 'nope', clarifierState: [1], updatedAt: new Date(now).toISOString()
    }),
    'unrelated-key': 'keep me'
  });
  const store = createStorage(backend);
  const listed = listSavedProjects(store, now);
  assert.deepEqual(listed.map(x => x.property.resolvedAddress).sort(), ['130 Wheeler Road', '22 Commonwealth Avenue']);
  const shaped = loadProject(store, 'nhpp-project:bad-shapes');
  assert.deepEqual(shaped.answers, {});
  assert.deepEqual(shaped.steps, []);
  assert.deepEqual(shaped.clarifierState, {});
  assert.equal(shaped.id, 'bad-shapes');
  assert.equal(loadProject(store, 'nhpp-project:bad-json'), null);
  assert.equal(backend.getItem('unrelated-key'), 'keep me');
}

// Deleting one project leaves every other project intact.
{
  const store = createStorage(memoryBackend());
  const a = saveProject(store, projectA());
  const b = saveProject(store, projectB());
  store.remove(a.storageKey);
  assert.equal(loadProject(store, a.storageKey), null);
  assert.equal(loadProject(store, b.storageKey).property.resolvedAddress, b.property.resolvedAddress);
}

console.log('project state isolation & persistence tests: PASS');
