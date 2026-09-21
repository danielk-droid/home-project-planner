import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const DEFAULT_CONFIG=path.join(ROOT,'monitor/config/sources.json');
export const DEFAULT_MAP=path.join(ROOT,'monitor/config/knowledge-map.json');

export function normalizeHtml(html){
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<(nav|footer|header|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
}
export function normalizeText(text){return String(text||'').replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
export function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
export function meaningfulDiff(previous,current){
  if(!previous || previous.hash===current.hash)return {changed:false,added:[],removed:[]};
  const a=(previous.text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const b=(current.text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const aset=new Set(a),bset=new Set(b);
  return {changed:true,added:b.filter(x=>!aset.has(x)).slice(0,80),removed:a.filter(x=>!bset.has(x)).slice(0,80)};
}
const regulatoryWords=/\b(required|must|shall|permit|ordinance|regulation|code|effective|amended|amendment|prohibited|approval|variance|setback|height|floor area|fee|inspection)\b/i;
export function classifyChange(source,diff){
  if(!diff.changed)return 'A_NO_MEANINGFUL_CHANGE';
  const changed=[...diff.added,...diff.removed].join(' ');
  const relevant=(source.monitoring?.topics||[]).some(t=>changed.toLowerCase().includes(t.toLowerCase()));
  if(!relevant)return 'C_INFORMATIONAL_IRRELEVANT_TO_HPP';
  if(source.monitoring?.authorityTier==='primary' && regulatoryWords.test(changed))return 'E_POTENTIALLY_REGULATORY_CHANGE';
  return 'D_RELEVANT_INFORMATIONAL_CHANGE';
}
export function safetyAssessment(source,classification,mapping){
  const reasons=[];
  if(source.monitoring?.authorityTier!=='primary')reasons.push('Source is not marked primary authority.');
  if(!mapping?.ruleIds?.length)reasons.push('No explicit HPP rule mapping exists.');
  if(classification!=='F_CLEAR_REGULATORY_CHANGE')reasons.push('Change is not deterministically classified as clear.');
  reasons.push('V1 automatic production changes are disabled.');
  return {decision:'HUMAN_REVIEW',confidence:'LOW',reasons};
}
async function pdfText(buffer){
  return new Promise((resolve,reject)=>{
    const p=spawn('pdftotext',['-layout','-','-'],{stdio:['pipe','pipe','pipe']});
    let out='',err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
    p.on('error',reject); p.on('close',c=>c===0?resolve(normalizeText(out)):reject(new Error(err||'pdftotext failed'))); p.stdin.end(buffer);
  });
}
async function fetchSource(source){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),30000);
  try{
    const r=await fetch(source.url,{redirect:'follow',signal:c.signal,headers:{'User-Agent':'HPP-Regulatory-Monitor/1.0'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const ct=r.headers.get('content-type')||'',buf=Buffer.from(await r.arrayBuffer());
    const text=source.monitoring?.parser==='pdf'||ct.includes('application/pdf')?await pdfText(buf):normalizeHtml(buf.toString('utf8'));
    if(!text||text.length<40)throw new Error('Insufficient meaningful content');
    return {status:'ok',retrievedAt:new Date().toISOString(),contentType:ct,finalUrl:r.url,text,hash:sha256(text)};
  }finally{clearTimeout(timer);}
}
export async function runMonitor({configPath=DEFAULT_CONFIG,mapPath=DEFAULT_MAP,statePath='monitor-state.json',outputDir='monitor-results',bootstrap=false}={}){
  const sources=JSON.parse(await fs.readFile(configPath,'utf8')).filter(x=>x.monitoring?.enabled);
  const map=JSON.parse(await fs.readFile(mapPath,'utf8')); let state={version:1,sources:{},history:[]};
  try{state=JSON.parse(await fs.readFile(statePath,'utf8'));}catch{}
  if(!state || typeof state!=='object') state={};
  if(!state.sources || typeof state.sources!=='object') state.sources={};
  if(!Array.isArray(state.history)) state.history=[];
  const results=[],proposals=[];
  for(const source of sources){
    const previous=state.sources[source.id];
    try{
      const current=await fetchSource(source),diff=meaningfulDiff(previous,current);
      const classification=bootstrap||!previous?'A_NO_MEANINGFUL_CHANGE':classifyChange(source,diff);
      const mapping=map.mappings.find(x=>x.sourceId===source.id);
      const safety=safetyAssessment(source,classification,mapping);
      const meaningful=!!previous&&diff.changed&&!bootstrap;
      const result={sourceId:source.id,title:source.title,checkedAt:current.retrievedAt,status:'ok',classification,previousHash:previous?.hash||null,currentHash:current.hash,meaningfulChange:meaningful,added:diff.added,removed:diff.removed,affectedRuleIds:mapping?.ruleIds||[],affectedQuestionIds:mapping?.questionIds||[],affectedProjectTypes:mapping?.projectTypes||[],safety};
      results.push(result); state.sources[source.id]={...current,lastClassification:classification};
      state.history.push({...result});
      if(meaningful&&classification!=='C_INFORMATIONAL_IRRELEVANT_TO_HPP'&&classification!=='A_NO_MEANINGFUL_CHANGE'){
        proposals.push({...result,proposalId:'proposal-'+source.id+'-'+current.hash.slice(0,12),sourceUrl:source.url,oldText:previous.text,newText:current.text});
      }
    }catch(e){
      const result={sourceId:source.id,title:source.title,checkedAt:new Date().toISOString(),status:'unavailable',classification:'SOURCE_UNAVAILABLE',error:String(e.message||e),previousHash:previous?.hash||null,currentHash:previous?.hash||null,meaningfulChange:false};
      results.push(result);state.history.push(result);
    }
  }
  state.history=state.history.slice(-1000); await fs.mkdir(outputDir,{recursive:true});
  await fs.writeFile(path.join(outputDir,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),bootstrap,results,proposals},null,2));
  await fs.writeFile(path.join(outputDir,'review-required.json'),JSON.stringify(proposals,null,2));
  await fs.writeFile(path.join(outputDir,'summary.json'),JSON.stringify({generatedAt:new Date().toISOString(),bootstrap,checked:results.length,unavailable:results.filter(x=>x.status==='unavailable').length,meaningfulChanges:results.filter(x=>x.meaningfulChange).length,reviewRequired:proposals.length},null,2));
  await fs.writeFile(statePath,JSON.stringify(state,null,2)+'\n'); return {results,proposals,state};
}
if(import.meta.url==='file://'+process.argv[1]){runMonitor({bootstrap:process.argv.includes('--bootstrap'),statePath:process.env.MONITOR_STATE_PATH||'monitor-state.json',outputDir:process.env.MONITOR_OUTPUT_DIR||'monitor-results'}).then(r=>console.log(JSON.stringify({checked:r.results.length,reviewRequired:r.proposals.length,unavailable:r.results.filter(x=>x.status==='unavailable').length},null,2)));}
