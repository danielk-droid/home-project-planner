// Governance layer around the deterministic rule engine.
//
// This module never decides whether a requirement applies. It reads the rule
// set, the source registries and an already-built plan, and answers:
//   - which facts each rule depends on and where those facts come from,
//   - which authority tier supports each rule,
//   - whether a built plan satisfies the fail-closed invariants
//     (no result more confident than its evidence).
// It is the single source for traceability and release-gate checks, so there
// is no second regulatory engine.

import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import ruleRegistry from '../data/governance/rule_registry.json' with { type: 'json' };
import sourceRegistry from '../data/governance/source_registry.json' with { type: 'json' };

export const RISK_CLASSES = ['critical', 'high', 'moderate', 'abstention'];
export const RESULT_STATES = ['required', 'potentially_required', 'needs_confirmation'];
const CONFIDENT = new Set(['required', 'potentially_required']);

// Property facts the app sets as fixed conservative defaults, not GIS readings.
const SYSTEM_DEFAULT_FACTS = new Set(['property.historicStatusUnknown', 'property.openPermitsUnknown', 'property.localLandmark', 'property.preservationRestriction', 'property.nationalRegister']);

const registryById = new Map(ruleRegistry.rules.map(r => [r.ruleId, r]));
const sourceMeta = new Map(sourceRegistry.sources.map(s => [s.sourceId, s]));

export function requiredFacts(rule) {
  if (typeof rule?.when !== 'string') return [];
  const paths = rule.when.split(/\|\||&&/).map(t => t.trim().match(/^([\w.]+)/)?.[1]).filter(Boolean);
  return [...new Set(paths)];
}

export function factProvenance(path) {
  if (SYSTEM_DEFAULT_FACTS.has(path)) return 'system_default';
  if (path.startsWith('property.')) return 'city_gis';
  if (path.startsWith('answers.')) return 'user_answer';
  if (path.startsWith('project.')) return 'derived';
  return 'unknown';
}

export function sourceTier(sourceId) {
  const m = sourceMeta.get(sourceId);
  return m ? m.tier : null;
}

export function ruleGovernance(ruleId) {
  const rule = rules.find(r => r.id === ruleId);
  const meta = registryById.get(ruleId);
  if (!rule || !meta) return null;
  const tiers = (rule.sourceIds || []).map(sourceTier);
  return {
    ruleId,
    status: rule.status,
    riskClass: meta.riskClass,
    humanReview: meta.humanReview,
    interpretationStatus: meta.interpretationStatus,
    uncertaintyCompanions: meta.uncertaintyCompanions,
    knownGap: meta.knownGap || null,
    requiredFacts: requiredFacts(rule).map(path => ({path, provenance: factProvenance(path)})),
    sources: (rule.sourceIds || []).map(id => ({id, tier: sourceTier(id), versionLabel: sourceMeta.get(id)?.versionLabel ?? null, lastVerified: sourceMeta.get(id)?.lastVerified ?? null})),
    bestTier: tiers.every(t => t != null) ? Math.min(...tiers) : null
  };
}

// Structural audit of the rule/source registries. Empty list = pass.
export function registryProblems() {
  const problems = [];
  const ruleIds = new Set(rules.map(r => r.id));
  for (const r of rules) {
    const meta = registryById.get(r.id);
    if (!meta) { problems.push(`${r.id}: missing from governance rule registry`); continue; }
    if (!RISK_CLASSES.includes(meta.riskClass)) problems.push(`${r.id}: unknown risk class ${meta.riskClass}`);
    if (r.status === 'needs_confirmation' && meta.riskClass !== 'abstention') problems.push(`${r.id}: abstention rule mis-classified`);
    if (r.status !== 'needs_confirmation' && meta.riskClass === 'abstention') problems.push(`${r.id}: confident rule classified as abstention`);
    for (const c of meta.uncertaintyCompanions || []) {
      if (!ruleIds.has(c)) problems.push(`${r.id}: companion ${c} does not exist`);
      else if (rules.find(x => x.id === c).status !== 'needs_confirmation') problems.push(`${r.id}: companion ${c} is not a needs_confirmation rule`);
    }
    if (meta.riskClass === 'critical' && !(meta.uncertaintyCompanions || []).length && !meta.knownGap) problems.push(`${r.id}: critical rule has no uncertainty pathway and no documented gap`);
    for (const f of requiredFacts(r)) if (factProvenance(f) === 'unknown') problems.push(`${r.id}: fact ${f} has unknown provenance`);
    for (const id of r.sourceIds || []) {
      const t = sourceTier(id);
      if (t == null) problems.push(`${r.id}: source ${id} missing from source registry`);
      else if (t >= 4) problems.push(`${r.id}: source ${id} is tier ${t}; tier 4-5 sources cannot support a production rule`);
    }
    const tiers = (r.sourceIds || []).map(sourceTier).filter(t => t != null);
    if (tiers.length && Math.min(...tiers) > 1) problems.push(`${r.id}: no official (tier 0-1) source`);
  }
  for (const id of registryById.keys()) if (!ruleIds.has(id)) problems.push(`${id}: registry entry has no rule`);
  for (const s of sources) if (!sourceMeta.has(s.id)) problems.push(`${s.id}: source missing from source registry`);
  for (const id of sourceMeta.keys()) if (!sources.some(s => s.id === id)) problems.push(`${id}: source registry entry has no source`);
  return problems;
}

