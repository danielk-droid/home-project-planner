// Preliminary feasibility report.
//
// A presentation-layer assembly of results the deterministic pipeline has
// already produced: the zoning screen in plan.project.zoningScreen (limits and
// statuses from src/zoning.js / data/zoning_dimensional.json) and the evaluated
// rule results in plan.results (data/rules.json). This module holds NO
// regulatory thresholds and never re-derives a within/exceeds status; it only
// formats, groups and explains them. Unknown values stay unknown.
import sources from '../data/sources.json' with { type: 'json' };

export const STATUS = {
  WITHIN: 'within_evaluated_limit',
  CONFLICT: 'potential_conflict',
  NEEDS_CONFIRMATION: 'needs_confirmation',
  NOT_EVALUATED: 'not_evaluated'
};

export const OVERALL = {
  conflict: 'Potential regulatory conflict identified',
  within_needs_confirmation: 'Appears within evaluated dimensional limits; additional confirmation is needed',
  compatible: 'Appears compatible with the evaluated dimensional limits',
  insufficient: 'Preliminary feasibility could not be fully evaluated',
  not_triggered: 'HPP’s dimensional zoning screen was not triggered by this project'
};

export const LIMITATIONS = 'This is a preliminary planning analysis based on the information available to HPP. It is not a zoning determination, permit approval, or substitute for confirmation from the City of Newton or a qualified professional.';

export const NOT_SCREENED = [
  'Front setback (Newton applies a front-setback averaging rule HPP cannot calculate)',
  'Usable open space',
  'Number of stories / 2.5-story limits',
  'Residential facade build-out ratio (Sec. 1.5.7)',
  'Existing nonconformities, easements, rear-lot rules and special-permit relief'
];

const EPS = 1e-9;
const ZONING_SOURCE = 'newton-zoning-ordinance';
const HISTORIC_IDS = ['property.historic', 'property.local-landmark', 'property.preservation-restriction', 'property.national-register', 'property.historic-age', 'property.historic-age-demolition'];
const HISTORIC_UNRESOLVED_IDS = ['property.historic-age-boundary-exterior', 'property.historic-age-unknown', 'project.historic-status-uncertain', 'project.age-boundary-uncertain'];
const PERMIT_IDS = ['project.building', 'project.electrical', 'project.plumbing', 'project.gas', 'project.mechanical', 'project.tree'];
const ZONING_EXCEEDS_IDS = ['zoning.setback-exceeds', 'zoning.lot-coverage-exceeds', 'zoning.height-exceeds', 'zoning.far-exceeds'];

export function sourceUrl(id) {
  return sources.find(s => s.id === id)?.url ?? null;
}

const toStatus = s => s === 'within' ? STATUS.WITHIN : s === 'exceeds' ? STATUS.CONFLICT : STATUS.NEEDS_CONFIRMATION;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const uniqueNums = obj => [...new Set(Object.values(obj || {}).filter(finite))].sort((a, b) => a - b);

// Format with the fewest decimals (min..max) that keep the displayed
// comparison identical to the evaluated one, so rounding never changes a
// conclusion (e.g. 0.4601 is never shown as "0.46" against a 0.46 maximum).
export function formatNumber(value, {min = 0, max = 4, against = [], type = 'max'} = {}) {
  if (!finite(value)) return null;
  for (let d = min; d <= max; d++) {
    const r = Number(value.toFixed(d));
    const consistent = against.every(limit => {
      if (!finite(limit)) return true;
      const raw = type === 'max' ? value <= limit + EPS : value + EPS >= limit;
      const shown = type === 'max' ? r <= limit + EPS : r + EPS >= limit;
      const rawEq = Math.abs(value - limit) < EPS, shownEq = Math.abs(r - limit) < EPS;
      return raw === shown && rawEq === shownEq;
    });
    if (consistent) return r.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: d});
  }
  return Number(value.toFixed(max)).toLocaleString('en-US', {maximumFractionDigits: max});
}

