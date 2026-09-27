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
import reviewIndex from '../data/governance/review_index.json' with { type: 'json' };

export const RISK_CLASSES = ['critical', 'high', 'moderate', 'abstention'];
export const HIGH_RISK = new Set(['critical', 'high']);
// Honest source-version states. Only VERSIONED means a specific edition's text
// was verified; DATE_VERIFIED_ONLY is weaker evidence and is reported as such.
export const VERSION_STATUSES = ['VERSIONED', 'DATE_VERIFIED_ONLY', 'EFFECTIVE_DATE_UNKNOWN', 'SOURCE_UNAVAILABLE', 'SOURCE_CONFLICT'];
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
    sources: (rule.sourceIds || []).map(id => ({id, tier: sourceTier(id), versionStatus: sourceMeta.get(id)?.versionStatus ?? null, versionLabel: sourceMeta.get(id)?.versionLabel ?? null, lastVerified: sourceMeta.get(id)?.lastVerified ?? null})),
    evidenceVersioned: (rule.sourceIds || []).some(id => sourceMeta.get(id)?.versionStatus === 'VERSIONED'),
    bestTier: tiers.every(t => t != null) ? Math.min(...tiers) : null
  };
}

// Structural audit of the rule/source registries. Empty list = pass.
// A knownGap only excuses a missing fallback when it is a real explanation tied
// to a tracked review item — not an empty string or a "review later" note.
// Public form: {reviewId, code}. The prose rationale is private; the gate
// checks the machine-readable state: a specific gap code tied to an OPEN
// tracked review item (a decided/closed item cannot excuse a missing fallback).
export const REVIEW_IDS = reviewIndex.items.map(i => i.id);
export const REVIEW_STATUSES = ['open', 'owner_decided', 'professionally_reviewed', 'closed'];
// A gap may cite an item that is still open or that the owner decided to keep
// as a disclosed limitation; a closed item cannot excuse a missing fallback.
const OPEN_REVIEW_IDS = reviewIndex.items.filter(i => ['open', 'owner_decided'].includes(i.status)).map(i => i.id);
export const HUMAN_REVIEW_STATES = ['legacy_unreviewed', 'not_required_abstention', 'professionally_reviewed'];
// Owner decision REV-002: critical rules need real professional review before
// public launch. Automation can never set professionally_reviewed on its own.
export function reviewIndexProblems(index = reviewIndex, registry = ruleRegistry) {
  const problems = [];
  const byId = new Map(index.items.map(i => [i.id, i]));
  for (const it of index.items) {
    if (!/^REV-\d{3}$/.test(it.id)) problems.push(`review ${it.id}: malformed id`);
    if (!REVIEW_STATUSES.includes(it.status)) problems.push(`review ${it.id}: invalid status ${it.status}`);
    if (typeof it.releaseBlocking !== 'boolean') problems.push(`review ${it.id}: releaseBlocking must be boolean`);
    if (it.releaseBlocking && ['closed', 'owner_decided'].includes(it.status)) problems.push(`review ${it.id}: release-blocking item cannot be ${it.status}`);
  }
  for (const req of ['REV-002', 'REV-006']) if (!byId.has(req)) problems.push(`review ${req}: required owner blocker missing`);
  if (byId.get('REV-006')?.status === 'professionally_reviewed') problems.push('review REV-006: live validation is not a professional review');
  const proDone = byId.get('REV-002')?.status === 'professionally_reviewed';
  for (const r of registry.rules) {
    if (!HUMAN_REVIEW_STATES.includes(r.humanReview)) problems.push(`${r.ruleId}: invalid humanReview ${r.humanReview}`);
    if (r.humanReview === 'professionally_reviewed' && !proDone) problems.push(`${r.ruleId}: claims professional review while REV-002 is not professionally reviewed`);
    if (r.riskClass !== 'abstention' && r.humanReview === 'not_required_abstention') problems.push(`${r.ruleId}: confident rule marked as not needing review`);
  }
  return problems;
}
export function publicReleaseBlockers(index = reviewIndex) { return index.items.filter(i => i.releaseBlocking && i.status !== 'closed' && i.status !== 'professionally_reviewed').map(i => i.id); }
const PLACEHOLDER = /^(TBD|TODO|FIXME|PLACEHOLDER|REVIEW_LATER|LATER|NA|NONE|PENDING|GAP|UNKNOWN)$/;
export function gapProblem(gap, reviewIds = OPEN_REVIEW_IDS) {
  if (!gap || typeof gap !== 'object' || Array.isArray(gap)) return 'knownGap must be {reviewId, code}';
  if (Object.keys(gap).sort().join(',') !== 'code,reviewId') return 'knownGap has unexpected fields (prose belongs in the private repo)';
  if (!/^REV-\d{3}$/.test(gap.reviewId || '')) return 'knownGap does not reference a tracked review item';
  if (!reviewIds.includes(gap.reviewId)) return `knownGap references unknown or closed review item ${gap.reviewId}`;
  if (typeof gap.code !== 'string' || !/^[A-Z][A-Z0-9_]{11,}$/.test(gap.code) || PLACEHOLDER.test(gap.code) || /TBD|TODO|LATER|PLACEHOLDER/.test(gap.code)) return 'knownGap code is a placeholder, not a specific gap';
  return null;
}

