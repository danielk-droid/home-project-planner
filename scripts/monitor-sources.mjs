import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SOURCES_PATH = process.env.MONITOR_SOURCES_PATH || path.join(ROOT, 'data', 'sources.json');
const STATE_PATH = process.env.MONITOR_STATE_PATH || path.join(ROOT, 'data', 'source-monitor', 'state.json');
const OUT_DIR = process.env.MONITOR_OUT || path.join(ROOT, 'source-monitor-output');
const args = new Set(process.argv.slice(2));
const writeState = args.has('--write-state');
const historyLimit = Number(process.env.MONITOR_HISTORY_LIMIT || 20);
const timeoutMs = Number(process.env.MONITOR_TIMEOUT_MS || 30000);

function sha256(input) { return crypto.createHash('sha256').update(input).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\b(?:last updated|updated)\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function normalizeJson(body) { try { return JSON.stringify(stable(JSON.parse(body))); } catch { return null; } }
function normalize(body, contentType, source) {
  const lower=(contentType||'').toLowerCase();
  if (Buffer.isBuffer(body)) return {text:body,kind:'binary',extractionStatus:lower.includes('pdf')?'unsupported_pdf':'unsupported_binary'};
  const raw=String(body),trimmed=raw.trim();
  if (lower.includes('json')||lower.includes('+json')||(source.sourceType==='official_gis'&&/^[{[]/.test(trimmed))) {
    const json=normalizeJson(raw);
    if (json!==null) return {text:json,kind:'json',extractionStatus:'ok'};
    if (source.sourceType==='official_gis') return {text:normalizeText(raw),kind:'text',extractionStatus:'json_parse_failed'};
  }
  if (lower.includes('html')||lower.includes('text')||lower.includes('xml')||!lower) return {text:normalizeText(raw),kind:'text',extractionStatus:'ok'};
  return {text:raw,kind:'text',extractionStatus:'opaque'};
}
async function fetchSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(source.url, {signal: controller.signal, redirect: 'follow',
      headers: { 'user-agent': 'HPP-source-monitor/1.0', 'accept': 'text/html,application/json,text/plain,application/pdf,*/*' }});
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const normalized = normalize(contentType.includes('text') || contentType.includes('json') || contentType.includes('xml') ? buffer.toString('utf8') : buffer, contentType);
    const normalizedText = Buffer.isBuffer(normalized.text) ? normalized.text : String(normalized.text);
    return {ok:response.ok,status:response.status,finalUrl:response.url,contentType,bytes:buffer.length,
      normalizedBytes:Buffer.byteLength(normalizedText),hash:sha256(normalizedText),elapsedMs:Date.now()-started,body:buffer,
      extractionStatus:normalized.extractionStatus};
  } catch (error) {
    return {ok:false,status:null,finalUrl:source.url,contentType:'',bytes:0,normalizedBytes:0,hash:null,
      extractionStatus:'fetch_failed',elapsedMs:Date.now()-started, error:error?.name === 'AbortError' ? 'timeout' : String(error?.message || error)};
  } finally { clearTimeout(timer); }
}
function loadJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }

const sources = loadJson(SOURCES_PATH, []);
const oldState = loadJson(STATE_PATH, {version:1, sources:{}});
const rules = loadJson(path.join(ROOT, 'data', 'rules.json'), []);
if (!Array.isArray(sources) || !sources.length) throw new Error('No sources found in data/sources.json');
fs.mkdirSync(OUT_DIR, {recursive:true});

