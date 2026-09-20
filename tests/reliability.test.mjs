import assert from 'node:assert/strict';
import {buildPlan} from '../src/core.js';

const base={
  zoningDistrict:'R3',
  historicDistrict:null,
  floodplain:null,
  conservationPotential:false,
  historicExteriorReview:false,
  openPermitsUnknown:true
};

let count=0;
const cases=[];

for(const sleeping of ['no','yes','unsure'])
  for(const bath of ['no','yes','unsure'])
    for(const elec of ['no','yes','unsure'])
      for(const plumbing of ['no','yes','unsure'])
        cases.push({
          type:'basement_finish',
          property:base,
          a:{
            sleepingRoomAdded:sleeping,
            sleepingUse:sleeping==='unsure'?'sleeping':undefined,
            bathroomAdded:bath,
            electricalWork:elec,
            plumbingWork:plumbing,
            gasWork:'no',
            structuralChanges:'no',
            exteriorExpansion:'no'
          }
        });

for(const elec of ['no','yes','unsure'])
  for(const plumbing of ['no','yes','unsure'])
    for(const structural of ['no','yes','unsure'])
      cases.push({
        type:'bathroom_renovation',
        property:base,
        a:{
          electricalWork:elec,
          plumbingWork:plumbing,
          structuralChanges:structural,
          gasWork:'no',
          newVentilation:'unsure',
          newWindow:'no'
        }
      });

for(const historic of [null,'District'])
  for(const flood of [null,'Flood Zone'])
    for(const elec of ['no','yes'])
      for(const structural of ['no','yes'])
        cases.push({
          type:'addition',
          property:{
            ...base,
            historicDistrict:historic,
            historicExteriorReview:Boolean(historic),
            floodplain:flood,
            conservationPotential:Boolean(flood)
          },
          a:{
            newArea:500,
            stories:1,
            electricalWork:elec,
            plumbingWork:'no',
            gasWork:'no',
            structuralChanges:structural,
            windowsOrDoors:'yes',
            siteWork:'yes',
            treeImpact:'unsure'
          }
        });

assert.ok(cases.length>=50);

for(const c of cases){
  const p=buildPlan(c.type,c.property,c.a);
  count++;
  for(const r of p.results){
    assert.ok(['required','potentially_required','needs_confirmation','not_applicable'].includes(r.status),r.id);
    assert.ok(Array.isArray(r.sources)&&r.sources.length>0,`missing provenance ${r.id}`);
    if(r.status==='needs_confirmation') assert.doesNotMatch(r.action,/definitely|approved/i);
  }
  if(c.type==='basement_finish'&&c.a.sleepingRoomAdded==='yes')
    assert.ok(p.results.some(r=>r.id==='basement.egress'&&r.status==='needs_confirmation'));
  if(c.type==='addition')
    assert.ok(p.results.some(r=>r.id==='project.far'));
  if(c.type==='addition'&&c.property.historicDistrict)
    assert.ok(p.results.some(r=>r.id==='property.historic'));
  if(c.type==='addition'&&!c.property.historicDistrict)
    assert.ok(!p.results.some(r=>r.id==='property.historic'));
}

console.log('reliability regression tests: PASS ('+count+' scenarios)');
