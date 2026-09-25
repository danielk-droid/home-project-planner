import fs from 'node:fs';
import path from 'node:path';
const out=process.env.MONITOR_OUT||path.join(process.cwd(),'source-monitor-output');
const results=JSON.parse(fs.readFileSync(path.join(out,'monitor-results.json'),'utf8'));
const proposals=JSON.parse(fs.readFileSync(path.join(out,'proposals.json'),'utf8'));
if(results.automaticContentUpdates!==0||results.substantiveRulesNotModifiedByMonitor!==true)throw Error('Unsafe monitor update invariant');
if(!Array.isArray(results.results)||!Array.isArray(proposals.proposals))throw Error('Malformed monitor output');
const byId=new Map(results.results.map(r=>[r.sourceId,r]));
for(const r of results.results){
  if(!r.sourceId||!r.changeStatus||!r.risk||!r.confidence)throw Error('Malformed source result');
  if(r.reviewRequired&&r.automaticContentUpdate)throw Error('Unsafe automatic update');
  if((r.changeStatus==='changed_high_impact'||r.changeStatus==='source_unavailable'||r.changeStatus==='extraction_failure')&&!r.reviewRequired)throw Error('Safety gate bypassed');
}
for(const p of proposals.proposals){
  if(!byId.has(p.sourceId)||!p.reviewRequired||p.automaticContentUpdate!==false)throw Error('Invalid proposal');
  if(!Array.isArray(p.impactedRuleIds)||!Array.isArray(p.potentiallyAffectedQuestionIds))throw Error('Invalid proposal mapping');
}
console.log(`monitor output validation: PASS (${results.results.length} sources, ${proposals.proposals.length} proposals)`);
