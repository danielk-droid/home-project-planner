// Release gate: fails (exit 1) on any critical governance problem.
import { validateRules, buildPlan, PROJECTS } from '../src/core.js';
import { registryProblems, auditPlan } from '../src/governance.js';
import rules from '../data/rules.json' with { type: 'json' };
import registry from '../data/governance/rule_registry.json' with { type: 'json' };
import reviewIndex from '../data/governance/review_index.json' with { type: 'json' };
import fs from 'node:fs';

const failures = [];
for (const p of validateRules()) failures.push(`rule: ${p}`);
for (const p of registryProblems()) failures.push(`registry: ${p}`);
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
if (failures.length) { console.error('RELEASE GATE FAILED\n' + failures.join('\n')); process.exit(1); }
console.log(`release gate passed; ${reviewIndex.ids.length} review item id(s) tracked privately — check danielk-droid/hpp-governance-private before public launch`);
