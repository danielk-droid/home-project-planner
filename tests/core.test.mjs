import assert from 'node:assert/strict';
import {buildPlan, normalizeAddress, getQuestions, deriveProject} from '../src/core.js';

const property = {
  zoningDistrict:'R3',
  historicDistrict:null,
  floodplain:null,
  conservationPotential:false,
  historicExteriorReview:false,
  openPermitsUnknown:true
};

assert.equal(normalizeAddress(' 130 Wheeler Road, MA 02459 '),'130 Wheeler Road');

let qs = getQuestions('basement_finish', {});
assert.equal(qs[0].id, 'sleepingRoomAdded');
assert.ok(qs.some(q => q.id === 'bathroomAdded'));

qs = getQuestions('basement_finish', {sleepingRoomAdded:'unsure'});
assert.ok(qs.some(q => q.id === 'sleepingUse'));
assert.ok(!qs.some(q => q.id === 'egressType'));

qs = getQuestions('basement_finish', {sleepingRoomAdded:'yes'});
assert.ok(qs.some(q => q.id === 'egressType'));

const project = deriveProject('basement_finish', {
  sleepingRoomAdded:'yes',
  egressType:'window',
  egressKnown:'unsure',
  bathroomAdded:'yes',
  electricalWork:'yes',
  plumbingWork:'yes',
  gasWork:'no',
  structuralChanges:'unsure',
  exteriorExpansion:'no'
});
assert.equal(project.sleepingRoomAdded, true);
assert.equal(project.bathroomAdded, true);
assert.equal(project.electricalWork, true);
assert.equal(project.structuralChanges, false);
assert.equal(project.structuralUncertain, true);

let p = buildPlan('basement_finish', property, {
  sleepingRoomAdded:'yes',
  egressType:'window',
  egressKnown:'unsure',
  bathroomAdded:'yes',
  electricalWork:'yes',
  plumbingWork:'yes',
  gasWork:'no',
  structuralChanges:'unsure',
  exteriorExpansion:'no'
});
assert.ok(p.results.some(x=>x.id==='project.electrical'&&x.status==='required'));
assert.ok(p.results.some(x=>x.id==='project.plumbing'&&x.status==='required'));
assert.ok(p.results.some(x=>x.id==='basement.egress'&&x.status==='needs_confirmation'));
assert.ok(p.results.some(x=>x.id==='project.structural-uncertain'&&x.status==='needs_confirmation'));
assert.ok(p.results.some(x=>x.id==='workflow.open-permits'&&x.status==='needs_confirmation'));

p = buildPlan('addition',{...property,historicDistrict:'Example District',historicExteriorReview:true,floodplain:'Flood Zone',conservationPotential:true},{
  newArea:500,stories:1,structuralChanges:'yes',electricalWork:'yes',plumbingWork:'no',gasWork:'no',
  windowsOrDoors:'yes',siteWork:'yes',treeImpact:'unsure'
});
assert.ok(p.results.some(x=>x.id==='project.far'));
assert.ok(p.results.some(x=>x.id==='project.tree'));
assert.ok(p.results.some(x=>x.id==='property.historic'));
assert.ok(p.results.some(x=>x.id==='project.conservation'));
assert.ok(p.results.some(x=>x.id==='project.tree-uncertain'));

console.log('core adaptive regression tests: PASS');