function limitText(limits, unit, type, bare = false) {
  if (!limits.length) return null;
  const u = unit === '%' ? '%' : unit ? ' ' + unit : '';
  const f = n => Number(n.toFixed(4)).toLocaleString('en-US', {maximumFractionDigits: 4}) + u;
  const word = bare ? '' : (type === 'max' ? ' max' : ' min');
  return limits.length === 1 ? `${f(limits[0])}${word}` : `${f(limits[0])}–${f(limits[limits.length - 1])}${word} (depends on unresolved facts)`;
}

// Difference to the binding limit. For a determined result with several still-
// possible limits every limit agrees, so the reported margin uses the one
// closest to the proposed value (the conservative margin).
function difference(value, limits, type, status) {
  if (!finite(value) || !limits.length || status === STATUS.NEEDS_CONFIRMATION) return null;
  const binding = type === 'max'
    ? (status === STATUS.WITHIN ? Math.min(...limits) : Math.max(...limits))
    : (status === STATUS.WITHIN ? Math.max(...limits) : Math.min(...limits));
  return Math.round(Math.abs(value - binding) * 10000) / 10000;
}

function row({metric, label, value, unit, limits, type, engineStatus, missingInputs, reasons, precision}) {
  const status = toStatus(engineStatus);
  const shown = formatNumber(value, {min: precision?.min ?? 0, max: precision?.max ?? 4, against: limits, type});
  const u = unit === '%' ? '%' : unit ? ' ' + unit : '';
  const diff = difference(value, limits, type, status);
  const diffUnit = unit === '%' ? (diff === 1 ? ' percentage point' : ' percentage points') : unit ? ' ' + unit : '';
  let explanation;
  if (status === STATUS.WITHIN) {
    explanation = `${label}: ${shown}${u}, ${diff === 0 ? 'exactly at' : type === 'max' ? 'below' : 'above'} the applicable ${type === 'max' ? 'maximum' : 'minimum'} of ${limitText(limits, unit, type, true)}.`;
  } else if (status === STATUS.CONFLICT) {
    explanation = `${label}: ${shown}${u}, ${type === 'max' ? 'above' : 'below'} the applicable ${type === 'max' ? 'maximum' : 'minimum'} of ${limitText(limits, unit, type, true)}` +
      (diff != null ? ` by ${formatNumber(diff, {max: 4})}${diffUnit}` : '') + '. Zoning relief may be needed.';
  } else {
    explanation = `${label}: Needs confirmation because ${reasons.length ? reasons.join('; ') : 'a required fact is unavailable'}.`;
  }
  return {
    metric, label,
    proposedValue: finite(value) ? value : null,
    displayValue: shown != null ? shown + u : null,
    unit,
    applicableLimit: limits.length === 1 ? limits[0] : null,
    possibleLimits: limits,
    limitDisplay: limitText(limits, unit, type),
    limitType: type,
    difference: diff,
    differenceDisplay: diff != null ? formatNumber(diff, {max: 4}) + diffUnit : null,
    status, engineStatus: engineStatus ?? 'unknown',
    missingInputs, explanation,
    sourceId: ZONING_SOURCE,
    ruleRef: 'src/zoning.js zoningScreen → data/zoning_dimensional.json'
  };
}

function eraReason(screen, limits) {
  return !screen.lotEra && limits.length > 1 ? 'the lot creation date (before or on/after 12/7/1953) is not established and the possible limits give different results' : null;
}

