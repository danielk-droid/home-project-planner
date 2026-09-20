import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import dependencies from '../data/dependencies.json' with { type: 'json' };
import questionFlows from '../data/questions.json' with { type: 'json' };

export const PROJECTS = Object.fromEntries(questionFlows.map(flow => [flow.id, {
  label: flow.label,
  questions: flow.questions
}]));

export function getQuestions(projectType, answers = {}) {
  const flow = questionFlows.find(x => x.id === projectType);
  if (!flow) return [];
  return flow.questions.filter(q => {
    const all = (q.showWhen || []).every(([key, value]) => answers[key] === value);
    const any = !(q.showWhenAny?.length) || q.showWhenAny.some(([key, value]) => answers[key] === value);
    return all && any;
  });
}

export function answerIsYes(value) { return value === 'yes'; }
export function answerIsNo(value) { return value === 'no'; }
export function answerIsUnsure(value) { return value === 'unsure'; }

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
  const point = addressFeature.geometry;
  if (point?.x == null || point?.y == null) {
    throw new Error('Newton GIS resolved the address, but did not return a usable map point.');
  }

  // Do not join the parcel table by street text. Newton's address and parcel
  // layers are separate datasets and their text fields are not guaranteed to
  // use identical formatting. Resolve the parcel spatially from the official
  // address point instead.
  const pointSpatialReference = point.spatialReference?.wkid || addressFeature.geometry?.spatialReference?.wkid || 2249;

  let parcelData = await query(47, {
    geometry: JSON.stringify(point),
    geometryType: 'esriGeometryPoint',
    inSR: pointSpatialReference,
    spatialRel: 'esriSpatialRelIntersects',
    outFields:'*',
    returnGeometry:true,
    resultRecordCount:10
  });

  // Some address points can sit just outside the mapped parcel boundary.
  // Give the parcel resolver a small official-GIS spatial tolerance before
  // declaring the property unresolved.
  if (!parcelData.features?.length) {
    parcelData = await query(47, {
      geometry: JSON.stringify(point),
      geometryType: 'esriGeometryPoint',
      inSR: 2249,
      distance: 75,
      units: 'esriSRUnit_Foot',
      spatialRel: 'esriSpatialRelIntersects',
      outFields:'*',
      returnGeometry:true,
      resultRecordCount:10
    });
  }

  // Last fallback: try the parcel's own address fields using the normalized
  // address number/street. This handles parcels whose GIS point/boundary
  // relationship is imperfect.
  if (!parcelData.features?.length) {
    const parsed = parseStreetAddress(a.Address || address);
    if (parsed) {
      const street = parsed.street.replace(/'/g,"''");
      const number = parsed.number.replace(/'/g,"''");
      const variants = [
        `AddressNum='${number}' AND UPPER(Street)=UPPER('${street}')`,
        `Number=${number} AND UPPER(Street)=UPPER('${street}')`
      ];
      for (const where of variants) {
        const candidate = await query(47, {
          where, outFields:'*', returnGeometry:true, resultRecordCount:10
        });
        if (candidate.features?.length) {
          parcelData = candidate;
          break;
        }
      }
    }
  }

  const parcel = parcelData.features?.[0];
  if (!parcel) throw new Error('Newton GIS resolved the address but did not resolve a parcel. The plan is not property-specific yet.');

  const p = parcel.attributes;

  const [zoning, historic, flood] = await Promise.all([
    query(24,{
      geometry:JSON.stringify(point),
      geometryType:'esriGeometryPoint',
      inSR:pointSpatialReference,
      spatialRel:'esriSpatialRelIntersects',
      outFields:'*',
      returnGeometry:false,
      resultRecordCount:10
    }),
    query(39,{
      geometry:JSON.stringify(point),
      geometryType:'esriGeometryPoint',
      inSR:pointSpatialReference,
      spatialRel:'esriSpatialRelIntersects',
      outFields:'*',
      returnGeometry:false,
      resultRecordCount:10
    }),
    query(41,{
      geometry:JSON.stringify(point),
      geometryType:'esriGeometryPoint',
      inSR:pointSpatialReference,
      spatialRel:'esriSpatialRelIntersects',
      outFields:'*',
      returnGeometry:false,
      resultRecordCount:10
    })
  ]);

  const zoningAttrs = zoning.features?.[0]?.attributes || {};
  const historicAttrs = historic.features?.[0]?.attributes || {};
  const floodAttrs = flood.features?.[0]?.attributes || {};

  return {
    resolvedAddress: a.Address || address,
    parcelId: p.MAP_PAR_ID || null,
    zoningDistrict: zoningAttrs.Zoning || p.Zoning || null,
    lotSizeSqFt: p.Lot_Size ?? null,
    yearBuilt: p.Year_Built ?? null,
    historicDistrict: historicAttrs.Name || null,
    floodplain: floodAttrs.Name || null,
    conservationPotential: Boolean(flood.features?.length),
    historicExteriorReview: Boolean(historic.features?.length),
    openPermitsUnknown: true,
    sources: ['newton-addresses','newton-parcels','newton-zoning','newton-historic-districts','newton-floodplain'],
    evidence: [
      {label:'Address',value:a.Address || address,source:'newton-addresses'},
      {label:'Parcel',value:p.MAP_PAR_ID || 'Not returned',source:'newton-parcels'},
      {label:'Zoning',value:zoningAttrs.Zoning || p.Zoning || 'Not resolved',source:'newton-zoning'},
      {label:'Year built',value:p.Year_Built ?? 'Not returned',source:'newton-parcels'},
      {label:'Lot size',value:p.Lot_Size ?? 'Not returned',source:'newton-parcels'},
      {label:'Historic district',value:historicAttrs.Name || 'None returned by layer',source:'newton-historic-districts'},
      {label:'Floodplain',value:floodAttrs.Name || 'None returned by layer',source:'newton-floodplain'}
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
  return expr.split(/\s*\|\|\s*/).some(orTerm => orTerm.split(/\s*&&\s*/).every(term=>{
    const m=term.match(/^([\w.]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/); if(!m) return false;
    const actual=get(ctx,m[1]); const raw=m[3].trim(); let expected;
    if(raw==='true') expected=true; else if(raw==='false') expected=false; else if(raw==='null') expected=null;
    else if(/^[-+]?\d+(?:\.\d+)?$/.test(raw)) expected=Number(raw);
    else expected=raw.replace(/^['"]|['"]$/g,'');
    if(m[2]==='==') return actual===expected;
    if(m[2]==='!=') return actual!==expected;
    if(m[2]==='<') return actual < expected;
    if(m[2]==='>') return actual > expected;
    if(m[2]==='<=') return actual <= expected;
    if(m[2]==='>=') return actual >= expected;
    return false;
  }));
}

export function deriveProject(projectType, answers = {}) {
  const a = answers;
  const basementBathroom = a.bathroomAdded === 'yes' || a.bathroomIntent === 'yes';
  const basementPlumbing = a.plumbingWork === 'yes' || basementBathroom;
  const exteriorAnswer = [a.exteriorExpansion, a.newWindow, a.windowsOrDoors].includes('yes') ? 'yes' : ([a.exteriorExpansion, a.newWindow, a.windowsOrDoors, a.siteWork].includes('unsure') ? 'unsure' : 'no');
  const exteriorUncertain = [a.exteriorExpansion, a.newWindow, a.windowsOrDoors, a.siteWork].includes('unsure');
  return {
    buildingWork: true,
    projectDescription: a.projectDescription || null,
    projectCost: a.projectCost ?? null,
    condo: a.condo === 'yes',
    condoUncertain: a.condo === 'unsure',
    demolition: a.demolition === 'yes',
    demolitionUncertain: a.demolition === 'unsure',
    guttingMoreThanHalf: a.guttingExtent === 'yes',
    guttingUncertain: a.guttingExtent === 'unsure',
    addedAreaOver1000: Number(a.newArea || 0) > 1000,
    addedAreaUncertain: projectType === 'addition' && (a.newArea === undefined || a.newArea === null),
    additionStories: Number(a.stories || 0),
    additionStoriesUncertain: projectType === 'addition' && a.stories === 'unsure',
    footprintChange: a.footprintChange === 'yes',
    footprintChangeUncertain: a.footprintChange === 'unsure',
    setbackConstraint: a.setbackConstraint ?? null,
    setbackConstraintUncertain: a.setbackConstraint === 'unsure',
    deckNew: a.deckNew === 'yes',
    deckNewUncertain: a.deckNew === 'unsure',
    deckHeightFt: Number(a.deckHeight || 0),
    deckHeightUncertain: a.deckHeight === 'unsure',
    deckAreaSqFt: Number(a.deckArea || 0),
    deckAreaUncertain: a.deckArea === 'unsure',
    stairsOrGuard: a.stairsOrGuard === 'yes',
    stairsOrGuardUncertain: a.stairsOrGuard === 'unsure',
    basementAreaSqFt: Number(a.basementArea || 0),
    basementAreaUncertain: a.basementArea === 'unsure',
    ceilingHeightFt: Number(a.ceilingHeight || 0),
    ceilingHeightUncertain: a.ceilingHeight === 'unsure',
    bathroomLayoutChange: a.layoutChange === 'yes',
    bathroomLayoutUncertain: a.layoutChange === 'unsure',
    siteWork: a.siteWork === 'yes',
    siteWorkUncertain: a.siteWork === 'unsure',
    electricalWork: a.electricalWork === 'yes',
    electricalUncertain: a.electricalWork === 'unsure',
    plumbingWork: basementPlumbing || a.plumbingWork === 'yes',
    plumbingUncertain: a.plumbingWork === 'unsure' || a.bathroomAdded === 'unsure' || a.bathroomIntent === 'unsure',
    gasWork: a.gasWork === 'yes',
    gasUncertain: a.gasWork === 'unsure',
    structuralChanges: a.structuralChanges === 'yes',
    structuralUncertain: a.structuralChanges === 'unsure',
    exteriorConstruction: projectType === 'deck' || projectType === 'addition' || exteriorAnswer === 'yes',
    exteriorUncertain,
    expansion: projectType === 'addition' || a.exteriorExpansion === 'yes' || a.siteWork === 'yes',
    sleepingRoomAdded: a.sleepingRoomAdded === 'yes' || a.sleepingUse === 'sleeping',
    sleepingRoomUncertain: a.sleepingRoomAdded === 'unsure' || a.sleepingUse === 'unsure',
    bathroomAdded: basementBathroom,
    bathroomUncertain: a.bathroomAdded === 'unsure' || a.bathroomIntent === 'unsure',
    ventilationWork: a.newVentilation === 'yes',
    ventilationUncertain: a.newVentilation === 'unsure',
    windowWork: a.newWindow === 'yes' || a.windowsOrDoors === 'yes',
    windowUncertain: a.newWindow === 'unsure' || a.windowsOrDoors === 'unsure',
    treeImpact: a.treeImpact === 'yes' || a.treeImpact === 'unsure',
    treeImpactUncertain: a.treeImpact === 'unsure'
  };
}

export function buildPlan(projectType, property, answers) {
  const project = deriveProject(projectType, answers);
  const ctx = {property, project, answers};
  const results = evaluateRules(ctx);
  const required = results.filter(r => r.status === 'required');
  const conditional = results.filter(r => r.status === 'potentially_required');
  const confirm = results.filter(r => r.status === 'needs_confirmation');
  const steps = dependencies.map(d => ({...d, status:'not_started'}));
  const unknowns = Object.entries(answers || {}).filter(([, value]) => value === 'unsure').map(([key]) => key);
  return {project, results, required, conditional, confirm, steps, context:ctx, unknowns};
}

export function sourcesFor(result) { return result.sources || []; }