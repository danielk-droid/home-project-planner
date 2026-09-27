// Owner-side check (needs a local clone of the private review repo):
// every public review ID and gap reference exists privately with the same status.
import fs from 'node:fs';
import index from '../data/governance/review_index.json' with { type: 'json' };
import registry from '../data/governance/rule_registry.json' with { type: 'json' };
const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/verify-private-review.mjs <private-repo-dir>'); process.exit(2); }
const priv = JSON.parse(fs.readFileSync(dir + '/review_queue.json', 'utf8')).items;
const bad = [];
for (const i of index.items) { const p = priv.find(x => x.ID === i.id); if (!p) bad.push(`${i.id} missing privately`); else if (String(p.STATUS).split(/[ (]/)[0] !== i.status) bad.push(`${i.id} status mismatch`); }
for (const r of registry.rules) if (r.knownGap && !priv.some(x => x.ID === r.knownGap.reviewId)) bad.push(`${r.ruleId} gap ${r.knownGap.reviewId} missing privately`);
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('private review repo consistent with public index');
