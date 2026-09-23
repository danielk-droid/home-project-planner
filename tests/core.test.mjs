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
assert.equal(PROJECT_CATALOG.categories.reduce((n,c)=>n+c.items.length,0),65);
assert.ok(buildPlan('general_project',property,{projectCatalogId:'kitchen_renovation',projectCatalogLabel:'Renovate a kitchen'}).project.projectCatalogLabel==='Renovate a kitchen');


const regulatoryProperty = {
  zoningDistrict:'R3',
  historicDistrict:null,
  floodplain:null,
  conservationPotential:false,
  historicExteriorReview:false,
  yearBuilt:1980,
  historicStatusUnknown:true,
  openPermitsUnknown:true
};

function hasResult(plan,id,status=null){
  return plan.results.some(x => x.id === id && (status == null || x.status === status));
}

// Classification: kitchen cabinet/counter scope is not a building workflow merely because a zoning district exists.
p = buildPlan('general_project', regulatoryProperty, {
  projectCatalogId:'kitchen_renovation',
  projectCatalogLabel:'Renovate a kitchen',
  primaryWorkArea:'kitchen',
  structuralChanges:'no',
  demolition:'no',
  electricalWork:'no',
  plumbingWork:'no',
  gasWork:'no',
  exteriorChange:'no',
  siteWork:'no'
});
assert.equal(p.project.buildingWork,false);
assert.equal(hasResult(p,'project.building'),false);
assert.equal(hasResult(p,'property.zoning'),false);

// Broad renovation remains unresolved instead of becoming a building workflow.
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'unsure'});
assert.equal(p.project.buildingWork,false);
assert.equal(p.project.buildingWorkUncertain,true);
assert.equal(hasResult(p,'project.building-uncertain','needs_confirmation'),true);

// Trade-only paths do not inherit building, zoning, or Fire review.
for (const systemType of ['electrical','plumbing','gas']) {
  p = buildPlan('general_project', regulatoryProperty, {
    primaryWorkArea:'systems', systemType,
    electricalWork:systemType==='electrical'?'yes':'no',
    plumbingWork:systemType==='plumbing'?'yes':'no',
    gasWork:systemType==='gas'?'yes':'no',
    structuralChanges:'no', demolition:'no', exteriorChange:'no', siteWork:'no'
  });
  assert.equal(p.project.buildingWork,false);
  assert.equal(hasResult(p,'project.fire'),false);
  assert.equal(hasResult(p,'property.zoning'),false);
}
p = buildPlan('general_project', regulatoryProperty, {
  primaryWorkArea:'systems', systemType:'mechanical',
  mechanicalEquipmentType:'heat_pump', mechanicalInstallation:'replacement',
  mechanicalFuel:'electric', mechanicalDuctwork:'no', mechanicalElectrical:'no',
  mechanicalGas:'no', mechanicalPlumbing:'no', mechanicalExterior:'no',
  structuralChanges:'no', demolition:'no', exteriorChange:'no', siteWork:'no'
});
assert.equal(p.project.mechanicalWork,true);
assert.equal(p.project.buildingWork,false);
assert.equal(hasResult(p,'project.mechanical','required'),true);
assert.equal(hasResult(p,'project.fire'),false);

// Addition and exterior work establish building scope and scope-driven zoning.
p = buildPlan('addition', regulatoryProperty, {
  newArea:500, stories:1, structuralChanges:'yes', electricalWork:'yes',
  plumbingWork:'no', gasWork:'no', windowsOrDoors:'yes', siteWork:'no',
  treeImpact:'no', demolition:'no', footprintChange:'yes'
});
assert.equal(p.project.buildingWork,true);
assert.equal(hasResult(p,'project.building','required'),true);
assert.equal(hasResult(p,'property.zoning','required'),true);
assert.equal(hasResult(p,'project.tree','required'),true);

// Exterior construction triggers Tree Permit evaluation even with no tree removal.
p = buildPlan('general_project', regulatoryProperty, {
  primaryWorkArea:'exterior', structuralChanges:'no', demolition:'no',
  electricalWork:'no', plumbingWork:'no', gasWork:'no', exteriorChange:'yes',
  siteWork:'no', treeImpact:'no'
});
assert.equal(hasResult(p,'project.tree','required'),true);

