import assert from 'node:assert/strict';
import rules from '../data/rules.json' with {type:'json'};
import sources from '../data/sources.json' with {type:'json'};
import {validateRuleRegistry, evaluateExpression, evaluateExpressionState, evaluateRules} from '../src/regulatory.js';
import {buildPlan} from '../src/core.js';

const errors = validateRuleRegistry(rules, sources);
assert.deepEqual(errors, [], errors.join('\n'));

const statuses = new Set(['required','not_indicated','potentially_required','needs_confirmation','source_unavailable']);
assert.ok(rules.every(r => statuses.has(r.status)));
assert.ok(rules.every(r => r.triggerFacts.length > 0));
assert.ok(rules.every(r => r.requiredFacts.length > 0));
assert.ok(rules.every(r => r.decisionLogic.type === 'expression'));
assert.ok(rules.every(r => r.possibleOutputs.includes(r.status)));
assert.ok(rules.every(r => r.sourceIds.every(id => sources.some(s => s.id === id))));
assert.ok(rules.every(r => new Set(r.triggerFacts).size === r.triggerFacts.length));
assert.ok(rules.every(r => new Set(r.requiredFacts).size === r.requiredFacts.length));

const land = 'project.landDisturbanceSqFt > 5000';
assert.equal(evaluateExpression(land,{project:{landDisturbanceSqFt:4999}}),false);
assert.equal(evaluateExpression(land,{project:{landDisturbanceSqFt:5000}}),false);
assert.equal(evaluateExpression(land,{project:{landDisturbanceSqFt:5001}}),true);
assert.equal(evaluateExpressionState(land,{project:{}}),'unknown');
assert.equal(evaluateExpressionState(land,{project:{landDisturbanceSqFt:null}}),'unknown');

const impervious='project.newImperviousSqFt >= 401 && project.newImperviousSqFt <= 1000';
assert.equal(evaluateExpression(impervious,{project:{newImperviousSqFt:400}}),false);
assert.equal(evaluateExpression(impervious,{project:{newImperviousSqFt:401}}),true);
assert.equal(evaluateExpression(impervious,{project:{newImperviousSqFt:1000}}),true);
assert.equal(evaluateExpression(impervious,{project:{newImperviousSqFt:1001}}),false);
assert.equal(evaluateExpressionState(impervious,{project:{}}),'unknown');

for (const value of [undefined,null]) {
  assert.equal(evaluateExpressionState('property.floodplain == null',{property:{floodplain:value}}),'affirmative');
  assert.equal(evaluateExpressionState('property.floodplain != null',{property:{floodplain:value}}),'negative');
  assert.equal(evaluateExpression('property.floodplain != null',{property:{floodplain:value}}),false);
  assert.equal(evaluateExpressionState('property.historicDistrict == null',{property:{historicDistrict:value}}),'affirmative');
  assert.equal(evaluateExpressionState('property.historicDistrict != null',{property:{historicDistrict:value}}),'negative');
}
assert.equal(evaluateExpressionState('property.floodplain != null',{property:{floodplain:false}}),'affirmative');
assert.equal(evaluateExpressionState('property.floodplain != null',{property:{floodplain:true}}),'affirmative');

const baseProperty={zoningDistrict:'R3',historicDistrict:null,floodplain:null,conservationPotential:false,historicExteriorReview:false,yearBuilt:1980,historicStatusUnknown:false,openPermitsUnknown:false};
for (const floodplain of [undefined,null,false,true]) {
  const ctx={project:{siteReviewRelevant:true},property:{...baseProperty,floodplain}};
  const floodRule=rules.find(r=>r.id==='property.floodplain');
  const result=evaluateRules(ctx, [floodRule], sources);
  assert.equal(result.some(r=>r.id==='property.floodplain' && r.status==='potentially_required'), floodplain === true);
}
for (const historicDistrict of [undefined,null,false,true]) {
  const ctx={project:{exteriorConstruction:true},property:{...baseProperty,historicDistrict}};
  const historicRule=rules.find(r=>r.id==='property.historic');
  const result=evaluateRules(ctx,[historicRule],sources);
  assert.equal(result.some(r=>r.id==='property.historic' && r.status==='required'), historicDistrict === true);
}

