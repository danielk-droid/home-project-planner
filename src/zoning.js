// Newton zoning dimensional screen (Chapter 30, Sec. 3.1.3 / 3.1.9) for
// single-family detached dwellings in SR1, SR2 and SR3.
//
// Each check returns one of:
//   within         - the stated measurement is inside the published limit
//   exceeds        - the stated measurement is beyond the published limit
//   unknown        - a required fact is missing, malformed, or the result
//                    depends on a fact HPP does not have (lot creation date,
//                    roof type, the pre-1953 FAR condition)
//   not_applicable - the screen does not apply to this project or district
// A missing or malformed number is never treated as zero.
import table from '../data/zoning_dimensional.json' with { type: 'json' };

export const ZONING_TABLE = table;
const EPS = 1e-9;

export function toMeasurement(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

export function normalizeDistrict(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
  return s || null;
}

export function maxFar(district, lotArea) {
  const bands = table.districts[district]?.far;
  if (!bands || lotArea == null || lotArea <= 0) return null;
  let band = null;
  for (const b of bands) if ((b.minLot ?? 0) <= lotArea) band = b;
  if (!band) return null;
  if (band.fixed != null) return band.fixed;
  return Math.round((band.base - band.slope * (lotArea - band.from)) * 1e6) / 1e6;
}

function eras(lotEra) {
  if (lotEra === 'before_1953') return ['before_1953'];
  if (lotEra === 'on_or_after_1953') return ['on_or_after_1953'];
  return ['on_or_after_1953', 'before_1953'];
}

// Combine outcomes computed under every still-possible assumption: the result
// is definite only when all assumptions agree.
function agree(outcomes) {
  if (outcomes.some(o => o === 'unknown')) return 'unknown';
  return outcomes.every(o => o === outcomes[0]) ? outcomes[0] : 'unknown';
}

function garageExemptionMayApply(yearBuilt) {
  const y = toMeasurement(yearBuilt);
  return y == null || !Number.isInteger(y) || y <= 1922;
}

const atLeast = (value, min) => (value + EPS >= min ? 'within' : 'exceeds');
const atMost = (value, max) => (value <= max + EPS ? 'within' : 'exceeds');

export function zoningScreen(property = {}, answers = {}, applies = true) {
  const district = normalizeDistrict(property?.zoningDistrict);
  const base = {applies: Boolean(applies), district, supportedDistrict: false, checks: {}, missing: []};
  if (!applies) return base;
  const spec = district ? table.districts[district] : null;
  if (!spec) return {...base, districtStatus: district ? 'unsupported' : 'unknown'};
  base.supportedDistrict = true;
  base.districtStatus = 'supported';

  const lotEra = ['before_1953', 'on_or_after_1953'].includes(answers.zoningLotEra) ? answers.zoningLotEra : null;
  const possibleEras = eras(lotEra);
  const lotArea = toMeasurement(answers.zoningLotAreaSqFt) ?? toMeasurement(property?.lotSizeSqFt);
  const side = toMeasurement(answers.zoningSideSetbackFt);
  const rear = toMeasurement(answers.zoningRearSetbackFt);
  const height = toMeasurement(answers.zoningHeightFt);
  const roof = ['sloped', 'flat'].includes(answers.zoningRoofType) ? answers.zoningRoofType : null;
  const gfa = toMeasurement(answers.zoningTotalFloorAreaSqFt);
  const coverage = toMeasurement(answers.zoningTotalCoverageSqFt);
  const missing = [];
  if (!lotEra) missing.push('lot creation date (before or after 12/7/1953)');

  // Setbacks: side and rear only.
  const setbackParts = [];
  for (const [key, value] of [['side', side], ['rear', rear]]) {
    if (value == null) { missing.push(key + ' setback'); setbackParts.push('unknown'); continue; }
    setbackParts.push(agree(possibleEras.map(e => atLeast(value, spec.setbacks[e][key]))));
  }
  base.checks.setbacks = {
    status: setbackParts.includes('exceeds') ? 'exceeds' : agree(setbackParts),
    side, rear,
    limits: Object.fromEntries(possibleEras.map(e => [e, spec.setbacks[e]]))
  };

  // Lot coverage.
  if (lotArea == null) missing.push('lot area');
  if (coverage == null) missing.push('total building coverage');
  base.checks.lotCoverage = lotArea == null || coverage == null || lotArea <= 0
    ? {status: 'unknown'}
    : (() => {
      const pct = coverage / lotArea * 100;
      let status = agree(possibleEras.map(e => atMost(pct, spec.lotCoveragePct[e])));
      // Sec. 1.5.2.D.2: lot coverage limits do not apply to a private garage
      // accessory to a single- or two-family residence that existed on
      // 12/27/1922. When a garage project's house could predate that date
      // (year built 1922 or earlier, or not returned), an over-limit result
      // is not established.
      const garageExemptionPossible = answers.projectCatalogId === 'garage' && garageExemptionMayApply(property?.yearBuilt);
      if (status === 'exceeds' && garageExemptionPossible) {
        status = 'unknown';
        missing.push('whether the Sec. 1.5.2.D.2 garage exemption applies (house existing on 12/27/1922)');
      }
      return {status, percent: Math.round(pct * 100) / 100, garageExemptionPossible,
        limits: Object.fromEntries(possibleEras.map(e => [e, spec.lotCoveragePct[e]]))};
    })();

  // Height.
  if (height == null) missing.push('building height');
  if (!roof) missing.push('roof type');
  base.checks.height = height == null
    ? {status: 'unknown'}
    : {status: agree((roof ? [roof] : ['sloped', 'flat']).map(r => atMost(height, spec.heightFt[r]))), height,
      limits: roof ? {[roof]: spec.heightFt[roof]} : spec.heightFt};

  // FAR. For pre-1953 lots the +0.02 allowance depends on the new work meeting
  // post-1953 setbacks (including the front setback, which HPP does not screen),
  // so a ratio inside that allowance band stays unknown.
  if (gfa == null) missing.push('total gross floor area');
  const limit = maxFar(district, lotArea);
  if (gfa == null || limit == null) base.checks.far = {status: 'unknown', maxFar: limit};
  else {
    const ratio = gfa / lotArea;
    const outcomes = possibleEras.map(e => {
      if (e === 'on_or_after_1953') return atMost(ratio, limit);
      if (ratio <= limit + EPS) return 'within';
      if (ratio > limit + table.pre1953FarBonus + EPS) return 'exceeds';
      return 'unknown';
    });
    base.checks.far = {status: agree(outcomes), ratio: Math.round(ratio * 10000) / 10000, maxFar: limit};
  }
  base.missing = [...new Set(missing)];
  return base;
}

// Flat facts consumed by rules.json through deriveProject().
export function zoningFacts(property, answers, applies) {
  const s = zoningScreen(property, answers, applies);
  const st = k => s.checks[k]?.status;
  const any = v => ['setbacks', 'lotCoverage', 'height', 'far'].some(k => st(k) === v);
  return {
    zoningScreen: s,
    zoningSetbackExceeds: st('setbacks') === 'exceeds',
    zoningCoverageExceeds: st('lotCoverage') === 'exceeds',
    zoningHeightExceeds: st('height') === 'exceeds',
    zoningFarExceeds: st('far') === 'exceeds',
    zoningScreenIncomplete: s.supportedDistrict && any('unknown'),
    zoningDistrictUnsupported: s.applies && s.districtStatus === 'unsupported',
    zoningDistrictUnknown: s.applies && s.districtStatus === 'unknown',
  };
}
