import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };

export const REGULATORY_STATUSES = new Set([
  'required',
  'not_indicated',
  'potentially_required',
  'needs_confirmation',
  'source_unavailable'
]);

function get(ctx, path) {
  return path.split('.').reduce((v, k) => v?.[k], ctx);
}

function parseValue(raw) {
  raw = raw.trim();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^[-+]?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw.replace(/^['"]|['"]$/g, '');
}

export function evaluateExpression(expr, ctx) {
  return expr.split(/\s*\|\|\s*/).some(orTerm =>
    orTerm.split(/\s*&&\s*/).every(term => {
      const m = term.match(/^([\w.]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
      if (!m) return false;
      const actual = get(ctx, m[1]);
      const expected = parseValue(m[3]);
      switch (m[2]) {
        case '==': return actual === expected;
        case '!=': return actual !== expected;
        case '<': return actual < expected;
        case '>': return actual > expected;
        case '<=': return actual <= expected;
        case '>=': return actual >= expected;
        default: return false;
      }
    })
  );
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
    if (!rule.sourceIds?.length) errors.push('missing sources: ' + rule.id);
    for (const sourceId of rule.sourceIds || []) if (!sourceIds.has(sourceId)) errors.push('unknown source: ' + rule.id + ' -> ' + sourceId);
    if (!rule.possibleOutputs?.includes(rule.status)) errors.push('status absent from possibleOutputs: ' + rule.id);
    if (!rule.decisionLogic?.expression) errors.push('missing decision logic: ' + rule.id);
    if (!rule.lastVerified) errors.push('missing lastVerified: ' + rule.id);
    if (!rule.reviewStatus) errors.push('missing reviewStatus: ' + rule.id);
  }
  return errors;
}

export function evaluateRules(ctx, registry = rules, sourceRegistry = sources) {
  return registry.filter(rule => evaluateExpression(rule.when, ctx)).map(rule => {
    const ruleSources = (rule.sourceIds || []).map(id => sourceRegistry.find(s => s.id === id)).filter(Boolean);
    const sourceMissing = ruleSources.length !== (rule.sourceIds || []).length;
    return {
      ...rule,
      status: sourceMissing ? 'source_unavailable' : rule.status,
      sources: ruleSources,
      explanation: {
        ruleId: rule.id,
        triggerFacts: rule.triggerFacts || [],
        triggeredBy: Object.fromEntries((rule.triggerFacts || []).map(path => [path, get(ctx, path)])),
        sourceIds: rule.sourceIds || [],
        lastVerified: rule.lastVerified || null
      }
    };
  });
}
