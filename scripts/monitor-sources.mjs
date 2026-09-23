import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SOURCES_PATH = process.env.MONITOR_SOURCES_PATH || path.join(ROOT, 'data', 'sources.json');
const STATE_PATH = process.env.MONITOR_STATE_PATH || path.join(ROOT, 'data', 'source-monitor', 'state.json');
const OUT_DIR = process.env.MONITOR_OUT || path.join(ROOT, 'source-monitor-output');
const args = new Set(process.argv.slice(2));
const writeState = args.has('--write-state');
const timeoutMs = Number(process.env.MONITOR_TIMEOUT_MS || 30000);

function sha256(input) { return crypto.createHash('sha256').update(input).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function normalize(body, contentType) {
  const lower = (contentType || '').toLowerCase();
  if (lower.includes('application/json') || lower.includes('+json')) {
    try { return JSON.stringify(stable(JSON.parse(body))); } catch {}
  }
  if (lower.includes('text/html') || lower.includes('text/plain') || lower.includes('xml')) return normalizeText(body);
  return body;
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
    return {ok: response.ok, status: response.status, finalUrl: response.url, contentType, bytes: buffer.length,
      normalizedBytes: Buffer.isBuffer(normalized) ? normalized.length : Buffer.byteLength(normalized), hash: sha256(normalized), elapsedMs: Date.now() - started, body: buffer};
  } catch (error) {
    return {ok:false, status:null, finalUrl:source.url, contentType:'', bytes:0, normalizedBytes:0, hash:null,
      elapsedMs:Date.now()-started, error:error?.name === 'AbortError' ? 'timeout' : String(error?.message || error)};
  } finally { clearTimeout(timer); }
}
function loadJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }

const sources = loadJson(SOURCES_PATH, []);
const oldState = loadJson(STATE_PATH, {version:1, sources:{}});
const rules = loadJson(path.join(ROOT, 'data', 'rules.json'), []);
if (!Array.isArray(sources) || !sources.length) throw new Error('No sources found in data/sources.json');
fs.mkdirSync(OUT_DIR, {recursive:true});

const ruleMap = new Map();
for (const rule of rules) for (const sourceId of rule.sourceIds || []) {
  if (!ruleMap.has(sourceId)) ruleMap.set(sourceId, []);
  ruleMap.get(sourceId).push(rule.id);
}

const results = [];
const nextSources = {};
for (const source of sources) {
  if (!source.id || !source.url) throw new Error('Source registry contains an entry without id or url');
  const previous = oldState.sources?.[source.id] || null;
  const result = await fetchSource(source);
  const changed = Boolean(result.ok && result.hash && previous?.hash && result.hash !== previous.hash);
  const firstSeen = Boolean(result.ok && result.hash && !previous?.hash);
  const record = {
    sourceId:source.id, title:source.title, publisher:source.publisher, url:source.url, authority:source.authority, sourceType:source.sourceType,
    checkedAt:new Date().toISOString(), health:result.ok ? 'healthy' : 'unreachable', httpStatus:result.status, finalUrl:result.finalUrl,
    contentType:result.contentType, bytes:result.bytes, normalizedBytes:result.normalizedBytes, hash:result.hash, previousHash:previous?.hash || null,
    firstSeen, changed, changeStatus:changed ? 'changed_requires_review' : firstSeen ? 'baseline_created' : result.ok ? 'unchanged' : 'fetch_failed',
    reviewRequired:changed || !result.ok, impactedRuleIds:ruleMap.get(source.id) || [], elapsedMs:result.elapsedMs, error:result.error || null
  };
  results.push(record);
  nextSources[source.id] = writeState && result.ok && result.hash ? {
    hash:result.hash, checkedAt:record.checkedAt, contentType:result.contentType, bytes:result.bytes,
    normalizedBytes:result.normalizedBytes, finalUrl:result.finalUrl
  } : (previous || {});
  if (result.ok && (changed || firstSeen)) {
    const ext = result.contentType.includes('json') ? 'json' : result.contentType.includes('html') ? 'html' : result.contentType.includes('pdf') ? 'pdf' : 'bin';
    fs.writeFileSync(path.join(OUT_DIR, source.id + '.' + ext), result.body);
  }
}
const summary = {
  generatedAt:new Date().toISOString(), mode:writeState ? 'live-write-state' : 'live-review', sourceCount:results.length,
  healthy:results.filter(x=>x.health==='healthy').length, unreachable:results.filter(x=>x.health!=='healthy').length,
  changed:results.filter(x=>x.changed).length, firstSeen:results.filter(x=>x.firstSeen).length,
  unchanged:results.filter(x=>x.changeStatus==='unchanged').length, reviewRequired:results.filter(x=>x.reviewRequired).length,
  substantiveRulesNotModifiedByMonitor:true, results
};
fs.writeFileSync(path.join(OUT_DIR, 'monitor-results.json'), JSON.stringify(summary,null,2)+'\n');
if (writeState) {
  fs.mkdirSync(path.dirname(STATE_PATH), {recursive:true});
  fs.writeFileSync(STATE_PATH, JSON.stringify({version:1, generatedAt:summary.generatedAt, sources:nextSources},null,2)+'\n');
}
console.log(JSON.stringify({sourceCount:summary.sourceCount,healthy:summary.healthy,unreachable:summary.unreachable,changed:summary.changed,
  firstSeen:summary.firstSeen,reviewRequired:summary.reviewRequired,stateWritten:writeState},null,2));