function dimensionRows(screen) {
  const c = screen.checks || {};
  const rows = [];

  // FAR
  const far = c.far || {};
  const farLimits = finite(far.maxFar) ? [far.maxFar] : [];
  const farMissing = [], farReasons = [];
  if (screen.lotArea == null) { farMissing.push('lot area'); farReasons.push('lot area is unavailable'); }
  if (far.ratio == null && !farMissing.length) { farMissing.push('proposed total gross floor area'); farReasons.push('proposed total floor area is unavailable'); }
  else if (far.ratio == null) { farMissing.push('proposed total gross floor area'); farReasons.push('proposed total floor area is unavailable'); }
  if (far.status === 'unknown' && far.ratio != null && far.maxFar != null) {
    farReasons.push(screen.lotEra
      ? 'the ratio falls within the pre-1953 +0.02 allowance band, which depends on conditions (including front setback) HPP cannot screen'
      : 'the lot creation date is not established, and a pre-1953 lot may qualify for a conditional +0.02 allowance HPP cannot screen');
  }
  rows.push(row({metric: 'far', label: 'Floor area ratio (FAR)', value: far.ratio, unit: '', limits: farLimits, type: 'max', engineStatus: far.status, missingInputs: farMissing, reasons: farReasons, precision: {min: 2}}));

  // Lot coverage
  const cov = c.lotCoverage || {};
  const covLimits = uniqueNums(cov.limits);
  const covMissing = [], covReasons = [];
  if (screen.lotArea == null) { covMissing.push('lot area'); covReasons.push('lot area is unavailable'); }
  if (cov.percent == null) { covMissing.push('total building coverage'); covReasons.push('total building coverage is unavailable'); }
  if (cov.status === 'unknown' && cov.percent != null) {
    const e = eraReason(screen, covLimits); if (e) covReasons.push(e);
    if (cov.garageExemptionPossible) covReasons.push('the Sec. 1.5.2.D.2 garage exemption may apply if the house existed on 12/27/1922');
  }
  rows.push(row({metric: 'lot_coverage', label: 'Lot coverage', value: cov.percent, unit: '%', limits: covLimits, type: 'max', engineStatus: cov.status, missingInputs: covMissing, reasons: covReasons}));

  // Side / rear setbacks
  for (const [key, label] of [['side', 'Side setback'], ['rear', 'Rear setback']]) {
    const part = c.setbacks?.parts?.[key] || {status: 'unknown', value: null, limits: {}};
    const lim = uniqueNums(part.limits);
    const missing = [], reasons = [];
    if (part.value == null) { missing.push(`proposed ${key} setback`); reasons.push(`the proposed smallest ${key} setback is unavailable`); }
    else if (part.status === 'unknown') { const e = eraReason(screen, lim); if (e) reasons.push(e); }
    rows.push(row({metric: key + '_setback', label, value: part.value, unit: 'ft', limits: lim, type: 'min', engineStatus: part.status, missingInputs: missing, reasons}));
  }

  // Height
  const h = c.height || {};
  const hLimits = uniqueNums(h.limits);
  const hMissing = [], hReasons = [];
  if (h.height == null) { hMissing.push('proposed building height'); hReasons.push('the proposed building height is unavailable'); }
  else if (h.status === 'unknown' && !screen.roofType) { hMissing.push('roof type'); hReasons.push('the roof type is not established and the sloped- and flat-roof limits give different results'); }
  rows.push(row({metric: 'height', label: 'Height', value: h.height, unit: 'ft', limits: hLimits, type: 'max', engineStatus: h.status, missingInputs: hMissing, reasons: hReasons}));

  return rows;
}

function titleOf(result) { return result?.title || result?.id; }