// Behavioral check: run the companion through the real rule evaluator with
// only its uncertainty signals set, and confirm it produces a
// needs_confirmation result. Metadata alone never satisfies the invariant.
export function fallbackExecutes(companion, evaluate) {
  const clauses = companion.when.split('||').map(c => c.split('&&').map(t => t.trim()));
  for (const terms of clauses) {
    if (!terms.some(t => UNCERTAINTY_SIGNAL.test(t.split(/\s/)[0]) && /==\s*true$/.test(t))) continue;
    const ctx = {};
    for (const t of terms) {
      const m = t.match(/^([\w.]+)\s*==\s*(true|false)$/);
      if (!m) break;
      const keys = m[1].split('.'); let o = ctx;
      keys.slice(0, -1).forEach(k => { o = o[k] ??= {}; });
      o[keys.at(-1)] = m[2] === 'true';
    }
    const out = evaluate(ctx, [companion]);
    if (out.some(r => r.id === companion.id && r.status === 'needs_confirmation')) return true;
  }
  return false;
}

// A fallback is only real if it is an abstention rule that fires on an explicit
// uncertainty signal. A needs_confirmation rule keyed only on settled facts
// would never catch the unknown case, so it cannot satisfy the invariant.
const UNCERTAINTY_SIGNAL = /(Uncertain|Unknown|Incomplete|Boundary|Unsupported)\b/;
export function fallbackProblem(ruleId, companionId, ruleList = rules) {
  if (companionId === ruleId) return `companion ${companionId} is the rule itself`;
  const c = ruleList.find(x => x.id === companionId);
  if (!c) return `companion ${companionId} does not exist`;
  if (c.status !== 'needs_confirmation') return `companion ${companionId} is not a needs_confirmation rule`;
  const clauses = typeof c.when === 'string' ? c.when.split('||') : [];
  const signals = clauses.some(cl => /==\s*true/.test(cl) && cl.split('&&').some(t => UNCERTAINTY_SIGNAL.test(t.trim().split(/\s/)[0]) && /==\s*true/.test(t)));
  if (!signals) return `companion ${companionId} does not fire on an uncertainty signal, so it cannot prevent confident output`;
  return null;
}

