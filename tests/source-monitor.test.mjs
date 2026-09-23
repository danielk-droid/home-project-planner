import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const script=path.join(root,'scripts','monitor-sources.mjs'),validator=path.join(root,'scripts','validate-monitor-output.mjs');
assert.ok(fs.existsSync(script)&&fs.existsSync(validator));
assert.match(fs.readFileSync(script,'utf8'),/changed_high_impact/);
assert.match(fs.readFileSync(script,'utf8'),/changed_irrelevant/);
assert.match(fs.readFileSync(script,'utf8'),/extraction_failure/);
assert.match(fs.readFileSync(script,'utf8'),/history/);
function run(file,env){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[file,'--write-state'],{cwd:root,env:{...process.env,...env}});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>resolve({code,out,err}))})}
const tmp=fs.mkdtempSync(path.join(root,'.tmp-monitor-test-')),out=path.join(tmp,'out'),sources=path.join(tmp,'sources.json'),state=path.join(tmp,'state.json');
let mode='same';
const server=http.createServer((req,res)=>{if(req.url==='/unavailable'){res.writeHead(503);return res.end('down')}if(req.url==='/malformed'){res.writeHead(200,{'content-type':'application/json'});return res.end('{bad')}if(req.url==='/pdf'){res.writeHead(200,{'content-type':'application/pdf'});return res.end('%PDF-fake')}res.writeHead(200,{'content-type':'text/html'});res.end(mode==='same'?'<main>Guidance</main><footer>Updated 09/22/2026</footer>':'<main>Changed permit guidance</main><footer>Updated 09/23/2026</footer>')});
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const port=server.address().port, source=(id,p)=>({id,title:id,publisher:'Official test',url:`http://127.0.0.1:${port}${p}`,authority:'official_guidance',sourceType:'official_guidance'});
 fs.writeFileSync(sources,JSON.stringify([source('unmapped','/unmapped'),source('newton-planning','/mapped'),source('unavailable','/unavailable'),source('malformed','/malformed'),source('pdf-source','/pdf')]));
 fs.writeFileSync(state,JSON.stringify({version:2,sources:{}}));
 let r=await run(script,{MONITOR_SOURCES_PATH:sources,MONITOR_STATE_PATH:state,MONITOR_OUT:out});assert.equal(r.code,0,r.err);
 let report=JSON.parse(fs.readFileSync(path.join(out,'monitor-results.json'),'utf8'));assert.equal(report.firstSeen,2);assert.equal(report.unreachable,1);assert.equal(report.extractionFailures,2);
 r=await run(script,{MONITOR_SOURCES_PATH:sources,MONITOR_STATE_PATH:state,MONITOR_OUT:out});assert.equal(r.code,0,r.err);report=JSON.parse(fs.readFileSync(path.join(out,'monitor-results.json'),'utf8'));assert.equal(report.unchanged,2);assert.equal(report.changed,0);mode='changed';r=await run(script,{MONITOR_SOURCES_PATH:sources,MONITOR_STATE_PATH:state,MONITOR_OUT:out});assert.equal(r.code,0,r.err);
 report=JSON.parse(fs.readFileSync(path.join(out,'monitor-results.json'),'utf8'));
 assert.equal(report.changed,2);
 assert.equal(report.results.find(x=>x.sourceId==='unmapped').changeStatus,'changed_irrelevant');
 const mapped=report.results.find(x=>x.sourceId==='newton-planning');assert.equal(mapped.changeStatus,'changed_known_impact');assert.ok(mapped.reviewRequired);assert.ok(mapped.impactedRuleIds.includes('property.zoning'));
 assert.ok(JSON.parse(fs.readFileSync(path.join(out,'proposals.json'),'utf8')).proposals.some(x=>x.sourceId==='newton-planning'));
 r=await run(validator,{MONITOR_OUT:out});assert.equal(r.code,0,r.err);
 const proposals=JSON.parse(fs.readFileSync(path.join(out,'proposals.json'),'utf8'));proposals.proposals[0].automaticContentUpdate=true;fs.writeFileSync(path.join(out,'proposals.json'),JSON.stringify(proposals));
 r=await run(validator,{MONITOR_OUT:out});assert.notEqual(r.code,0);
}finally{if(server.listening)server.close();fs.rmSync(tmp,{recursive:true,force:true})}
console.log('source monitor automation tests: PASS');
