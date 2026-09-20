import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import dependencies from '../data/dependencies.json' with { type: 'json' };

export const PROJECTS = {
  basement_finish: { label: 'Finish or remodel a basement', questions: [
    ['sleepingRoomAdded','Will you create a bedroom or other sleeping room?', 'boolean'],
    ['bathroomAdded','Will you add a bathroom?', 'boolean'],
    ['electricalWork','Will you add or alter electrical work?', 'boolean'],
    ['plumbingWork','Will you add or alter plumbing?', 'boolean'],
    ['gasWork','Will you add or alter gas work?', 'boolean'],
    ['structuralChanges','Will you alter structural walls, beams, or framing?', 'boolean'],
    ['exteriorExpansion','Will the project change or expand the exterior building envelope?', 'boolean']
  ]},
  bathroom_renovation: { label: 'Renovate a bathroom', questions: [
    ['plumbingWork','Will plumbing be moved, added, or substantially altered?', 'boolean'],
    ['electricalWork','Will electrical work be added or altered?', 'boolean'],
    ['gasWork','Will gas work be added or altered?', 'boolean'],
    ['structuralChanges','Will you alter structural walls, beams, or framing?', 'boolean'],
    ['newVentilation','Will you add or alter ventilation?', 'boolean'],
    ['newWindow','Will you add or enlarge a window?', 'boolean']
  ]},
  deck: { label: 'Build or replace a deck / exterior platform', questions: [
    ['deckHeight','Approximate deck height above grade in feet?', 'number'],
    ['deckArea','Approximate deck area in square feet?', 'number'],
    ['electricalWork','Will you add or alter electrical work?', 'boolean'],
    ['structuralChanges','Will you alter structural components of the house?', 'boolean']
  ]},
  addition: { label: 'Build a residential addition', questions: [
    ['newArea','Approximate new floor area in square feet?', 'number'],
    ['stories','How many stories will the addition have?', 'number'],
    ['structuralChanges','Will the addition involve structural changes?', 'boolean'],
    ['electricalWork','Will you add or alter electrical work?', 'boolean'],
    ['plumbingWork','Will you add or alter plumbing?', 'boolean'],
    ['gasWork','Will you add or alter gas work?', 'boolean']
  ]}
};

export function normalizeAddress(input) {
  let s = input.trim().replace(/\s+/g,' ');
  s = s.replace(/,?\s*\d{5}(?:-\d{4})?\s*$/,'');
  s = s.replace(/,?\s*(MA|MASSACHUSETTS)\s*$/i,'');
  s = s.replace(/,\s*$/,'');
  return s;
}

function arcgisUrl(layer, params) {
  const u = new URL(`https://gisweb.newtonma.gov/server/rest/services/Data/MapServer/${layer}/query`);
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k,String(v));
  u.searchParams.set('f','json');
  return u.toString();
}

