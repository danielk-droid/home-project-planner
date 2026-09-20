import assert from 'node:assert/strict';
import rules from '../data/rules.json' with {type:'json'};
import sources from '../data/sources.json' with {type:'json'};
import dependencies from '../data/dependencies.json' with {type:'json'};
const sourceIds=new Set(sources.map(x=>x.id));
assert.equal(new Set(rules.map(x=>x.id)).size,rules.length,'duplicate rule IDs');
for(const r of rules){assert.ok(r.id&&r.status&&r.action&&r.sourceIds?.length,'incomplete rule '+r.id);for(const id of r.sourceIds)assert.ok(sourceIds.has(id),'unknown source '+id);}
const stepIds=new Set(dependencies.map(x=>x.id));
for(const d of dependencies)for(const dep of d.dependsOn)assert.ok(stepIds.has(dep),'unknown dependency '+dep);
assert.ok(rules.every(r=>r.status!=='needs_confirmation'||r.reviewRequired===true));
console.log('data integrity: PASS ('+rules.length+' rules, '+sources.length+' sources, '+dependencies.length+' steps)');