const property=baseProperty;
const stormMissing=buildPlan('general_project',property,{primaryWorkArea:'site',siteWork:'yes'});
assert.ok(stormMissing.results.some(r=>r.id==='project.stormwater-uncertain' && r.status==='needs_confirmation'));
const stormWallUnsure=buildPlan('general_project',property,{primaryWorkArea:'site',siteWork:'yes',landDisturbanceKnown:'yes',landDisturbanceSqFt:0,newImperviousSqFt:0,retainingWallNew:'unsure',trenchDewatering:'no'});
assert.ok(stormWallUnsure.results.some(r=>r.id==='project.stormwater-uncertain' && r.status==='needs_confirmation'));
const stormDewaterUnsure=buildPlan('general_project',property,{primaryWorkArea:'site',siteWork:'yes',landDisturbanceKnown:'yes',landDisturbanceSqFt:0,newImperviousSqFt:0,retainingWallNew:'no',trenchDewatering:'unsure'});
assert.ok(stormDewaterUnsure.results.some(r=>r.id==='project.stormwater-uncertain' && r.status==='needs_confirmation'));

const treeUnknown=buildPlan('general_project',property,{primaryWorkArea:'site',siteWork:'yes',treeSaveAreaKnown:undefined});
assert.ok(treeUnknown.results.some(r=>r.id==='project.tree-save-area-uncertain' && r.status==='needs_confirmation'));

const eeroMissing=buildPlan('basement_finish',property,{sleepingRoomAdded:'yes',egressType:'window',egressKnown:'yes'});
assert.ok(eeroMissing.results.some(r=>r.id==='basement.eero-uncertain' && r.status==='needs_confirmation'));

const historicAgeMissing=buildPlan('general_project',property,{primaryWorkArea:'exterior',exteriorChange:'yes',demolition:'yes'});
assert.ok(historicAgeMissing.results.some(r=>r.id==='project.historic-age-uncertain' && r.status==='needs_confirmation'));

const yes=buildPlan('general_project',property,{primaryWorkArea:'systems',systemType:'electrical',electricalWork:'yes',structuralChanges:'no',demolition:'no',exteriorChange:'no',siteWork:'no'});
const no=buildPlan('general_project',property,{primaryWorkArea:'systems',systemType:'electrical',electricalWork:'no',structuralChanges:'no',demolition:'no',exteriorChange:'no',siteWork:'no'});
const unknown=buildPlan('general_project',property,{primaryWorkArea:'systems',systemType:'electrical',electricalWork:'unsure',structuralChanges:'no',demolition:'no',exteriorChange:'no',siteWork:'no'});
assert.ok(yes.results.some(r=>r.id==='project.electrical' && r.status==='required'));
assert.ok(!no.results.some(r=>r.id==='project.electrical' && r.status==='required'));
assert.ok(unknown.project.electricalUncertain===true);
assert.ok(unknown.results.some(r=>r.id==='project.electrical-uncertain' && r.status==='needs_confirmation'));

for (const field of ['electricalWork','plumbingWork','gasWork','structuralChanges','exteriorChange','siteWork']) {
  const unsure=buildPlan('general_project',property,{primaryWorkArea:'systems',[field]:'unsure'});
  assert.ok(unsure.results.some(r=>r.status==='needs_confirmation'),field+' unsure must remain uncertain');
}
const fireUnknown=buildPlan('general_project',property,{primaryWorkArea:'systems',fireProtectionWork:'unsure',hotWork:'no'});
assert.ok(fireUnknown.results.some(r=>r.id==='project.fire-approval-uncertain' && r.status==='needs_confirmation'));

const contradiction=buildPlan('basement_finish',property,{sleepingRoomAdded:'no',sleepingUse:'sleeping'});
assert.ok(contradiction.project.contradictions.length>0);
assert.ok(contradiction.results.some(r=>r.id==='project.contradiction' && r.status==='needs_confirmation'));

