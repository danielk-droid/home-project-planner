import assert from 'node:assert/strict';
import rules from '../data/rules.json' with {type:'json'};
import sources from '../data/sources.json' with {type:'json'};
import dependencies from '../data/dependencies.json' with {type:'json'};
import questions from '../data/questions.json' with {type:'json'};
import catalog from '../data/project_catalog.json' with {type:'json'};

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
    for(const [key] of (q.showWhen||[])) assert.ok(flow.questions.some(x=>x.id===key),'unknown showWhen key '+flow.id+'.'+key);
    for(const [key] of (q.showWhenAny||[])) assert.ok(flow.questions.some(x=>x.id===key),'unknown showWhenAny key '+flow.id+'.'+key);
  }
}
// Verify every rule condition references a property/project field that the core context can provide.
const knownPropertyFields = new Set(['zoningDistrict','historicDistrict','floodplain','conservationPotential','historicExteriorReview','openPermitsUnknown','yearBuilt','lotSizeSqFt','parcelId']);
const knownProjectFields = new Set([
  'buildingWork','projectDescription','condo','condoUncertain','condoApproval','condoApprovalUncertain',
  'demolition','demolitionUncertain','guttingMoreThanHalf','guttingUncertain','addedAreaOver1000','addedAreaUncertain',
  'additionStories','additionStoriesUncertain','footprintChange','footprintChangeUncertain',
  'deckNew','deckNewUncertain','deckHeightFt','deckHeightUncertain','stairsOrGuard','stairsOrGuardUncertain',
  'ceilingHeightFt','ceilingHeightUncertain','bathroomLayoutChange','bathroomLayoutUncertain',
  'siteWork','siteWorkUncertain','electricalWork','electricalUncertain','plumbingWork','plumbingUncertain','gasWork','gasUncertain',
  'structuralChanges','structuralUncertain','exteriorConstruction','exteriorUncertain','expansion','sleepingRoomAdded','sleepingRoomUncertain',
  'bathroomAdded','bathroomUncertain','ventilationWork','ventilationUncertain','windowWork','windowUncertain','treeImpact','treeImpactUncertain'
]);
for(const r of rules){
  for(const token of r.when.match(/[\\w]+\\.[\\w]+/g)||[]){
    const [scope,key]=token.split('.');
    assert.ok(scope==='property'||scope==='project','unknown rule scope '+r.id+' '+token);
    assert.ok(scope==='property'?knownPropertyFields.has(key):knownProjectFields.has(key),'unknown rule field '+r.id+' '+token);
  }
}
assert.ok(sources.every(s=>s.lastVerified),'source freshness metadata missing');
console.log('data integrity: PASS ('+rules.length+' rules, '+sources.length+' sources, '+dependencies.length+' steps, '+questions.length+' adaptive flows)');

const catalogCount=catalog.categories.reduce((n,c)=>n+c.items.length,0);
assert.equal(catalogCount,100,'project catalog should contain 100 detailed options');
assert.equal(new Set(catalog.categories.map(c=>c.id)).size,catalog.categories.length,'duplicate catalog categories');
assert.ok(catalog.categories.every(c=>c.label&&c.items?.length===10),'catalog categories should each contain 10 options');
console.log('project catalog integrity: PASS ('+catalogCount+' detailed options)');