function isMissing(v) { return v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)); }

// Fail-closed invariants for a built plan. Returns violations (empty = pass).
// Each violation is a potential unsafe-confidence failure.
export function auditPlan(plan) {
  const violations = [];
  const results = plan?.results || [];
  for (const r of results) {
    if (!RESULT_STATES.includes(r.status)) violations.push({ruleId: r.id, kind: 'unknown_state', detail: r.status});
    if (!r.sources?.length) violations.push({ruleId: r.id, kind: 'untraceable', detail: 'result has no resolved source'});
    if (r.missingSourceIds?.length) violations.push({ruleId: r.id, kind: 'missing_source', detail: r.missingSourceIds.join(',')});
    if (!registryById.has(r.id)) violations.push({ruleId: r.id, kind: 'ungoverned_rule', detail: 'not in registry'});
  }
  // An indeterminate fact on a confident result must be visible to the plan.
  const flagged = new Set((plan?.indeterminate || []).map(x => x.ruleId));
  for (const r of results) if (r.indeterminateFacts?.length && !flagged.has(r.id)) violations.push({ruleId: r.id, kind: 'hidden_uncertainty', detail: r.indeterminateFacts.join(',')});
  // Numeric safety: no NaN/Infinity may appear in the zoning screen output.
  const screen = plan?.project?.zoningScreen;
  if (screen) {
    const walk = (v, path) => {
      if (typeof v === 'number' && !Number.isFinite(v)) violations.push({ruleId: 'zoning-screen', kind: 'non_finite_number', detail: path});
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(screen, 'zoningScreen');
  }
  // A dimensional "within limit" conclusion requires every measured input.
  const p = plan?.project || {};
  const exceeds = ['zoningSetbackExceeds', 'zoningCoverageExceeds', 'zoningHeightExceeds', 'zoningFarExceeds'];
  if (p.zoningScreenIncomplete !== true && p.zoningRelevant === true && screen && screen.applies !== false) {
    for (const f of ['lotArea']) if (isMissing(screen[f]) && !p.zoningDistrictUnsupported && !p.zoningDistrictUnknown) violations.push({ruleId: 'zoning-screen', kind: 'complete_without_fact', detail: f});
  }
  for (const f of exceeds) if (p[f] === true && !results.some(r => r.id.startsWith('zoning.'))) violations.push({ruleId: 'zoning-screen', kind: 'conflict_not_reported', detail: f});
  return violations;
}

// Traceable explanation for one result: rule → sources (tier/version) → facts.
export function traceResult(result, plan) {
  const g = ruleGovernance(result.id);
  if (!g) return null;
  const ctx = plan?.context || {};
  const value = path => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), ctx);
  return {
    ...g,
    resultStatus: result.status,
    facts: g.requiredFacts.map(f => ({...f, value: value(f.path) ?? null, indeterminate: (result.indeterminateFacts || []).includes(f.path)})),
    confident: CONFIDENT.has(result.status) && !(result.indeterminateFacts || []).length
  };
}

// Coverage matrix: one row per rule for docs/audits.
export function coverageMatrix() {
  return rules.map(r => {
    const g = ruleGovernance(r.id);
    return {ruleId: r.id, status: r.status, riskClass: g?.riskClass, bestTier: g?.bestTier, facts: g?.requiredFacts.length ?? 0, companions: g?.uncertaintyCompanions.length ?? 0, knownGap: Boolean(g?.knownGap), humanReview: g?.humanReview};
  });
}
