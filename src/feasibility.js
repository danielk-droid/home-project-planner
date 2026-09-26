const ZONING_EXCEEDS = new Set([
  'zoning.setback-exceeds',
  'zoning.lot-coverage-exceeds',
  'zoning.height-exceeds',
  'zoning.far-exceeds'
]);

const HISTORIC_REVIEW = new Set([
  'property.historic',
  'property.local-landmark',
  'property.preservation-restriction',
  'property.national-register',
  'property.historic-age',
  'property.historic-age-demolition'
]);

const ZONING_UNRESOLVED = new Set([
  'zoning.screen-incomplete',
  'zoning.district-unsupported',
  'zoning.district-unknown'
]);

const HISTORIC_UNRESOLVED = new Set([
  'property.historic-age-boundary-exterior',
  'property.historic-age-unknown',
  'project.historic-status-uncertain',
  'project.age-boundary-uncertain'
]);

export function feasibilitySummary(plan = {}) {
  const results = Array.isArray(plan.results) ? plan.results : [];
  const ids = new Set(results.map(result => result.id));
  const zoningExceeded = [...ZONING_EXCEEDS].filter(id => ids.has(id));
  const historicReview = [...HISTORIC_REVIEW].filter(id => ids.has(id));
  const unresolved = [...ZONING_UNRESOLVED, ...HISTORIC_UNRESOLVED].filter(id => ids.has(id));
  const screen = plan.project?.zoningScreen;
  const checks = screen?.checks ? Object.values(screen.checks) : [];
  const zoningWithin = screen?.applies && screen.supportedDistrict && checks.length > 0 && checks.every(check => check.status === 'within');

  if (zoningExceeded.length) {
    return {
      level:'constraint',
      label:'POTENTIAL ZONING CONSTRAINT',
      title:'The project is not shown as feasible by right yet.',
      description:'At least one entered dimension is outside HPP’s screened Newton limit. Zoning relief may be needed; only the City can determine the applicable path from a complete survey and plans.',
      contact:'Start with Newton Inspectional Services or the Current Planning Division before advancing the design.',
      sourceId:'newton-planning'
    };
  }

  if (historicReview.length) {
    return {
      level:'review',
      label:'CITY REVIEW NEEDED',
      title:'Feasibility depends on historic review.',
      description:'The property or proposed work falls within a historic-review pathway. This does not mean the project is prohibited, but HPP cannot establish feasibility before the applicable City review.',
      contact:'Confirm the project with Newton Historic Preservation before relying on the standard permit path.',
      sourceId:'newton-historic'
    };
  }

  if (unresolved.length) {
    return {
      level:'unknown',
      label:'FEASIBILITY NOT YET ESTABLISHED',
      title:'More property or design information is required.',
      description:'HPP could not complete the relevant zoning or historic screen. Missing information was not treated as compliance.',
      contact:'Ask Newton Inspectional Services or Current Planning to review the property and proposed work; contact Historic Preservation when the unresolved item concerns age or historic status.',
      sourceId:'newton-isd'
    };
  }

  if (zoningWithin) {
    return {
      level:'screened',
      label:'NO ISSUE FOUND IN THE LIMITED SCREEN',
      title:'The entered dimensions are within the limits HPP can screen.',
      description:'This is not a zoning determination or approval. Front setback, open space, stories, facade width, nonconformities, easements, and other property-specific conditions are not fully determined here.',
      contact:'Confirm the final survey and plans through Newton’s zoning and building review before construction.',
      sourceId:'newton-planning'
    };
  }

  return {
    level:'unknown',
    label:'FEASIBILITY REQUIRES CITY CONFIRMATION',
    title:'HPP cannot determine whether this project is allowed from these answers alone.',
    description:'Permit, code, zoning, site, and property-specific conditions may still control the project. No missing fact was treated as approval.',
    contact:'Start with Newton Inspectional Services; use Current Planning for zoning and Historic Preservation for historic-property questions.',
    sourceId:'newton-isd'
  };
}