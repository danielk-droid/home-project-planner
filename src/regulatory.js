import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };

export const REGULATORY_STATUSES = new Set([
  'required',
  'not_indicated',
  'potentially_required',
  'needs_confirmation',
  'source_unavailable'
]);

export const DECISION_STATES = new Set([
  'affirmative',
  'negative',
  'unknown',
  'source_unavailable'
]);

function get(ctx, path) {
  return path.split('.').reduce((v, k) => v == null ? undefined : v[k], ctx);
}

function parseValue(raw) {
  raw = raw.trim();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^[-+]?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw.replace(/^['"]|['"]$/g, '');
}

function compare(actual, operator, expected) {
  const actualMissing = actual === undefined || actual === null;
  const expectedNull = expected === null;

  // Null-safe equality follows the conventional "nullish" meaning:
  // == null matches both null and undefined; != null matches neither.
  if (expectedNull && operator === '==') return actualMissing;
  if (expectedNull && operator === '!=') return !actualMissing;

  // Missing values cannot establish ordinary comparisons.
  if (actualMissing) return null;

  switch (operator) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '<': return actual < expected;
    case '>': return actual > expected;
    case '<=': return actual <= expected;
    case '>=': return actual >= expected;
    default: return false;
  }
}

function evaluateTerm(term, ctx) {
  const m = term.trim().match(/^([\w.]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
  if (!m) return false;
  const actual = get(ctx, m[1]);
  const expected = parseValue(m[3]);
  const result = compare(actual, m[2], expected);
  if (result === null) return 'unknown';
  return result;
}

export function evaluateExpressionState(expr, ctx) {
  const orTerms = expr.split(/\s*\|\|\s*/);
  let sawUnknown = false;

  for (const orTerm of orTerms) {
    const andTerms = orTerm.split(/\s*&&\s*/);
    let andUnknown = false;
    let andFalse = false;

    for (const term of andTerms) {
      const result = evaluateTerm(term, ctx);
      if (result === false) {
        andFalse = true;
        break;
      }
      if (result === 'unknown') andUnknown = true;
    }

    if (!andFalse && !andUnknown) return 'affirmative';
    if (!andFalse && andUnknown) sawUnknown = true;
  }

  return sawUnknown ? 'unknown' : 'negative';
}

export function evaluateExpression(expr, ctx) {
  return evaluateExpressionState(expr, ctx) === 'affirmative';
}

export function validateRuleRegistry(registry = rules, sourceRegistry = sources) {
  const sourceIds = new Set(sourceRegistry.map(s => s.id));
  const errors = [];
  const seen = new Set();

  for (const rule of registry) {
    if (!rule.id || seen.has(rule.id)) errors.push('duplicate/missing rule id: ' + rule.id);
    seen.add(rule.id);
    if (!REGULATORY_STATUSES.has(rule.status)) errors.push('invalid status: ' + rule.id);
    if (!rule.when || !rule.triggerFacts?.length || !rule.requiredFacts?.length) errors.push('missing trigger facts: ' + rule.id);
    if (new Set(rule.triggerFacts || []).size !== (rule.triggerFacts || []).length) errors.push('duplicate trigger fact: ' + rule.id);
    if (new Set(rule.requiredFacts || []).size !== (rule.requiredFacts || []).length) errors.push('duplicate required fact: ' + rule.id);
    if (!rule.sourceIds?.length) errors.push('missing sources: ' + rule.id);
    for (const sourceId of rule.sourceIds || []) if (!sourceIds.has(sourceId)) errors.push('unknown source: ' + rule.id + ' -> ' + sourceId);
    if (!rule.possibleOutputs?.includes(rule.status)) errors.push('status absent from possibleOutputs: ' + rule.id);
    if (!rule.decisionLogic?.expression) errors.push('missing decision logic: ' + rule.id);
    if (!rule.lastVerified) errors.push('missing lastVerified: ' + rule.id);
    if (!rule.reviewStatus) errors.push('missing reviewStatus: ' + rule.id);
  }
  return errors;
}

function sourceState(sourceId, sourceRegistry, sourceMonitorState) {
  const source = sourceRegistry.find(s => s.id === sourceId);
  if (!source) return {registry: 'missing', monitoring: 'unknown', source: null};

  const monitor = sourceMonitorState?.sources?.[sourceId];
  if (!monitor) return {registry: 'present', monitoring: 'unknown', source};

  return {
    registry: 'present',
    monitoring: monitor.health || (monitor.checkedAt ? 'known' : 'unknown'),
    source
  };
}

export function evaluateRules(ctx, registry = rules, sourceRegistry = sources, sourceMonitorState = null) {
  return registry.flatMap(rule => {
    const sourceStates = (rule.sourceIds || []).map(id => sourceState(id, sourceRegistry, sourceMonitorState));
    const sourceMissing = sourceStates.some(s => s.registry === 'missing');
    const state = sourceMissing ? 'source_unavailable' : evaluateExpressionState(rule.when, ctx);

    // Only affirmative rules and materially unresolved rules are emitted.
    // Known-negative rules remain explicit in the evaluator state but are not
    // displayed as a meaningless "not indicated" row for every registry entry.
    if (state === 'negative') return [];

    const resultStatus = state === 'source_unavailable'
      ? 'source_unavailable'
      : state === 'unknown'
        ? 'needs_confirmation'
        : rule.status;

    const ruleSources = sourceStates.map(s => s.source).filter(Boolean);
    return [{
      ...rule,
      status: resultStatus,
      decisionState: state,
      sourceState: {
        registry: sourceMissing ? 'missing' : 'present',
        monitoring: sourceStates.every(s => s.monitoring === 'unknown') ? 'unknown' : sourceStates.map(s => s.monitoring)
      },
      sources: ruleSources,
      explanation: {
        ruleId: rule.id,
        triggerFacts: rule.triggerFacts || [],
        requiredFacts: rule.requiredFacts || [],
        triggeredBy: Object.fromEntries((rule.triggerFacts || []).map(path => [path, get(ctx, path)])),
        decisionState: state,
        sourceIds: rule.sourceIds || [],
        sourceState: {
          registry: sourceMissing ? 'missing' : 'present',
          monitoring: sourceStates.every(s => s.monitoring === 'unknown') ? 'unknown' : sourceStates.map(s => s.monitoring)
        },
        lastVerified: rule.lastVerified || null
      }
    }];
  });
}
