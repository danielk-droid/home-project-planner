import assert from 'node:assert/strict';
import rules from '../data/rules.json' with {type:'json'};
import sources from '../data/sources.json' with {type:'json'};
import {validateRuleRegistry, evaluateExpression, evaluateRules} from '../src/regulatory.js';
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

const ctx = {project:{landDisturbanceSqFt:0,newImperviousSqFt:400}};
assert.equal(evaluateExpression('project.landDisturbanceSqFt > 5000',ctx),false);
assert.equal(evaluateExpression('project.landDisturbanceSqFt > 5000',{project:{landDisturbanceSqFt:5000}}),false);
assert.equal(evaluateExpression('project.landDisturbanceSqFt > 5000',{project:{landDisturbanceSqFt:5001}}),true);
assert.equal(evaluateExpression('project.newImperviousSqFt >= 401 && project.newImperviousSqFt <= 1000',{project:{newImperviousSqFt:400}}),false);
assert.equal(evaluateExpression('project.newImperviousSqFt >= 401 && project.newImperviousSqFt <= 1000',{project:{newImperviousSqFt:401}}),true);
assert.equal(evaluateExpression('project.newImperviousSqFt >= 401 && project.newImperviousSqFt <= 1000',{project:{newImperviousSqFt:1000}}),true);
assert.equal(evaluateExpression('project.newImperviousSqFt >= 401 && project.newImperviousSqFt <= 1000',{project:{newImperviousSqFt:1001}}),false);
assert.equal(evaluateExpression('project.landDisturbanceSqFt > 5000',{project:{landDisturbanceSqFt:null}}),false);

const property = {zoningDistrict:'R3', historicDistrict:null, floodplain:null, conservationPotential:false, historicExteriorReview:false, yearBuilt:1980, historicStatusUnknown:true, openPermitsUnknown:true};
const yes = buildPlan('general_project',property,{primaryWorkArea:'systems',systemType:'electrical',electricalWork:'yes',structuralChanges:'no',demolition:'no',exteriorChange:'no',siteWork:'no'});
const no = buildPlan('general_project',property,{primaryWorkArea:'systems',systemType:'electrical',electricalWork:'no',structuralChanges:'no',demolition:'no',exteriorChange:'no',siteWork:'no'});
const unknown = buildPlan('general_project',property,{primaryWorkArea:'systems',systemType:'electrical',electricalWork:'unsure',structuralChanges:'no',demolition:'no',exteriorChange:'no',siteWork:'no'});
assert.ok(yes.results.some(r=>r.id==='project.electrical' && r.status==='required'));
assert.ok(!no.results.some(r=>r.id==='project.electrical' && r.status==='required'));
assert.ok(unknown.project.electricalUncertain === true);
assert.ok(unknown.results.some(r=>r.id==='project.electrical-uncertain' && r.status==='needs_confirmation'));

const explain = yes.results.find(r=>r.id==='project.electrical');
assert.ok(explain.explanation.ruleId === 'project.electrical');
assert.ok(Array.isArray(explain.explanation.triggerFacts));
assert.ok(explain.explanation.sourceIds.length > 0);
assert.ok(explain.explanation.lastVerified);

console.log('regulatory rule boundary tests: PASS ('+rules.length+' rules)');
