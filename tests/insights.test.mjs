import assert from 'node:assert/strict';
import { summarize } from '../api/insights.js';
import { validateTrackPayload } from '../api/track.js';

// Counter accepts only the four anonymous events and no extra fields.
assert.equal(validateTrackPayload({ event: 'visit', returning: true }).returning, true);
assert.equal(validateTrackPayload({ event: 'project_started', projectType: 'deck' }).projectType, 'deck');
assert.equal(validateTrackPayload({ event: 'visit', address: '1 Main St' }), null);
assert.equal(validateTrackPayload({ event: 'hack' }), null);
assert.equal(validateTrackPayload({ event: 'project_started', projectType: '<script>' }), null);

const now = new Date('2026-11-20T12:00:00Z');
const ev = [
  ['timestamp', 'event', 'project_type', 'returning_visitor'],
  ['2026-11-19T10:00:00Z', 'visit', '', 'no'],
  ['2026-11-19T10:01:00Z', 'visit', '', 'yes'],
  ['2026-11-19T10:02:00Z', 'project_started', 'deck', 'no'],
  ['2026-11-19T10:03:00Z', 'project_started', 'deck', 'no'],
  ['2026-11-19T10:05:00Z', 'plan_generated', 'deck', 'no']
];
const fb = [['2026-11-18T00:00:00Z', 'Homeowner', 'x', 'Very useful', 'Yes', 'Great', '']];
const s = summarize(fb, ev, now);
assert.equal(s.totals.visits, 2);
assert.equal(s.totals.newVisitors, 1);
assert.equal(s.rates.returning, 50);
assert.equal(s.rates.completion, 50);
assert.equal(s.totals.feedback, 1);
assert.equal(s.projectTypes.deck, 2);
assert.equal(s.daily.length, 14);
console.log('insights tests passed');
