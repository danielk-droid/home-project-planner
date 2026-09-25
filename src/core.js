import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import dependencies from '../data/dependencies.json' with { type: 'json' };
import questionFlows from '../data/questions.json' with { type: 'json' };
import projectCatalog from '../data/project_catalog.json' with { type: 'json' };

export const PROJECT_CATALOG = projectCatalog;

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

export function inferClarifiedAnswer(questionId, value) {
  const values = Array.isArray(value) ? value : [value];
  const multiBinary = new Set([
    'demolition','structuralChanges','electricalWork','plumbingWork','gasWork',
    'exteriorChange','siteWork','treeImpact','windowsOrDoors','newVentilation',
    'layoutChange','stairsOrGuard','footprintChange'
  ]);
  if (multiBinary.has(questionId)) {
    if (values.includes('none')) return 'no';
    if (values.length) return 'yes';
    return null;
  }
  const map = {
    sleepingRoomAdded: {sleeping:'yes',other:'no'},
    bathroomAdded: {yes:'yes',no:'no'},
    exteriorChange: {opening:'yes',structure:'yes',surface:'yes',site:'yes'},
    deckNew: {new_deck:'yes',replacement:'no'},
    condo: {shared:'yes',not_shared:'no'},
    condoApproval: {yes:'yes',no:'no'},
    guttingExtent: {more_than_half:'yes',not_more_than_half:'no'},
    egressKnown: {measurements_available:'yes',measurements_unavailable:'no'}
  };
  return map[questionId]?.[values[0]] || null;
}

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
      inSR: pointSpatialReference,
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

  const gisPointParams = {
    geometry: JSON.stringify(point),
    geometryType: 'esriGeometryPoint',
    inSR: pointSpatialReference,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: false,
    resultRecordCount: 10
  };
  const [zoning, historic, flood, wetlands, wetlandRestrictions, wetlandBuffers, streams] = await Promise.all([
    query(24, gisPointParams),
    query(39, gisPointParams),
    query(41, gisPointParams),
    query(27, gisPointParams),
    query(26, gisPointParams),
    query(29, gisPointParams),
    query(16, gisPointParams)
  ]);

  const zoningAttrs = zoning.features?.[0]?.attributes || {};
  const historicAttrs = historic.features?.[0]?.attributes || {};
  const floodAttrs = flood.features?.[0]?.attributes || {};
  const wetlandAttrs = wetlands.features?.[0]?.attributes || {};
  const streamAttrs = streams.features?.[0]?.attributes || {};
  const conservationSignals = [flood, wetlands, wetlandRestrictions, wetlandBuffers, streams].some(x => x.features?.length);

  return {
    resolvedAddress: a.Address || address,
    parcelId: p.MAP_PAR_ID || null,
    zoningDistrict: zoningAttrs.Zoning || p.Zoning || null,
    lotSizeSqFt: p.Lot_Size ?? null,
    yearBuilt: p.Year_Built ?? null,
    historicDistrict: historicAttrs.Name || null,
    floodplain: floodAttrs.Name || null,
    wetland: wetlandAttrs.Name || null,
    stream: streamAttrs.Name || null,
    conservationPotential: conservationSignals,
    historicExteriorReview: Boolean(historic.features?.length),
    localLandmark: null,
    preservationRestriction: null,
    nationalRegister: null,
    historicStatusUnknown: true,
    openPermitsUnknown: true,
    sources: ['newton-addresses','newton-parcels','newton-zoning','newton-historic-districts','newton-floodplain','newton-wetlands','newton-streams'],
    evidence: [
      {label:'Address',value:a.Address || address,source:'newton-addresses'},
      {label:'Parcel',value:p.MAP_PAR_ID || 'Not returned',source:'newton-parcels'},
      {label:'Zoning',value:zoningAttrs.Zoning || p.Zoning || 'Not resolved',source:'newton-zoning'},
      {label:'Year built',value:p.Year_Built ?? 'Not returned',source:'newton-parcels'},
      {label:'Lot size',value:p.Lot_Size == null ? 'Not returned' : Number(p.Lot_Size).toLocaleString() + ' sq ft',source:'newton-parcels'},
      {label:'Historic district',value:historicAttrs.Name || 'None returned by layer',source:'newton-historic-districts'},
      {label:'Floodplain',value:floodAttrs.Name || 'None returned by layer',source:'newton-floodplain'},
      {label:'Wetlands',value:wetlandAttrs.Name || 'None returned by layer',source:'newton-wetlands'},
      {label:'Stream',value:streamAttrs.Name || 'None returned by layer',source:'newton-streams'},
      {label:'Conservation signal',value:conservationSignals ? 'Potential conservation review area' : 'No mapped signal returned',source:'newton-conservation'}
    ]
  };
}
function parseStreetAddress(s) {
  const m = s.match(/^\s*(\d+)\s+(.+?)\s*$/);
  return m ? {number:m[1],street:m[2]} : null;
}