const systemContradiction=buildPlan('general_project',property,{primaryWorkArea:'interior',systemType:'electrical'});
assert.ok(systemContradiction.project.contradictions.length>0);
assert.ok(systemContradiction.results.some(r=>r.id==='project.contradiction' && r.status==='needs_confirmation'));

const interiorCosmetic=buildPlan('general_project',property,{primaryWorkArea:'interior',structuralChanges:'no',layoutChange:'no',useChange:'no',demolition:'no'});
assert.ok(!interiorCosmetic.results.some(r=>r.id==='project.building' && r.status==='required'));
const interiorLayout=buildPlan('general_project',property,{primaryWorkArea:'interior',layoutChange:'yes'});
assert.ok(interiorLayout.results.some(r=>r.id==='project.building' && r.status==='required'));
const interiorUse=buildPlan('general_project',property,{primaryWorkArea:'interior',useChange:'yes'});
assert.ok(interiorUse.project.buildingWork === true || interiorUse.results.some(r=>r.id==='project.zoning' && r.status==='required'));

const explain=yes.results.find(r=>r.id==='project.electrical');
assert.ok(explain.explanation.ruleId==='project.electrical');
assert.ok(explain.decisionState==='affirmative');
assert.equal(explain.explanation.decisionState,'affirmative');
assert.ok(explain.explanation.sourceIds.length>0);
assert.equal(explain.sourceState.registry,'present');

console.log('regulatory false-certainty and boundary tests: PASS ('+rules.length+' rules)');

const additionMissing = buildPlan('addition',property,{newArea:undefined,stories:undefined});
assert.equal(additionMissing.project.addedAreaOver1000,undefined);
assert.equal(additionMissing.project.additionStories,undefined);
assert.ok(additionMissing.results.some(r=>r.id==='project.energy-major' && r.status==='needs_confirmation'));
assert.ok(additionMissing.results.some(r=>r.id==='addition.stories' && r.status==='needs_confirmation'));

const deckMissing = buildPlan('deck',property,{deckNew:'yes',deckHeight:undefined,stairsOrGuard:'no'});
assert.equal(deckMissing.project.deckHeightFt,undefined);
assert.ok(deckMissing.results.some(r=>r.id==='deck.elevated' && r.status==='needs_confirmation'));

const historicFalse = evaluateRules({project:{exteriorConstruction:true},property:{historicDistrict:false}},[rules.find(r=>r.id==='property.historic')],sources);
assert.equal(historicFalse.length,0);
const historicTrue = evaluateRules({project:{exteriorConstruction:true},property:{historicDistrict:true}},[rules.find(r=>r.id==='property.historic')],sources);
assert.equal(historicTrue.length,1);

const monitorUnavailable = evaluateRules(
  {project:{electricalWork:true}},
  [rules.find(r=>r.id==='project.electrical')],
  sources,
  {sources:{'newton-electrical-plumbing-gas':{health:'unreachable',checkedAt:'2026-09-23T00:00:00Z'}}}
);
assert.equal(monitorUnavailable[0].status,'source_unavailable');
assert.equal(monitorUnavailable[0].sourceState.unavailable,true);

const monitorChanged = evaluateRules(
  {project:{electricalWork:true}},
  [rules.find(r=>r.id==='project.electrical')],
  sources,
  {sources:{'newton-electrical-plumbing-gas':{health:'healthy',changeStatus:'changed_requires_review',checkedAt:'2026-09-23T00:00:00Z'}}}
);
assert.equal(monitorChanged[0].status,'needs_confirmation');
assert.equal(monitorChanged[0].sourceState.changed,true);

const missingSource = evaluateRules(
  {project:{electricalWork:true}},
  [{...rules.find(r=>r.id==='project.electrical'),sourceIds:['missing-source']}],
  sources
);
assert.equal(missingSource[0].status,'source_unavailable');

console.log('source availability boundary tests: PASS');