export function registryProblems(opts = {}) {
  const rules_ = opts.rules || rules;
  const reg = opts.ruleRegistry ? new Map(opts.ruleRegistry.rules.map(r => [r.ruleId, r])) : registryById;
  const srcList = opts.sourceRegistry ? opts.sourceRegistry.sources : sourceRegistry.sources;
  const reviewIds = opts.reviewIds || OPEN_REVIEW_IDS;
  const problems = [];
  const ruleIds = new Set(rules_.map(r => r.id));
  for (const s of srcList) {
    if (!VERSION_STATUSES.includes(s.versionStatus)) problems.push(`source ${s.sourceId}: invalid versionStatus ${s.versionStatus}`);
    if (s.versionStatus === 'VERSIONED' && !(s.versionLabel && s.retrievalStatus === 'text_verified')) problems.push(`source ${s.sourceId}: VERSIONED requires a verified edition label and text verification`);
    if (s.versionStatus !== 'VERSIONED' && s.retrievalStatus === 'text_verified') problems.push(`source ${s.sourceId}: text-verified edition should be VERSIONED`);
    if (s.effectiveFrom && s.versionStatus !== 'VERSIONED') problems.push(`source ${s.sourceId}: effective date claimed without a verified version`);
    if (!s.lastVerified) problems.push(`source ${s.sourceId}: no verification date`);
    if (s.effectiveFrom && s.effectiveFrom > (opts.today || new Date().toISOString().slice(0, 10))) problems.push(`source ${s.sourceId}: not yet in effect but registered as current`);
    if (s.supersededBy) problems.push(`source ${s.sourceId}: superseded by ${s.supersededBy} but still registered as current`);
  }
  for (const r of rules_) {
    const meta = reg.get(r.id);
    if (!meta) { problems.push(`${r.id}: missing from governance rule registry`); continue; }
    if (!RISK_CLASSES.includes(meta.riskClass)) problems.push(`${r.id}: unknown risk class ${meta.riskClass}`);
    if (r.status === 'needs_confirmation' && meta.riskClass !== 'abstention') problems.push(`${r.id}: abstention rule mis-classified`);
    if (r.status !== 'needs_confirmation' && meta.riskClass === 'abstention') problems.push(`${r.id}: confident rule classified as abstention`);
    const companions = meta.uncertaintyCompanions || [];
    const badFallbacks = companions.map(c => fallbackProblem(r.id, c, rules_)).filter(Boolean);
    for (const b of badFallbacks) problems.push(`${r.id}: ${b}`);
    if (HIGH_RISK.has(meta.riskClass)) {
      const validFallback = companions.length > badFallbacks.length;
      if (!validFallback) {
        if (meta.knownGap === undefined || meta.knownGap === null) problems.push(`${r.id}: ${meta.riskClass} rule has no valid uncertainty fallback and no documented gap`);
        else { const g = gapProblem(meta.knownGap, reviewIds); if (g) problems.push(`${r.id}: ${meta.riskClass} rule ${g}`); }
      }
    }
    for (const f of requiredFacts(r)) if (factProvenance(f) === 'unknown') problems.push(`${r.id}: fact ${f} has unknown provenance`);
    for (const id of r.sourceIds || []) {
      const st = srcList.find(x => x.sourceId === id)?.versionStatus;
      if (r.status !== 'needs_confirmation' && ['SOURCE_CONFLICT', 'SOURCE_UNAVAILABLE'].includes(st)) problems.push(`${r.id}: confident rule rests on source ${id} with status ${st}`);
      const t = opts.sourceRegistry ? srcList.find(x => x.sourceId === id)?.tier ?? null : sourceTier(id);
      if (t == null) problems.push(`${r.id}: source ${id} missing from source registry`);
      else if (t >= 4) problems.push(`${r.id}: source ${id} is tier ${t}; tier 4-5 sources cannot support a production rule`);
    }
    const tiers = (r.sourceIds || []).map(sourceTier).filter(t => t != null);
    if (tiers.length && Math.min(...tiers) > 1) problems.push(`${r.id}: no official (tier 0-1) source`);
  }
  for (const id of reg.keys()) if (!ruleIds.has(id)) problems.push(`${id}: registry entry has no rule`);
  const srcIds = new Set(srcList.map(s => s.sourceId));
  if (!opts.sourceRegistry) for (const s of sources) if (!srcIds.has(s.id)) problems.push(`${s.id}: source missing from source registry`);
  if (!opts.sourceRegistry) for (const id of srcIds) if (!sources.some(s => s.id === id)) problems.push(`${id}: source registry entry has no source`);
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