// Fire semantics: building review is required; advance Fire approval is conditional.
assert.equal(hasResult(buildPlan('addition', regulatoryProperty, {newArea:500,stories:1,structuralChanges:'yes'}),'project.fire','required'),true);
assert.equal(hasResult(buildPlan('addition', regulatoryProperty, {newArea:500,stories:1,structuralChanges:'yes'}),'project.fire-advance','potentially_required'),true);
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'systems',systemType:'electrical',electricalWork:'yes',structuralChanges:'no',demolition:'no',exteriorChange:'no',siteWork:'no'});
assert.equal(hasResult(p,'project.fire'),false);

// Historic pathways are distinct.
const historicBase = {...regulatoryProperty, historicDistrict:'Newtonville'};
p = buildPlan('general_project', historicBase, {primaryWorkArea:'exterior',exteriorChange:'yes',structuralChanges:'no',demolition:'no'});
assert.equal(hasResult(p,'property.historic','required'),true);
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'exterior',exteriorChange:'yes',historicLocalLandmark:'yes',structuralChanges:'no',demolition:'no'});
assert.equal(hasResult(p,'property.local-landmark','required'),true);
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'exterior',exteriorChange:'yes',historicPreservationRestriction:'yes',structuralChanges:'no',demolition:'no'});
assert.equal(hasResult(p,'property.preservation-restriction','required'),true);
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'exterior',exteriorChange:'yes',historicNationalRegister:'yes',structuralChanges:'no',demolition:'no'});
assert.equal(hasResult(p,'property.national-register','required'),true);

p = buildPlan('general_project', {...regulatoryProperty,yearBuilt:1970}, {primaryWorkArea:'interior',demolition:'yes',structuralChanges:'yes'});
assert.equal(hasResult(p,'property.historic-age-demolition','required'),true);
p = buildPlan('general_project', {...regulatoryProperty,yearBuilt:2000}, {primaryWorkArea:'interior',demolition:'yes',structuralChanges:'yes'});
assert.equal(hasResult(p,'property.historic-age-demolition'),false);

// Stormwater thresholds.
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'site',siteWork:'yes',exteriorChange:'yes',landDisturbanceKnown:'yes',landDisturbanceSqFt:200,newImperviousSqFt:100,retainingWallNew:'no',trenchDewatering:'no'});
assert.equal(hasResult(p,'project.stormwater-land-disturbance'),false);
assert.equal(hasResult(p,'project.stormwater-minor-impervious'),false);
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'site',siteWork:'yes',exteriorChange:'yes',landDisturbanceKnown:'yes',landDisturbanceSqFt:5001,newImperviousSqFt:0,retainingWallNew:'no',trenchDewatering:'no'});
assert.equal(hasResult(p,'project.stormwater-land-disturbance','required'),true);
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'site',siteWork:'yes',exteriorChange:'yes',landDisturbanceKnown:'yes',landDisturbanceSqFt:500,newImperviousSqFt:401,retainingWallNew:'no',trenchDewatering:'no'});
assert.equal(hasResult(p,'project.stormwater-minor-impervious','required'),true);
p = buildPlan('general_project', regulatoryProperty, {primaryWorkArea:'site',siteWork:'yes',exteriorChange:'yes',landDisturbanceKnown:'yes',landDisturbanceSqFt:1500,newImperviousSqFt:1200,retainingWallNew:'no',trenchDewatering:'no'});
assert.equal(hasResult(p,'project.stormwater-major-impervious','required'),true);

// Basement EERO applies even without a bedroom; bedroom adds the sleeping-room evaluation.
p = buildPlan('basement_finish', regulatoryProperty, {sleepingRoomAdded:'no',bathroomAdded:'no',electricalWork:'no',plumbingWork:'no',gasWork:'no',structuralChanges:'no',exteriorExpansion:'no'});
assert.equal(hasResult(p,'basement.eero','required'),true);
assert.equal(hasResult(p,'basement.egress'),false);
assert.equal(hasResult(p,'basement.eero-uncertain','needs_confirmation'),true);
p = buildPlan('basement_finish', regulatoryProperty, {sleepingRoomAdded:'yes',egressType:'window',egressKnown:'yes',egressMeasurements:'yes',bathroomAdded:'no',electricalWork:'no',plumbingWork:'no',gasWork:'no',structuralChanges:'no',exteriorExpansion:'no'});
assert.equal(hasResult(p,'basement.eero','required'),true);
assert.equal(hasResult(p,'basement.egress','needs_confirmation'),true);
assert.equal(hasResult(p,'basement.eero-uncertain','needs_confirmation'),true);
