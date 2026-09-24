export const PROJECT_RETENTION_DAYS = 30;
export const PROJECT_RETENTION_MS = PROJECT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const STORAGE_PREFIX = 'nhpp-project:';

export function projectSaveKeyFor(project) {
  if (project?.projectId) return STORAGE_PREFIX + project.projectId;
  return STORAGE_PREFIX + [
    project?.type || '',
    project?.answers?.projectCatalogId || project?.projectCatalogId || '',
    project?.property?.resolvedAddress || ''
  ].join(':');
}

export function createProjectId(now = Date.now(), random = Math.random) {
  return 'p-' + now.toString(36) + '-' + Math.floor(random() * 0xFFFFFFF).toString(36);
}

export function serializeSavedProject(project, now = Date.now()) {
  const updatedAt = project.updatedAt || new Date(now).toISOString();
  return {
    projectId: project.projectId || createProjectId(now),
    type: project.type,
    property: project.property,
    answers: project.answers || {},
    steps: (project.steps || []).map(s => ({...s, status:s.status === 'complete' ? 'complete' : 'not_started'})),
    projectCatalogLabel: project.projectCatalogLabel || project.answers?.projectCatalogLabel || null,
    clarifierState: project.clarifierState || {},
    clarificationMeta: project.clarificationMeta || {},
    clarifierQuestionMemory: project.clarifierQuestionMemory || {},
    updatedAt,
    expiresAt: new Date(now + PROJECT_RETENTION_MS).toISOString()
  };
}

export function isSavedProjectActive(project, now = Date.now()) {
  if (!project?.type || !project?.property?.resolvedAddress) return false;
  const updatedAt = Date.parse(project.updatedAt || '');
  const expiresAt = Date.parse(project.expiresAt || '') || (updatedAt + PROJECT_RETENTION_MS);
  return Number.isFinite(updatedAt) && updatedAt > 0 && expiresAt > now;
}

export function restoreSavedProjectState(project) {
  return {
    projectId: project?.projectId || null,
    type: project?.type || null,
    property: project?.property || null,
    answers: {...(project?.answers || {})},
    steps: Array.isArray(project?.steps) ? project.steps.map(s => ({...s})) : [],
    clarifierState: {...(project?.clarifierState || {})},
    clarificationMeta: {...(project?.clarificationMeta || {})},
    clarifierQuestionMemory: {...(project?.clarifierQuestionMemory || {})}
  };
}