async function query(layer, params) {
  const res = await fetch(arcgisUrl(layer, params));
  if (!res.ok) throw new Error(`Newton GIS request failed (${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Newton GIS returned an error');
  return data;
}

export async function resolveProperty(addressInput) {
  const address = normalizeAddress(addressInput);
  if (!address) throw new Error('Enter a Newton street address.');

  const addressData = await query(12, {
    where: `Address='${address.replace(/'/g,"''")}'`,
    outFields: '*', returnGeometry: true, resultRecordCount: 10
  });
  let addressFeature = addressData.features?.[0];

  if (!addressFeature) {
    const parsed = parseStreetAddress(address);
    if (!parsed) throw new Error('Enter an address such as 130 Wheeler Road.');
    const where = `Number=${parsed.number} AND UPPER(FullStName)=UPPER('${parsed.street.replace(/'/g,"''")}')`;
    const fallback = await query(12, {where, outFields:'*', returnGeometry:true, resultRecordCount:10});
    addressFeature = fallback.features?.[0];
  }
  if (!addressFeature) throw new Error('Newton GIS could not resolve that address. No property-specific plan was generated.');

  const a = addressFeature.attributes;
  const parcelData = await query(47, {
    where: `AddressNum='${String(a.Number).replace(/'/g,"''")}' AND UPPER(Street)=UPPER('${String(a.StreetName).replace(/'/g,"''")}')`,
    outFields:'*', returnGeometry:true, resultRecordCount:10
  });
  const parcel = parcelData.features?.[0];
  if (!parcel) throw new Error('Newton GIS resolved the address point but did not resolve a parcel. The plan is not property-specific yet.');

  const p = parcel.attributes;

  const [zoning, historic, flood] = await Promise.all([
    query(24,{geometry:JSON.stringify(point),geometryType:'esriGeometryPoint',inSR:2249,spatialRel:'esriSpatialRelIntersects',outFields:'Zoning',returnGeometry:false,resultRecordCount:10}),
    query(39,{geometry:JSON.stringify(point),geometryType:'esriGeometryPoint',inSR:2249,spatialRel:'esriSpatialRelIntersects',outFields:'Name,Type',returnGeometry:false,resultRecordCount:10}),
    query(41,{geometry:JSON.stringify(point),geometryType:'esriGeometryPoint',inSR:2249,spatialRel:'esriSpatialRelIntersects',outFields:'Name,Type,OrdinanceCat',returnGeometry:false,resultRecordCount:10})
  ]);

  return {
    resolvedAddress: a.Address || address,
    parcelId: p.MAP_PAR_ID || null,
    zoningDistrict: zoning.features?.[0]?.attributes?.Zoning || null,
    lotSizeSqFt: p.Lot_Size ?? null,
    yearBuilt: p.Year_Built ?? null,
    historicDistrict: historic.features?.[0]?.attributes?.Name || null,
    floodplain: flood.features?.[0]?.attributes?.Name || null,
    conservationPotential: Boolean(flood.features?.length),
    historicExteriorReview: Boolean(historic.features?.length),
    openPermitsUnknown: true,
    sources: ['newton-addresses','newton-parcels','newton-zoning','newton-historic-districts','newton-floodplain'],
    evidence: [
      {label:'Address',value:a.Address || address,source:'newton-addresses'},
      {label:'Parcel',value:p.MAP_PAR_ID || 'Not returned',source:'newton-parcels'},
      {label:'Zoning',value:zoning.features?.[0]?.attributes?.Zoning || 'Not resolved',source:'newton-zoning'},
      {label:'Year built',value:p.Year_Built ?? 'Not returned',source:'newton-parcels'},
      {label:'Lot size',value:p.Lot_Size ?? 'Not returned',source:'newton-parcels'},
      {label:'Historic district',value:historic.features?.[0]?.attributes?.Name || 'None returned by layer',source:'newton-historic-districts'},
      {label:'Floodplain',value:flood.features?.[0]?.attributes?.Name || 'None returned by layer',source:'newton-floodplain'}
    ]
  };
}

function parseStreetAddress(s) {
  const m = s.match(/^\s*(\d+)\s+(.+?)\s*$/);
  return m ? {number:m[1],street:m[2]} : null;
}

function get(ctx,path) { return path.split('.').reduce((v,k)=>v?.[k],ctx); }

export function evaluateRules(ctx) {
  return rules.filter(r=>condition(r.when,ctx)).map(r=>({...r, sources:r.sourceIds.map(id=>sources.find(s=>s.id===id)).filter(Boolean)}));
}

function condition(expr,ctx) {
  return expr.split(/\s*&&\s*/).every(term=>{
    const m=term.match(/^([\w.]+)\s*(==|!=)\s*(.+)$/); if(!m) return false;
    const actual=get(ctx,m[1]); let expected=m[3].trim();
    if(expected==='true') expected=true; else if(expected==='false') expected=false; else if(expected==='null') expected=null; else expected=expected.replace(/^['"]|['"]$/g,'');
    return m[2]==='==' ? actual===expected : actual!==expected;
  });
}

export function deriveProject(projectType, answers) {
  const a = answers;
  return {
    buildingWork: true,
    electricalWork: Boolean(a.electricalWork),
    plumbingWork: Boolean(a.plumbingWork || a.bathroomAdded),
    gasWork: Boolean(a.gasWork),
    exteriorConstruction: projectType === 'deck' || projectType === 'addition' || Boolean(a.exteriorExpansion),
    expansion: projectType === 'addition' || Boolean(a.exteriorExpansion),
    sleepingRoomAdded: Boolean(a.sleepingRoomAdded),
    bathroomAdded: Boolean(a.bathroomAdded)
  };
}

export function buildPlan(projectType, property, answers) {
  const project = deriveProject(projectType,answers);
  const ctx={property,project};
  const results=evaluateRules(ctx);
  const required=results.filter(r=>r.status==='required');
  const conditional=results.filter(r=>r.status==='potentially_required');
  const confirm=results.filter(r=>r.status==='needs_confirmation');
  const steps = dependencies.map(d=>({id:d.id,title:d.title,status:'not_started',dependsOn:d.dependsOn}));
  return {project,results,required,conditional,confirm,steps,context:ctx};
}

export function sourcesFor(result) { return result.sources || []; }