import assert from 'node:assert/strict';
import fs from 'node:fs';
import rules from '../data/rules.json' with { type: 'json' };
import { buildPlan } from '../src/core.js';
import { registryProblems, ruleGovernance, requiredFacts, factProvenance, traceResult, auditPlan, coverageMatrix, sourceTier } from '../src/governance.js';

// Registry completeness and authority tiers.
assert.deepEqual(registryProblems(), [], 'governance registries must be complete and consistent');
for (const r of rules) {
  const g = ruleGovernance(r.id);
  assert.ok(g, `${r.id} governed`);
  assert.ok(g.bestTier !== null && g.bestTier <= 1, `${r.id} needs an official tier 0-1 source`);
  assert.deepEqual(g.requiredFacts.map(f => f.path), requiredFacts(r));
}
assert.equal(sourceTier('newton-zoning-ordinance'), 0);
assert.equal(factProvenance('property.zoningDistrict'), 'city_gis');
assert.equal(factProvenance('property.openPermitsUnknown'), 'system_default');
assert.equal(factProvenance('project.expansion'), 'derived');
assert.equal(coverageMatrix().length, rules.length);

// Zoning ordinance version stays pinned to the verified edition.
const src = JSON.parse(fs.readFileSync(new URL('../data/governance/source_registry.json', import.meta.url)));
assert.equal(src.sources.find(s => s.sourceId === 'newton-zoning-ordinance').versionLabel, 'Last Amended 12-01-25');

// Review queue items are well-formed.
const queue = JSON.parse(fs.readFileSync(new URL('../data/governance/review_queue.json', import.meta.url)));
for (const item of queue.items) {
  for (const k of ['id', 'title', 'risk', 'question', 'currentBehavior', 'evidence', 'options', 'recommendation', 'status']) assert.ok(item[k] !== undefined, `${item.id} has ${k}`);
  assert.ok(['open', 'decided', 'closed'].includes(item.status));
}

// Traceability of every result in a representative plan.
const property = {resolvedAddress: 'SYNTHETIC TEST ONLY', zoningDistrict: 'SR2', lotSizeSqFt: 10000, yearBuilt: 1930, historicDistrict: null, historicExteriorReview: false, historicStatusUnknown: false, floodplain: true, conservationPotential: true, openPermitsUnknown: true};
const plan = buildPlan('addition', property, {newArea: 400, stories: 1, siteWork: 'yes', structuralChanges: 'yes', electricalWork: 'yes', plumbingWork: 'no', gasWork: 'no', treeImpact: 'unsure'});
assert.deepEqual(auditPlan(plan), []);
for (const r of plan.results) {
  const t = traceResult(r, plan);
  assert.ok(t && t.sources.length && t.facts.length, `${r.id} traceable`);
}

// INC-2026-09-27-01 regression: the floodplain fact is boolean and the rule fires.
assert.ok(plan.results.some(r => r.id === 'property.floodplain'), 'mapped floodplain must surface the floodplain pathway');
const core = fs.readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
assert.match(core, /floodplain: Boolean\(flood\.features\?\.length\)/, 'GIS floodplain fact must be boolean');
assert.doesNotMatch(core, /floodplain: floodAttrs\.Name/, 'layer name must not be the rule fact');

console.log('governance tests passed');
