import assert from 'node:assert/strict';
import {buildPlan, normalizeAddress, getQuestions, deriveProject, PROJECT_CATALOG, inferClarifiedAnswer} from '../src/core.js';

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

p = buildPlan('deck', property, {
  deckNew:'yes', deckHeight:5, electricalWork:'no', structuralChanges:'yes',
  treeImpact:'unsure', stairsOrGuard:'yes', setbackConstraint:12, demolition:'no', condo:'no'
});
assert.ok(p.results.some(x=>x.id==='deck.elevated'));
assert.ok(p.results.some(x=>x.id==='deck.stairs-guards'));
assert.ok(p.results.some(x=>x.id==='project.tree-uncertain'));

p = buildPlan('bathroom_renovation', property, {
  plumbingWork:'yes', electricalWork:'yes', gasWork:'no', structuralChanges:'no',
  newVentilation:'yes', newWindow:'yes', layoutChange:'yes', condo:'yes', condoApproval:'unsure',
  demolition:'no', guttingExtent:'no'
});
assert.ok(p.results.some(x=>x.id==='bathroom.layout'));
assert.ok(p.results.some(x=>x.id==='project.ventilation'));
assert.ok(p.results.some(x=>x.id==='project.window'));
assert.ok(p.results.some(x=>x.id==='project.condo-approval-uncertain'));

p = buildPlan('addition', property, {
  newArea:1200, stories:2, structuralChanges:'yes', electricalWork:'yes', plumbingWork:'yes', gasWork:'no',
  windowsOrDoors:'yes', siteWork:'yes', treeImpact:'no', footprintChange:'yes',
  condo:'no', demolition:'no', guttingExtent:'no'
});
assert.ok(p.results.some(x=>x.id==='addition.stories'));
assert.ok(p.results.some(x=>x.id==='addition.footprint'));
assert.ok(p.results.some(x=>x.id==='addition.setback'));
assert.ok(p.results.some(x=>x.id==='project.water-sewer'));
assert.ok(p.results.some(x=>x.id==='project.energy-major'));



assert.equal(inferClarifiedAnswer('demolition',['interior','structural']),'yes');
assert.equal(inferClarifiedAnswer('demolition',['none']),'no');
assert.equal(inferClarifiedAnswer('electricalWork',['circuits','fixtures']),'yes');
assert.equal(inferClarifiedAnswer('electricalWork',['none']),'no');
assert.equal(inferClarifiedAnswer('sleepingRoomAdded','sleeping'),'yes');
assert.equal(inferClarifiedAnswer('sleepingRoomAdded','other'),'no');
assert.equal(inferClarifiedAnswer('bathroomAdded','yes'),'yes');
assert.equal(inferClarifiedAnswer('bathroomAdded','no'),'no');
assert.equal(inferClarifiedAnswer('exteriorChange','structure'),'yes');
assert.equal(inferClarifiedAnswer('deckNew','replacement'),'no');
assert.equal(inferClarifiedAnswer('condo','shared'),'yes');
assert.equal(inferClarifiedAnswer('condo','not_shared'),'no');
assert.equal(inferClarifiedAnswer('guttingExtent','more_than_half'),'yes');
assert.equal(inferClarifiedAnswer('guttingExtent','not_more_than_half'),'no');
console.log('core adaptive regression tests: PASS');

const general = getQuestions('general_project', {});
assert.equal(general[0].id,'primaryWorkArea');
let unsure = getQuestions('general_project',{primaryWorkArea:'unsure'});
assert.equal(unsure[1].id,'primaryWorkAreaDetail');
assert.ok(!unsure[1].options.some(([value])=>value==='unsure'));
assert.equal(getQuestions('general_project',{primaryWorkArea:'unsure',primaryWorkAreaDetail:'room'})[1].id,'primaryWorkAreaDetail');
assert.ok(!getQuestions('general_project',{primaryWorkArea:'unsure',primaryWorkAreaDetail:'room'}).some(q => q.id === 'primaryWorkAreaDetail2'));
assert.equal(PROJECT_CATALOG.categories.reduce((n,c)=>n+c.items.length,0),66);
assert.ok(buildPlan('general_project',property,{projectCatalogId:'kitchen_renovation',projectCatalogLabel:'Renovate a kitchen'}).project.projectCatalogLabel==='Renovate a kitchen');
