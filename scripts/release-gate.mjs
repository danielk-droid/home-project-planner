// Release gate: fails (exit 1) on any critical governance problem.
import { validateRules, buildPlan, PROJECTS } from '../src/core.js';
import { registryProblems, auditPlan } from '../src/governance.js';
import queue from '../data/governance/review_queue.json' with { type: 'json' };
import incidents from '../data/governance/incidents.json' with { type: 'json' };

const failures = [];
for (const p of validateRules()) failures.push(`rule: ${p}`);
for (const p of registryProblems()) failures.push(`registry: ${p}`);
const property = {resolvedAddress: 'SYNTHETIC', zoningDistrict: 'SR2', lotSizeSqFt: 8000, yearBuilt: null, floodplain: true, conservationPotential: true, historicExteriorReview: true, historicStatusUnknown: true, openPermitsUnknown: true};
for (const t of Object.keys(PROJECTS)) for (const v of ['yes', 'no', 'unsure', null]) {
  const answers = Object.fromEntries(PROJECTS[t].questions.map(q => [q.id, v]));
  for (const x of auditPlan(buildPlan(t, property, answers))) failures.push(`plan ${t}/${v}: ${x.kind} ${x.ruleId} ${x.detail}`);
}
for (const i of incidents.incidents) if (i.severity === 'critical' && !['fixed_pending_merge', 'closed'].includes(i.status)) failures.push(`open critical incident ${i.id}`);
const openCritical = queue.items.filter(i => i.status === 'open' && i.risk.startsWith('critical'));
if (failures.length) { console.error('RELEASE GATE FAILED\n' + failures.join('\n')); process.exit(1); }
console.log(`release gate passed; ${openCritical.length} open critical-process review item(s) require the owner before public launch`);
