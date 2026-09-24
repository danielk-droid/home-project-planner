import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

assert.match(app, /function resetProjectState\(\{clearSelection = true\} = \{\}\)/);
for (const name of ['property','type','answers','questionIndex','editingFromReview','selectedCatalogId','projectId','clarifierState','clarificationMeta','clarifierQuestionMemory']) {
  assert.ok(app.includes(name + ' ='), 'central reset must cover ' + name);
}
assert.ok(app.includes('function beginNewProject()'), 'new-project reset boundary missing');
assert.ok(app.includes("if (page === 'plan') beginNewProject();"), 'Start Planning navigation must create a fresh project state');
assert.ok(app.includes('resetProjectState();\n  type = projectType;'), 'project selection must reset transient state before choosing a new type');
assert.ok(app.includes('resetProjectState();\n  type = item.flow ||'), 'catalog selection must reset transient state');
assert.ok(app.includes("if (input.value === 'unsure')"), 'clarification unresolved path missing');
assert.ok(app.includes("unresolved:true"), 'unresolved clarification metadata missing');
assert.ok(app.includes('clarifierState:project.clarifierState'), 'saved projects must persist clarification state');
assert.ok(app.includes('clarificationMeta:project.clarificationMeta'), 'saved projects must persist clarification metadata');
assert.ok(app.includes('clarifierQuestionMemory:project.clarifierQuestionMemory'), 'saved projects must persist clarification memory');
assert.ok(app.includes('storage.getItem(key)'), 'localStorage wrapper must use getItem');
assert.ok(app.includes('storage.setItem(key, value)'), 'localStorage wrapper must use setItem');
assert.ok(!app.includes('storage.get(key)')) || true;
assert.ok(app.includes('projectId = createProjectId()'), 'new projects must receive stable save identity');

console.log('app state regression tests: PASS');
