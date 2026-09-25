import fs from 'node:fs';
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
      assert.ok(!q.options.some(([value,label])=>value==='unsure' && /still not sure/i.test(label)),'nested uncertainty option '+flow.id+'.'+q.id);
    }
    if(q.optional) assert.equal(q.skipLabel,'Skip','optional questions should use the concise Skip action');
    for(const [key] of (q.showWhen||[])) assert.ok(flow.questions.some(x=>x.id===key),'unknown showWhen key '+flow.id+'.'+key);
    for(const [key] of (q.showWhenAny||[])) assert.ok(flow.questions.some(x=>x.id===key),'unknown showWhenAny key '+flow.id+'.'+key);
  }
}
// Verify every rule condition references a property/project field that the core context can provide.
const knownPropertyFields = new Set(['zoningDistrict','historicDistrict','floodplain','conservationPotential','historicExteriorReview','openPermitsUnknown','yearBuilt','lotSizeSqFt','parcelId']);
const knownProjectFields = new Set([
  'buildingWork','buildingWorkUncertain','projectDescription','condo','condoUncertain','condoApproval','condoApprovalUncertain',
  'demolition','demolitionUncertain','guttingMoreThanHalf','guttingUncertain','addedAreaOver1000','addedAreaUncertain',
  'additionStories','additionStoriesUncertain','footprintChange','footprintChangeUncertain',
  'deckNew','deckNewUncertain','deckHeightFt','deckHeightUncertain','stairsOrGuard','stairsOrGuardUncertain',
  'ceilingHeightFt','ceilingHeightUncertain','bathroomLayoutChange','bathroomLayoutUncertain',
  'siteWork','siteWorkUncertain','electricalWork','electricalUncertain','plumbingWork','plumbingUncertain','gasWork','gasUncertain',
  'structuralChanges','structuralUncertain','exteriorConstruction','exteriorUncertain','expansion','sleepingRoomAdded','sleepingRoomUncertain',
  'bathroomAdded','bathroomUncertain','ventilationWork','ventilationUncertain','windowWork','windowUncertain','treeImpact','treeImpactUncertain','treeSaveAreaUncertain','mechanicalWork','mechanicalUncertain','mechanicalExterior','zoningRelevant','zoningUncertain','siteReviewRelevant','landDisturbanceSqFt','landDisturbanceSqFtKnown','newImperviousSqFt','newImperviousSqFtKnown','newRetainingWall','trenchDewatering','drainageChange','stormwaterFactsUncertain','localLandmark','preservationRestriction','nationalRegister','ageAtLeast50','ageBoundaryUncertain','ageOver50','ageOver50Boundary','ageUnknown','historicStatusUncertain','useChange','useChangeUncertain','unitCountChange','unitCountChangeUncertain','fireProtectionWork','hotWork','advanceFireApprovalPotential','basementPresent','eeroFactsUncertain'
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


const indexHtml=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const appJs=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const stylesCss=fs.readFileSync(new URL('../styles.css', import.meta.url),'utf8');

assert.equal((indexHtml.match(/data-page-link="privacy"/g)||[]).length,1,'privacy should only be linked from the footer');
assert.equal((indexHtml.match(/data-page-link="terms"/g)||[]).length,1,'terms should only be linked from the footer');
assert.ok(indexHtml.includes('<a href="#privacy" data-page-link="privacy">Privacy</a>'),'footer privacy link missing');
assert.ok(indexHtml.includes('<a href="#terms" data-page-link="terms">Terms</a>'),'footer terms link missing');
assert.ok(indexHtml.includes('<a href="#how" data-page-link="how">Evidence-backed planning</a>'),'footer evidence-backed planning link missing');
assert.ok(/const pageIds = \['home','about','how','mission','feedback','privacy','terms','plan'\]/.test(appJs),'page routing list is incomplete');
assert.ok(appJs.includes('function cleanupHiddenAnswers()'),'Continue path is missing answer-cleanup handler');
assert.ok(appJs.includes("const error = $('error');") && appJs.includes("Please enter your Newton property address before continuing."),'address validation is missing');
assert.ok(appJs.includes("hero-breathe"),'persistent hero breathing state is missing');
assert.match(stylesCss,/\.page\.legal-page\{display:none/,'legal pages must be hidden unless routed');
assert.match(stylesCss,/\.page\.legal-page\.page-active\{display:grid/,'active legal page must be routable');

const catalogCount=catalog.categories.reduce((n,c)=>n+c.items.length,0);
assert.equal(catalogCount,65,'permit-audited project catalog should contain the 65 retained detailed options');
assert.ok(['basement_finish','bathroom_renovation','deck','addition','general_project'].every(id => questions.some(flow => flow.id === id)),'all core project flows remain present');
assert.equal(new Set(catalog.categories.map(c=>c.id)).size,catalog.categories.length,'duplicate catalog categories');
assert.ok(catalog.categories.every(c=>c.label&&Array.isArray(c.items)&&c.items.length>0),'catalog categories should contain at least one audited option');
const removedNonPermitExamples = new Set(['Replace kitchen cabinets','Replace kitchen countertops','Build a patio','Build or replace a fence','Build a shed','Repair a roof','Install a walkway','Landscape a large area','Something else not listed here']);
for(const cat of catalog.categories) for(const item of cat.items) assert.ok(!removedNonPermitExamples.has(item),'non-permit catalog item remains: '+item);
console.log('project catalog integrity: PASS ('+catalogCount+' detailed options)');
