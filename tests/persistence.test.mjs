import assert from 'node:assert/strict';
import {
  PROJECT_RETENTION_MS,
  projectSaveKeyFor,
  serializeSavedProject,
  isSavedProjectActive,
  restoreSavedProjectState
} from '../src/persistence.js';

const now = Date.parse('2026-09-23T12:00:00.000Z');
const property = {resolvedAddress:'130 Wheeler Road', zoningDistrict:'R3'};
const base = {
  projectId:'p-project-a',
  type:'general_project',
  property,
  answers:{projectCatalogId:'kitchen_renovation', electricalWork:'unsure'},
  steps:[{id:'property',status:'complete'},{id:'scope',status:'not_started'}],
  clarifierState:{'__clarifier_electricalWork':'unsure'},
  clarificationMeta:{'__clarifier_electricalWork':{parentId:'electricalWork',unresolved:true}},
  clarifierQuestionMemory:{electricalWork:'__clarifier_electricalWork'}
};

const savedA = serializeSavedProject(base, now);
assert.equal(projectSaveKeyFor(savedA),'nhpp-project:p-project-a');
assert.equal(savedA.projectId,'p-project-a');
assert.equal(savedA.steps[0].status,'complete');
assert.equal(savedA.answers.electricalWork,'unsure');
assert.equal(savedA.clarificationMeta.__clarifier_electricalWork.unresolved,true);
assert.equal(isSavedProjectActive(savedA, now + PROJECT_RETENTION_MS - 1),true);
assert.equal(isSavedProjectActive(savedA, now + PROJECT_RETENTION_MS),false);

const savedB = serializeSavedProject({
  ...base,
  projectId:'p-project-b',
  answers:{projectCatalogId:'systems-0',systemType:'electrical',electricalWork:'yes'}
}, now + 1000);
assert.notEqual(projectSaveKeyFor(savedA),projectSaveKeyFor(savedB));

const restored = restoreSavedProjectState(savedA);
assert.equal(restored.projectId,'p-project-a');
assert.equal(restored.answers.electricalWork,'unsure');
assert.equal(restored.clarifierState.__clarifier_electricalWork,'unsure');
assert.equal(restored.clarificationMeta.__clarifier_electricalWork.unresolved,true);
assert.equal(restored.clarifierQuestionMemory.electricalWork,'__clarifier_electricalWork');

const legacy = {
  type:'general_project',
  property,
  answers:{projectCatalogId:'kitchen_renovation'},
  updatedAt:new Date(now).toISOString(),
  expiresAt:new Date(now + PROJECT_RETENTION_MS).toISOString()
};
assert.equal(
  projectSaveKeyFor(legacy),
  'nhpp-project:general_project:kitchen_renovation:130 Wheeler Road'
);

console.log('persistence regression tests: PASS');