export function feasibilityReport(plan = {}) {
  const results = Array.isArray(plan.results) ? plan.results : [];
  const byId = new Map(results.map(r => [r.id, r]));
  const has = id => byId.has(id);
  const screen = plan.project?.zoningScreen || {applies: false, checks: {}};
  const project = plan.project || {};
  const property = plan.context?.property || {};

  const snapshot = {
    project: project.projectCatalogLabel || null,
    property: property.resolvedAddress || null,
    zoning: property.zoningDistrict || null,
    lotArea: finite(screen.lotArea) ? screen.lotArea : null,
    lotEra: screen.lotEra ?? null,
    knownLimits: []
  };

  const dimensions = screen.applies && screen.supportedDistrict ? dimensionRows(screen) : [];
  for (const d of dimensions) if (d.applicableLimit != null) snapshot.knownLimits.push({label: d.label, limit: d.limitDisplay});

  const confirmations = [];
  const addConfirmation = c => { if (!confirmations.some(x => x.issue === c.issue)) confirmations.push(c); };
  const information = [];
  const addInfo = s => { if (s && !information.includes(s)) information.push(s); };

  if (screen.applies && screen.districtStatus === 'unknown') {
    addConfirmation({issue: 'Zoning district', reason: 'The property record did not return a zoning district, so HPP cannot apply any dimensional limits.', informationNeeded: 'The zoning district for this parcel', question: 'Which zoning district applies to this property?', contact: 'Newton Planning & Development (Current Planning)', sourceId: 'newton-planning', priority: 1});
    addInfo('Zoning district for the property');
  }
  if (screen.applies && screen.districtStatus === 'unsupported') {
    addConfirmation({issue: 'Dimensional limits for this district', reason: `HPP’s verified dimensional screen covers single-family dwellings in SR1, SR2 and SR3 only; it has no verified limits for ${screen.district}.`, informationNeeded: `The applicable setback, lot coverage, height and FAR limits in ${screen.district}`, question: `What setback, lot coverage, height and FAR limits apply to this project in the ${screen.district} district?`, contact: 'Newton Planning & Development (Current Planning)', sourceId: 'newton-planning', priority: 1});
  }

  for (const d of dimensions) {
    if (d.status !== STATUS.NEEDS_CONFIRMATION) continue;
    for (const m of d.missingInputs) addInfo(m.charAt(0).toUpperCase() + m.slice(1));
  }
  const eraMatters = dimensions.some(d => d.status === STATUS.NEEDS_CONFIRMATION && /lot creation date/.test(d.explanation));
  if (eraMatters) {
    addInfo('Confirmation of the lot creation date (before or on/after 12/7/1953) — not the building’s year built');
    addConfirmation({issue: 'Lot creation date', reason: 'Newton applies different dimensional limits to lots created before 12/7/1953, and the answer changes this project’s result. A building’s year built does not establish when the lot was created.', informationNeeded: 'Deed/plan history showing when the lot was created', question: 'Was this lot created before December 7, 1953, so that the pre-1953 dimensional limits apply?', contact: 'Newton Planning & Development (Current Planning) or Inspectional Services', sourceId: 'newton-planning', priority: 2});
  }
  const cov = dimensions.find(d => d.metric === 'lot_coverage');
  if (cov?.status === STATUS.NEEDS_CONFIRMATION && /garage exemption/.test(cov.explanation)) {
    addConfirmation({issue: 'Garage lot-coverage exemption', reason: 'Lot coverage limits do not apply to a qualifying private garage accessory to a house that existed on 12/27/1922; HPP cannot confirm that date from the year built alone.', informationNeeded: 'Evidence of when the house was built', question: 'Does the Sec. 1.5.2.D.2 lot-coverage exemption for a private garage apply to this property?', contact: 'Newton Inspectional Services (zoning review)', sourceId: 'newton-isd', priority: 3});
  }
  const far = dimensions.find(d => d.metric === 'far');
  if (far?.status === STATUS.NEEDS_CONFIRMATION && far.proposedValue != null && /\+0\.02/.test(far.explanation)) {
    addConfirmation({issue: 'Pre-1953 FAR allowance', reason: 'The proposed FAR is inside the conditional +0.02 allowance for pre-1953 lots, which depends on conditions HPP cannot screen.', informationNeeded: 'Lot creation date and whether the new work meets post-1953 setbacks, including front setback', question: 'Does this project qualify for the Sec. 3.1.9.A.1 +0.02 FAR allowance for lots created before December 7, 1953?', contact: 'Newton Planning & Development (Current Planning)', sourceId: 'newton-planning', priority: 4});
  }
  if (screen.applies && screen.supportedDistrict) {
    addConfirmation({issue: 'Front setback', reason: 'HPP does not currently have enough information to calculate Newton’s front-setback averaging requirement, so no front-setback result is shown.', informationNeeded: 'Proposed front setback and the front setbacks of the neighboring lots used for averaging', question: 'What front setback applies to this proposed project under Newton’s front-setback averaging rule?', contact: 'Newton Inspectional Services (zoning review)', sourceId: 'newton-isd', priority: 5, notEvaluated: true});
  }

  // Other regulatory considerations, taken only from evaluated rule results.
  const historic = HISTORIC_IDS.filter(has).map(id => ({ruleId: id, title: titleOf(byId.get(id)), status: byId.get(id).status, sourceIds: byId.get(id).sourceIds || []}));
  const historicUnresolved = HISTORIC_UNRESOLVED_IDS.filter(has).map(id => ({ruleId: id, title: titleOf(byId.get(id)), status: byId.get(id).status, sourceIds: byId.get(id).sourceIds || []}));
  if (historicUnresolved.length) {
    if (has('property.historic-age-unknown')) addInfo('Building age / year built (not returned by the property record)');
    addConfirmation({issue: 'Historic review applicability', reason: 'HPP could not establish the building-age or historic-status condition that decides whether historic review applies.', informationNeeded: 'Confirmed construction date or historic status of the building', question: 'Does Newton historic review apply to this exterior work, given the building’s construction date and historic status?', contact: 'Newton Historic Preservation', sourceId: 'newton-historic', priority: 6});
  }
  const stormwater = results.filter(r => r.id.startsWith('project.stormwater')).map(r => ({ruleId: r.id, title: titleOf(r), status: r.status, sourceIds: r.sourceIds || []}));
  if (has('project.stormwater-uncertain')) {
    addInfo('Site-work measurements (land disturbance and new impervious area)');
    addConfirmation({issue: 'Stormwater review', reason: 'The site-work measurements needed to apply Newton’s stormwater thresholds were not provided, and missing measurements are never treated as meeting or missing a threshold.', informationNeeded: 'Area of land disturbance and new impervious surface', question: 'Does the proposed site work require a Newton stormwater management permit?', contact: 'Newton Engineering (stormwater)', sourceId: 'newton-stormwater', priority: 7});
  }
  const permits = PERMIT_IDS.filter(id => byId.get(id)?.status === 'required').map(id => ({ruleId: id, title: titleOf(byId.get(id)), status: 'required', sourceIds: byId.get(id).sourceIds || []}));

  confirmations.sort((a, b) => a.priority - b.priority);
  for (const c of confirmations) c.sourceUrl = sourceUrl(c.sourceId);
  const askNewton = confirmations.map(c => c.question).slice(0, 3);

  const conflicts = dimensions.filter(d => d.status === STATUS.CONFLICT);
  const within = dimensions.filter(d => d.status === STATUS.WITHIN);
  const unresolvedDims = dimensions.filter(d => d.status === STATUS.NEEDS_CONFIRMATION);
  const engineConflict = ZONING_EXCEEDS_IDS.some(has);
  const blockingConfirmations = confirmations.filter(c => !c.notEvaluated);

  let overall;
  if (conflicts.length || engineConflict) overall = 'conflict';
  else if (!screen.applies) overall = 'not_triggered';
  else if (!within.length) overall = 'insufficient';
  else if (unresolvedDims.length || blockingConfirmations.length) overall = 'within_needs_confirmation';
  else overall = 'compatible';

  const headline = {
    conflict: 'At least one evaluated dimension appears outside the applicable limit. Zoning relief may be needed.',
    within_needs_confirmation: 'Dimensional analysis appears within the evaluated limits, but additional confirmation is needed for the issues listed below.',
    compatible: 'Every dimension HPP can evaluate appears within the applicable limit. Items HPP does not screen are listed below.',
    insufficient: 'HPP could not evaluate enough dimensions to give a meaningful preliminary result. Missing information was not treated as compliance.',
    not_triggered: 'Based on your answers, this work was not identified as adding floor area or changing the building footprint, so no dimensional analysis is shown.'
  }[overall];

  return {
    overall, overallTitle: OVERALL[overall], headline,
    snapshot, dimensions,
    keyIssues: {
      within: within.map(d => d.label),
      conflicts: conflicts.map(d => d.explanation),
      needsConfirmation: [...unresolvedDims.map(d => d.label), ...blockingConfirmations.filter(c => !unresolvedDims.length || !/Lot creation|FAR allowance|Garage/.test(c.issue)).map(c => c.issue)].filter((v, i, a) => a.indexOf(v) === i),
      otherReviews: historic.map(h => h.title)
    },
    considerations: {historic, historicUnresolved, stormwater, permits},
    informationNeeded: information,
    confirmations, askNewton,
    notScreened: screen.applies ? NOT_SCREENED : [],
    limitations: LIMITATIONS
  };
}
