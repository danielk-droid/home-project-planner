import assert from 'node:assert/strict';
import rules from '../data/rules.json' with {type:'json'};
import sources from '../data/sources.json' with {type:'json'};
import dependencies from '../data/dependencies.json' with {type:'json'};
import questions from '../data/questions.json' with {type:'json'};

const sourceIds=new Set(sources.map(x=>x.id));
assert.equal(new Set(rules.map(x=>x.id)).size,rules.length,'duplicate rule IDs');
for(const r of rules){
  assert.ok(r.id&&r.status&&r.action&&r.sourceIds?.length,'incomplete rule '+r.id);
  for(const id of r.sourceIds) assert.ok(sourceIds.has(id),'unknown source '+id);
}
const stepIds=new Set(dependencies.map(x=>x.id));
for(const d of dependencies) for(const dep of d.dependsOn) assert.ok(stepIds.has(dep),'unknown dependency '+dep);
assert.ok(rules.every(r=>r.status!=='needs_confirmation'||r.reviewRequired===true));

assert.equal(new Set(questions.map(x=>x.id)).size,questions.length,'duplicate project question flows');
for(const flow of questions){
  assert.ok(flow.label && flow.questions?.length,'incomplete question flow '+flow.id);
  const ids=new Set();
  for(const q of flow.questions){
    assert.ok(q.id&&q.text&&q.kind,'incomplete question '+flow.id);
    assert.ok(!ids.has(q.id),'duplicate question '+flow.id+'.'+q.id);
    ids.add(q.id);
    if(q.kind==='choice'){
      assert.ok(q.options?.length>=2,'choice needs options '+flow.id+'.'+q.id);
      assert.ok(q.options.every(x=>Array.isArray(x)&&x.length===2),'malformed option '+flow.id+'.'+q.id);
    }
    for(const [key] of (q.showWhen||[])) assert.ok(flow.questions.some(x=>x.id===key),'unknown showWhen key '+flow.id+'.'+key);\n    for(const [key] of (q.showWhenAny||[])) assert.ok(flow.questions.some(x=>x.id===key),'unknown showWhenAny key '+flow.id+'.'+key);
  }
}
console.log('data integrity: PASS ('+rules.length+' rules, '+sources.length+' sources, '+dependencies.length+' steps, '+questions.length+' adaptive flows)');
