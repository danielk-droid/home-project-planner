// Release gate: fails (exit 1) on any critical governance problem.
import { validateRules, buildPlan, PROJECTS } from '../src/core.js';
import { registryProblems, auditPlan, fallbackExecutes, reviewIndexProblems, publicReleaseBlockers } from '../src/governance.js';
import { evaluateRules } from '../src/core.js';
import rules from '../data/rules.json' with { type: 'json' };
import registry from '../data/governance/rule_registry.json' with { type: 'json' };
import reviewIndex from '../data/governance/review_index.json' with { type: 'json' };
import fs from 'node:fs';

const failures = [];
for (const p of validateRules()) failures.push(`rule: ${p}`);
for (const p of registryProblems()) failures.push(`registry: ${p}`);
for (const p of reviewIndexProblems()) failures.push(`review: ${p}`);
const property = {resolvedAddress: 'SYNTHETIC', zoningDistrict: 'SR2', lotSizeSqFt: 8000, yearBuilt: null, floodplain: true, conservationPotential: true, historicExteriorReview: true, historicStatusUnknown: true, openPermitsUnknown: true};
const fired = new Set();
for (const t of Object.keys(PROJECTS)) for (const v of ['yes', 'no', 'unsure', null]) {
  const answers = Object.fromEntries(PROJECTS[t].questions.map(q => [q.id, v]));
  const plan = buildPlan(t, property, answers);
  plan.results.forEach(r => fired.add(r.id));
  for (const x of auditPlan(plan)) failures.push(`plan ${t}/${v}: ${x.kind} ${x.ruleId} ${x.detail}`);
}
// Risk class matters: every high/critical rule must be reachable by the gate
// sweep or by a named test file, so no high-risk rule ships unexercised.
const testText = fs.readdirSync(new URL('../tests/', import.meta.url)).map(f => fs.readFileSync(new URL('../tests/' + f, import.meta.url), 'utf8')).join('\n');
for (const m of registry.rules) if (['critical', 'high'].includes(m.riskClass) && !fired.has(m.ruleId) && !testText.includes(`'${m.ruleId}'`)) failures.push(`coverage: ${m.riskClass} rule ${m.ruleId} is never exercised`);
// Private review content must never be committed to this public repository.
for (const f of ['review_queue.json', 'incidents.json']) if (fs.existsSync(new URL('../data/governance/' + f, import.meta.url))) failures.push(`privacy: data/governance/${f} must live in the private review repository`);
if (!rules.length) failures.push('no rules loaded');
// Fallbacks must execute through the real evaluator, and their uncertainty
// signal must be reachable from real answers (gate sweep or named test).
for (const m of registry.rules) for (const c of m.uncertaintyCompanions || []) {
  const rule = rules.find(r => r.id === c);
  if (!rule || !fallbackExecutes(rule, evaluateRules)) failures.push(`fallback: ${c} (for ${m.ruleId}) does not execute through the rule engine`);
  else if (!fired.has(c) && !testText.includes(`'${c}'`)) failures.push(`fallback: ${c} (for ${m.ruleId}) is never reached from real answers`);
}
if (reviewIndex.openCriticalIncidents.length) failures.push(`open critical incident(s): ${reviewIndex.openCriticalIncidents.join(',')}`);
// Leak test: nothing the app serves may contain private review prose.
const PRIVATE_MARKERS = /REVIEW REQUIRED|COMPETING INTERPRETATIONS|AI\/ENGINEERING RECOMMENDATION|DECISION OPTIONS|"recommendation"\s*:|"currentBehavior"\s*:/;
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.name.startsWith('.') || ['node_modules', 'tests', 'docs'].includes(e.name) ? [] : e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
for (const f of walk(root)) if (/\.(js|mjs|json|html|css|md|txt)$/.test(f) && !f.endsWith('release-gate.mjs') && PRIVATE_MARKERS.test(fs.readFileSync(f, 'utf8'))) failures.push(`privacy: private review content found in public file ${f.slice(root.length + 1)}`);
if (failures.length) { console.error('RELEASE GATE FAILED\n' + failures.join('\n')); process.exit(1); }
console.log(`engineering release gate passed. PUBLIC LAUNCH BLOCKED until the owner resolves: ${publicReleaseBlockers().join(', ')} (professional review / live validation — never closed by automation)`);