function get(ctx,path) { return path.split('.').reduce((v,k)=>v?.[k],ctx); }

const TERM_PATTERN = /^([\w.]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/;
const RELATIONAL = new Set(['<','>','<=','>=']);

function parseLiteral(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^[-+]?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw.replace(/^['"]|['"]$/g, '');
}

function parseCondition(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return null;
  const orTerms = expr.split(/\s*\|\|\s*/).map(orTerm => orTerm.split(/\s*&&\s*/).map(term => {
    const m = term.trim().match(TERM_PATTERN);
    return m ? {path: m[1], op: m[2], expected: parseLiteral(m[3].trim())} : null;
  }));
  return orTerms.every(terms => terms.every(Boolean)) ? orTerms : null;
}

// Structural check of the rule set. Returns a list of problems; an empty list
// means every rule can be evaluated and every cited source exists.
export function validateRules(ruleList = rules, sourceList = sources) {
  const problems = [];
  const sourceIds = new Set(sourceList.map(s => s.id));
  const seen = new Set();
  const statuses = new Set(['required','potentially_required','needs_confirmation']);
  for (const rule of ruleList) {
    const id = rule?.id || '(missing id)';
    if (!rule?.id) problems.push(`${id}: missing id`);
    else if (seen.has(rule.id)) problems.push(`${id}: duplicate id`);
    seen.add(rule?.id);
    if (!parseCondition(rule?.when)) problems.push(`${id}: condition cannot be parsed`);
    if (!statuses.has(rule?.status)) problems.push(`${id}: unknown status ${rule?.status}`);
    if (!Array.isArray(rule?.sourceIds) || !rule.sourceIds.length) problems.push(`${id}: no sources`);
    else for (const s of rule.sourceIds) if (!sourceIds.has(s)) problems.push(`${id}: unknown source ${s}`);
  }
  return problems;
}

// Evaluates one parsed term. A relational comparison against a missing fact
// (null/undefined/non-numeric) cannot be decided; it is reported as
// indeterminate instead of being coerced (JavaScript treats null as 0).
function evaluateTerm(term, ctx) {
  const actual = get(ctx, term.path);
  if (term.op === '==') return {match: actual === term.expected};
  if (term.op === '!=') return {match: actual !== term.expected};
  if (RELATIONAL.has(term.op)) {
    const n = typeof actual === 'number' ? actual
      : (typeof actual === 'string' && /^\s*[-+]?\d+(?:\.\d+)?\s*$/.test(actual) ? Number(actual) : NaN);
    if (Number.isNaN(n)) return {match: true, indeterminate: term.path};
    return compare(n, term.op, term.expected);
  }
  return {match: false};
}

function compare(actual, op, expected) {
  if (op === '<') return {match: actual < expected};
  if (op === '>') return {match: actual > expected};
  if (op === '<=') return {match: actual <= expected};
  return {match: actual >= expected};
}

// Returns {match, indeterminateFacts}. An indeterminate term keeps the rule in
// the plan (the conservative outcome the planner already produced) but the
// missing fact is recorded so the result is never presented as confirmed.
function evaluateCondition(parsed, ctx) {
  const indeterminate = new Set();
  for (const terms of parsed) {
    const local = [];
    let ok = true;
    for (const term of terms) {
      const r = evaluateTerm(term, ctx);
      if (!r.match) { ok = false; break; }
      if (r.indeterminate) local.push(r.indeterminate);
    }
    if (ok) {
      if (!local.length) return {match: true, indeterminateFacts: []};
      local.forEach(x => indeterminate.add(x));
    }
  }
  return {match: indeterminate.size > 0, indeterminateFacts: [...indeterminate]};
}

export function evaluateRules(ctx, ruleList = rules) {
  const out = [];
  for (const r of ruleList) {
    const parsed = parseCondition(r?.when);
    if (!parsed) continue; // reported through evaluationIssues / validateRules
    const {match, indeterminateFacts} = evaluateCondition(parsed, ctx);
    if (!match) continue;
    const ids = Array.isArray(r.sourceIds) ? r.sourceIds : [];
    const resolved = ids.map(id => sources.find(s => s.id === id)).filter(Boolean);
    const result = {...r, sources: resolved};
    if (indeterminateFacts.length) result.indeterminateFacts = indeterminateFacts;
    const missing = ids.filter(id => !sources.some(s => s.id === id));
    if (missing.length) result.missingSourceIds = missing;
    out.push(result);
  }
  return out;
}

export function evaluationIssues(ruleList = rules) {
  return ruleList.filter(r => !parseCondition(r?.when)).map(r => ({ruleId: r?.id || null, problem: 'condition cannot be parsed'}));
}

export function deriveProject(projectType, answers = {}, property = {}) {
  const a = answers;
  const basementBathroom = a.bathroomAdded === 'yes' || a.bathroomIntent === 'yes';
  const basementPlumbing = a.plumbingWork === 'yes' || basementBathroom;
  const exteriorAnswer = [a.exteriorExpansion, a.newWindow, a.windowsOrDoors].includes('yes') ? 'yes' : ([a.exteriorExpansion, a.newWindow, a.windowsOrDoors, a.siteWork].includes('unsure') ? 'unsure' : 'no');
  const exteriorUncertain = [a.exteriorExpansion, a.newWindow, a.windowsOrDoors, a.siteWork].includes('unsure');
  return {
    buildingWork: projectType === 'addition' || projectType === 'deck' ||
      ['garage','adu','exterior','roofing'].includes(a.projectCatalogId) ||
      projectType === 'basement_finish' ||
      a.primaryWorkArea === 'interior' ||
      a.primaryWorkArea === 'bath' ||
      a.primaryWorkArea === 'addition' ||
      a.primaryWorkArea === 'exterior' ||
      a.structuralChanges === 'yes' ||
      a.demolition === 'yes' ||
      a.guttingExtent === 'yes' ||
      a.layoutChange === 'yes' ||
      a.footprintChange === 'yes',
    buildingWorkUncertain: projectType === 'general_project' && !(
      projectType === 'addition' || projectType === 'deck' ||
      ['garage','adu','exterior','roofing'].includes(a.projectCatalogId) ||
      a.primaryWorkArea === 'interior' || a.primaryWorkArea === 'bath' ||
      a.primaryWorkArea === 'addition' || a.primaryWorkArea === 'exterior' ||
      a.structuralChanges === 'yes' || a.demolition === 'yes' ||
      a.guttingExtent === 'yes' || a.layoutChange === 'yes' ||
      a.footprintChange === 'yes' || a.primaryWorkArea === 'kitchen' ||
      a.primaryWorkArea === 'systems' || a.primaryWorkArea === 'site'
    ) && (
      a.primaryWorkArea === 'unsure' || a.primaryWorkAreaDetail === 'unsure' ||
      a.structuralChanges === 'unsure' || a.demolition === 'unsure' ||
      a.exteriorChange === 'unsure' || a.siteWork === 'unsure'
    ),
    projectDescription: a.projectDescription || null,
    projectCatalogId: a.projectCatalogId || null,
    projectCatalogLabel: a.projectCatalogLabel || null,
    condo: a.condo === 'yes',
    condoUncertain: a.condo === 'unsure',
    condoApproval: a.condoApproval === 'yes',
    condoApprovalUncertain: a.condo === 'yes' && a.condoApproval === 'unsure',
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
    deckNew: a.deckNew === 'yes',
    deckNewUncertain: a.deckNew === 'unsure',
    deckHeightFt: Number(a.deckHeight || 0),
    deckHeightUncertain: a.deckHeight === null || a.deckHeight === 'unsure',
    stairsOrGuard: a.stairsOrGuard === 'yes',
    stairsOrGuardUncertain: a.stairsOrGuard === 'unsure',
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
    exteriorConstruction: projectType === 'deck' || projectType === 'addition' || exteriorAnswer === 'yes' || a.exteriorChange === 'yes' || ['structure','opening','surface'].includes(a.exteriorChangeDetail),
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
    treeImpactUncertain: a.treeImpact === 'unsure',
    exteriorChange: a.exteriorChange === 'yes' || a.exteriorChangeDetail === 'structure' || a.exteriorChangeDetail === 'opening' || a.exteriorChangeDetail === 'surface',
    exteriorChangeUncertain: a.exteriorChange === 'unsure' || a.exteriorChangeDetail === 'unsure',
    mechanicalWork: a.systemType === 'mechanical' || ['systems-3','systems-4','systems-5','systems-6'].includes(a.projectCatalogId),
    mechanicalUncertain: a.systemType === 'unsure' || (a.primaryWorkArea === 'systems' && !a.systemType && !['systems-0','systems-1','systems-2','systems-7','systems-8'].includes(a.projectCatalogId || '')),
    mechanicalExterior: a.mechanicalExterior === 'yes',
    zoningRelevant: projectType === 'addition' || projectType === 'deck' ||
      ['garage','adu','exterior','roofing','site'].includes(a.projectCatalogId) ||
      ['addition','exterior','site'].includes(a.primaryWorkArea) ||
      a.footprintChange === 'yes' || a.useChange === 'yes' || a.unitCountChange === 'yes' ||
      a.mechanicalExterior === 'yes',
    zoningUncertain: a.primaryWorkArea === 'unsure' || a.primaryWorkAreaDetail === 'unsure' ||
      a.exteriorChange === 'unsure' || a.siteWork === 'unsure' ||
      a.footprintChange === 'unsure' || a.useChange === 'unsure' || a.unitCountChange === 'unsure',
    siteReviewRelevant: projectType === 'addition' || projectType === 'deck' ||
      a.exteriorChange === 'yes' || a.siteWork === 'yes' || a.mechanicalExterior === 'yes' ||
      a.windowsOrDoors === 'yes' || a.newWindow === 'yes',
    landDisturbanceSqFt: a.landDisturbanceSqFt == null || a.landDisturbanceSqFt === '' ? null : Number(a.landDisturbanceSqFt),
    newImperviousSqFt: a.newImperviousSqFt == null || a.newImperviousSqFt === '' ? null : Number(a.newImperviousSqFt),
    // Stormwater thresholds only apply to a measured value; a missing
    // measurement is handled by the stormwater-uncertain rule instead.
    landDisturbanceSqFtKnown: Number.isFinite(a.landDisturbanceSqFt == null || a.landDisturbanceSqFt === '' ? NaN : Number(a.landDisturbanceSqFt)),
    newImperviousSqFtKnown: Number.isFinite(a.newImperviousSqFt == null || a.newImperviousSqFt === '' ? NaN : Number(a.newImperviousSqFt)),
    newRetainingWall: a.retainingWallNew === 'yes',
    trenchDewatering: a.trenchDewatering === 'yes',
    stormwaterFactsUncertain: (projectType === 'addition' || projectType === 'deck' || a.siteWork === 'yes' || a.exteriorChange === 'yes') &&
      a.landDisturbanceKnown !== 'no' && a.landDisturbanceSqFt == null && a.newImperviousSqFt == null &&
      a.retainingWallNew !== 'no' && a.trenchDewatering !== 'no',
    treeSaveAreaUncertain: (projectType === 'addition' || projectType === 'deck' || a.exteriorChange === 'yes' || a.siteWork === 'yes') &&
      a.treeSaveAreaKnown !== 'no',
    localLandmark: a.historicLocalLandmark === 'yes',
    preservationRestriction: a.historicPreservationRestriction === 'yes',
    nationalRegister: a.historicNationalRegister === 'yes',
    ...historicAgeFacts(property, a),
    historicStatusUncertain: a.historicLocalLandmark === 'unsure' || a.historicPreservationRestriction === 'unsure' ||
      a.historicNationalRegister === 'unsure' || a.historicAgeKnown === 'unsure' ||
      (projectType !== 'general_project' && (projectType === 'addition' || projectType === 'deck') && property?.historicStatusUnknown === true),
    advanceFireApprovalPotential: projectType === 'addition' || a.demolition === 'yes' || a.fireProtectionWork === 'yes' || a.hotWork === 'yes',
    basementPresent: projectType === 'basement_finish',
    eeroFactsUncertain: projectType === 'basement_finish' &&
      (a.egressMeasurements !== 'yes' || a.egressClearWidth == null || a.egressClearHeight == null || a.egressSillHeight == null),
    generalScopeUncertain: a.primaryWorkArea === 'unsure' || a.primaryWorkAreaDetail === 'unsure' || a.primaryWorkAreaDetail2 === 'unsure',
  };
}

// Building-age facts for the historic pathways. Newton's property record gives a
// year only, so on a given date the building's exact age is either
// (currentYear - yearBuilt - 1) or (currentYear - yearBuilt). A threshold is
// treated as met only when both possible ages meet it; when they straddle it
// the result is a boundary case that needs confirmation.
//   general exterior Historic Review: age > 50
//   historic demolition review:        age >= 50
export function historicAgeFacts(property, answers = {}, asOf = new Date()) {
  const raw = property?.yearBuilt;
  const year = typeof raw === 'number' ? raw
    : (typeof raw === 'string' && /^\s*\d{4}\s*$/.test(raw) ? Number(raw) : NaN);
  const asOfYear = asOf.getFullYear();
  const yearKnown = Number.isInteger(year) && year > 0 && year <= asOfYear;
  const known = answers?.historicAgeKnown;
  const answered = known === 'yes' || known === 'no';
  const minAge = yearKnown ? asOfYear - year - 1 : null;
  const maxAge = yearKnown ? asOfYear - year : null;
  const byRecord = yearKnown && known == null;
  return {
    ageOver50: yearKnown && minAge > 50,
    ageOver50Boundary: yearKnown && minAge <= 50 && maxAge > 50,
    ageAtLeast50: known === 'yes' || (byRecord && minAge >= 50),
    ageBoundaryUncertain: byRecord && minAge < 50 && maxAge >= 50,
    ageUnknown: !yearKnown && !answered,
  };
}

export function buildPlan(projectType, property, answers) {
  const project = deriveProject(projectType, answers, property);
  const ctx = {property, project, answers};
  const results = evaluateRules(ctx);
  const required = results.filter(r => r.status === 'required');
  const conditional = results.filter(r => r.status === 'potentially_required');
  const confirm = results.filter(r => r.status === 'needs_confirmation');
  const steps = dependencies.map(d => ({...d, status:'not_started'}));
  const unknowns = Object.entries(answers || {}).filter(([, value]) => value === 'unsure').map(([key]) => key);
  const indeterminate = results.filter(r => r.indeterminateFacts?.length).map(r => ({ruleId: r.id, facts: r.indeterminateFacts}));
  return {project, results, required, conditional, confirm, steps, context:ctx, unknowns, indeterminate, evaluationIssues: evaluationIssues()};
}

export function sourcesFor(result) { return result.sources || []; }