function buildMappings(sources, rules, questions) {
  const map=new Map(sources.map(s=>[s.id,{sourceId:s.id,ruleIds:[],questionIds:[],projectTypes:[]}]));
  const fields=new Map();
  for(const flow of questions) for(const q of flow.questions||[]){if(!fields.has(q.id))fields.set(q.id,[]);fields.get(q.id).push(`${flow.id}.${q.id}`);}
  for(const rule of rules) for(const sid of rule.sourceIds||[]){const m=map.get(sid);if(!m)continue;m.ruleIds.push(rule.id);
    const names=[...String(rule.when||'').matchAll(/(?:project|property)\.([A-Za-z0-9_]+)/g)].map(x=>x[1]);
    for(const name of names)m.questionIds.push(...(fields.get(name)||[]));
    const p=String(rule.id).split('.')[0];m.projectTypes.push(['basement','bathroom','deck','addition'].includes(p)?p:p==='project'?'cross-project':p==='property'?'property-context':p==='workflow'?'workflow':'other');
  }
  return [...map.values()].map(m=>({...m,ruleIds:[...new Set(m.ruleIds)],questionIds:[...new Set(m.questionIds)],projectTypes:[...new Set(m.projectTypes)]}));
}
const results = [];
const nextSources = {};
const mappings=buildMappings(sources,rules,questions);
const mappingBySource=new Map(mappings.map(x=>[x.sourceId,x]));
const results=[],nextSources={},proposals=[];
for(const source of sources){
  if(!source.id||!source.url)throw new Error('Source registry contains an entry without id or url');
  const previous=oldState.sources?.[source.id]||null,result=await fetchSource(source),mapping=mappingBySource.get(source.id)||{ruleIds:[],questionIds:[],projectTypes:[]};
  let status,risk,confidence,reviewRequired,rationale;
  if(!result.ok){status='source_unavailable';risk='high';confidence='high';reviewRequired=true;rationale=result.error||`HTTP ${result.status}`;}
  else if(result.extractionStatus!=='ok'){status='extraction_failure';risk='high';confidence='low';reviewRequired=true;rationale=`Source extraction failed: ${result.extractionStatus}`;}
  else if(!previous?.hash){status='baseline_created';risk='low';confidence='high';reviewRequired=false;rationale='No prior normalized version exists.';}
  else if(result.hash===previous.hash){status='unchanged';risk='none';confidence='high';reviewRequired=false;rationale='Normalized source content is unchanged.';}
  else if(!mapping.ruleIds.length){status='changed_irrelevant';risk='low';confidence='high';reviewRequired=false;rationale='Source changed but no HPP rule currently cites it.';}
  else{const highRisk=source.authority==='primary'||source.sourceType==='primary'||source.sourceType==='official_gis';status=highRisk?'changed_high_impact':'changed_known_impact';risk=highRisk?'high':'medium';confidence='medium';reviewRequired=true;rationale=`Normalized content changed and ${mapping.ruleIds.length} HPP rule(s) cite this source. Regulatory interpretation remains review-only.`;}
  conconst summary={generatedAt:new Date().toISOString(),mode:writeState?'live-write-state':'live-review',sourceCount:results.length,healthy:results.filter(x=>x.health==='healthy').length,unreachable:results.filter(x=>x.health!=='healthy').length,changed:results.filter(x=>x.changed).length,firstSeen:results.filter(x=>x.firstSeen).length,unchanged:results.filter(x=>x.changeStatus==='unchanged').length,irrelevant:results.filter(x=>x.changeStatus==='changed_irrelevant').length,extractionFailures:results.filter(x=>x.changeStatus==='extraction_failure').length,highImpact:results.filter(x=>x.changeStatus==='changed_high_impact').length,reviewRequired:results.filter(x=>x.reviewRequired).length,automaticContentUpdates:0,substantiveRulesNotModifiedByMonitor:true,mappings,mappingPolicy:'Deterministic sourceId and condition-field mapping; inferred impact never authorizes automatic regulatory interpretation.',results};
fs.writeFileSync(path.join(OUT_DIR,'monitor-results.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(OUT_DIR,'proposals.json'),JSON.stringify({generatedAt:summary.generatedAt,proposals},null,2)+'\n');
fs.writeFileSync(path.join(OUT_DIR,'mappings.json'),JSON.stringify(mappings,null,2)+'\n');
if(writeState){fs.mkdirSync(path.dirname(STATE_PATH),{recursive:true});fs.writeFileSync(STATE_PATH,JSON.stringify({version:2,generatedAt:summary.generatedAt,sources:nextSources},null,2)+'\n');}
console.log(JSON.stringify({sourceCount:summary.sourceCount,healthy:summary.healthy,unreachable:summary.unreachable,changed:summary.changed,
  firstSeen:summary.firstSeen,reviewRequired:summary.reviewRequired,stateWritten:writeState},null,2));
