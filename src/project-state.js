// Project state model shared by the app shell and the regression tests.
// Pure logic only: no DOM access, no UI, no regulatory rules.

export const STORAGE_PREFIX = 'nhpp-project:';
export const PROJECT_RETENTION_DAYS = 30;
export const PROJECT_RETENTION_MS = PROJECT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// A brand new project must never inherit anything from a previous one.
export function createEmptyProjectState() {
  return {
    id: null,
    type: null,
    property: null,
    answers: {},
    selectedCatalogId: null,
    clarifierState: {},
    clarificationMeta: {},
    clarifierQuestionMemory: {},
    questionIndex: 0,
    editingFromReview: false,
    steps: []
  };
}

export function newProjectId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function storageKeyForId(id) {
  return STORAGE_PREFIX + id;
}

// Stable identity of a project: the same address + project type + catalog item
// is the same project, so re-generating a plan updates it instead of duplicating it.
export function projectIdentity(project) {
  const catalogId = project?.answers?.projectCatalogId || project?.projectCatalogId || '';
  const address = project?.property?.resolvedAddress || '';
  return [project?.type || '', catalogId, address].join('|');
}

// Safe wrapper around a Storage-like backend (localStorage).
export function createStorage(backend) {
  const available = (() => {
    try {
      if (!backend) return false;
      const probe = '__nhpp_storage_test__';
      backend.setItem(probe, '1');
      backend.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  })();

  return {
    available,
    get(key) { if (!available) return null; try { return backend.getItem(key); } catch { return null; } },
    set(key, value) { if (!available) return false; try { backend.setItem(key, value); return true; } catch { return false; } },
    remove(key) { if (!available) return false; try { backend.removeItem(key); return true; } catch { return false; } },
    length() { if (!available) return 0; try { return backend.length; } catch { return 0; } },
    key(index) { if (!available) return null; try { return backend.key(index); } catch { return null; } }
  };
}

function parse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function validSaved(saved) {
  return Boolean(saved?.type && saved?.property?.resolvedAddress);
}

export function allSavedKeys(store) {
  const keys = [];
  for (let i = 0; i < store.length(); i++) {
    const key = store.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

export function listSavedProjects(store, now = Date.now()) {
  const items = [];
  if (!store.available) return items;
  for (const key of allSavedKeys(store)) {
    const saved = parse(store.get(key));
    if (!validSaved(saved)) continue;
    const lastUpdated = Date.parse(saved.updatedAt || '') || 0;
    const expiresAt = Date.parse(saved.expiresAt || '') || (lastUpdated + PROJECT_RETENTION_MS);
    if (!lastUpdated || expiresAt <= now) {
      store.remove(key);
      continue;
    }
    if (!saved.expiresAt) saved.expiresAt = new Date(expiresAt).toISOString();
    saved.storageKey = key;
    items.push(saved);
  }
  return items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function findSavedByIdentity(store, identity) {
  if (!store.available || !identity) return null;
  for (const key of allSavedKeys(store)) {
    const saved = parse(store.get(key));
    if (!validSaved(saved)) continue;
    if (projectIdentity(saved) === identity) {
      saved.storageKey = key;
      return saved;
    }
  }
  return null;
}

export function loadProject(store, key) {
  const saved = parse(store.get(key));
  return validSaved(saved) ? saved : null;
}

export function removeProject(store, key) {
  return store.remove(key);
}

// Saves the complete project under a stable id. Re-saving the same project
// (same id, or same address/type/catalog identity) updates the existing record.
export function saveProject(store, project, now = Date.now()) {
  if (!store.available || !validSaved(project)) return null;

  let id = project.id || null;
  if (id && !loadProject(store, storageKeyForId(id))) {
    // keep the id even if the record was removed; it stays this project's identity
  }
  if (!id) {
    const existing = findSavedByIdentity(store, projectIdentity(project));
    id = existing?.id || newProjectId();
    if (existing?.storageKey && existing.storageKey !== storageKeyForId(id)) {
      store.remove(existing.storageKey);
    }
  }

  const record = {
    id,
    type: project.type,
    property: project.property,
    answers: project.answers ? JSON.parse(JSON.stringify(project.answers)) : {},
    selectedCatalogId: project.selectedCatalogId || project.answers?.projectCatalogId || null,
    projectCatalogLabel: project.projectCatalogLabel || project.answers?.projectCatalogLabel || null,
    clarifierState: project.clarifierState ? JSON.parse(JSON.stringify(project.clarifierState)) : {},
    clarificationMeta: project.clarificationMeta ? JSON.parse(JSON.stringify(project.clarificationMeta)) : {},
    clarifierQuestionMemory: project.clarifierQuestionMemory
      ? JSON.parse(JSON.stringify(project.clarifierQuestionMemory))
      : {},
    steps: (project.steps || []).map(step => ({ ...step })),
    planGenerated: project.planGenerated !== false,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PROJECT_RETENTION_MS).toISOString()
  };

  const key = storageKeyForId(id);
  store.set(key, JSON.stringify(record));
  record.storageKey = key;
  return record;
}

// Rebuilds a full in-memory project state from a saved record, with no
// reference shared with the stored object or with any other project.
export function restoreProjectState(saved) {
  const state = createEmptyProjectState();
  if (!validSaved(saved)) return state;
  const clone = JSON.parse(JSON.stringify(saved));
  state.id = clone.id || null;
  state.type = clone.type;
  state.property = clone.property;
  state.answers = clone.answers || {};
  state.selectedCatalogId = clone.selectedCatalogId || clone.answers?.projectCatalogId || null;
  state.clarifierState = clone.clarifierState || {};
  state.clarificationMeta = clone.clarificationMeta || {};
  state.clarifierQuestionMemory = clone.clarifierQuestionMemory || {};
  state.steps = clone.steps || [];
  state.questionIndex = 0;
  state.editingFromReview = false;
  return state;
}
