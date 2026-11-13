import assert from 'node:assert/strict';
import { summarize } from '../api/insights.js';
import { validateTrackPayload } from '../api/track.js';

// Counter accepts only the four anonymous events and no extra fields.
assert.equal(validateTrackPayload({ event: 'visit', returning: true }).returning, true);
assert.equal(validateTrackPayload({ event: 'project_started', projectType: 'deck' }).projectType, 'deck');
assert.equal(validateTrackPayload({ event: 'visit', address: '1 Main St' }), null);
assert.equal(validateTrackPayload({ event: 'hack' }), null);
assert.equal(validateTrackPayload({ event: 'project_started', projectType: '<script>' }), null);

// Visit sources contain only a category, hostname and path—never a full URL/query.
assert.deepEqual(validateTrackPayload({ event: 'visit', source: 'search', referrer: 'google.com', landingPage: '/guides/' }), {
  event: 'visit', projectType: '', returning: false, source: 'search', referrer: 'google.com', landingPage: '/guides/'
});
assert.equal(validateTrackPayload({ event: 'visit', source: 'unknown' }), null);
assert.equal(validateTrackPayload({ event: 'visit', referrer: 'https://google.com/search?q=private' }), null);
assert.equal(validateTrackPayload({ event: 'visit', landingPage: '/guides/?q=private' }), null);
assert.equal(validateTrackPayload({ event: 'project_started', source: 'search' }), null);

const now = new Date('2026-11-20T12:00:00Z');
const ev = [
  ['timestamp', 'event', 'project_type', 'returning_visitor', 'source', 'referrer_domain', 'landing_page'],
  ['2026-11-19T10:00:00Z', 'visit', '', 'no', 'search', 'google.com', '/guides/do-i-need-a-permit-for-a-deck/'],
  ['2026-11-19T10:01:00Z', 'visit', '', 'yes', 'ai', 'chatgpt.com', '/'],
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
assert.equal(s.sources.search, 1);
assert.equal(s.sources.ai, 1);
assert.equal(s.referrers['google.com'], 1);
assert.equal(s.landingPages['/'], 1);
assert.equal(s.daily.length, 14);
const nov19 = s.daily.find(d => d.date === '2026-11-19');
assert.equal(nov19.visits, 2);
assert.equal(nov19.newVisitors, 1);
assert.equal(nov19.returningVisitors, 1);
assert.equal(nov19.projects, 2);
assert.equal(nov19.plansGenerated, 1);

// Older visits without source metadata remain explicitly unrecorded.
const old = summarize([], [['2026-11-19T10:00:00Z', 'visit', '', 'no']], now);
assert.equal(old.sources.not_recorded, 1);
assert.deepEqual(old.referrers, {});
console.log('insights tests passed');
