import { createSign, createHash, timingSafeEqual } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

export function googleConfig() {
  let key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  return {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    key: key.replace(/\\n/g, '\n'),
    sheetId: (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '').trim()
  };
}

async function timed(url, options = {}, ms = 5000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...options, signal: c.signal }); } finally { clearTimeout(t); }
}

export async function accessToken(cfg, scope) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: cfg.email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const s = createSign('RSA-SHA256'); s.update(unsigned); s.end();
  const res = await timed(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + s.sign(cfg.key, 'base64url') })
  });
  if (!res.ok) throw new Error('google-auth ' + res.status);
  return (await res.json()).access_token;
}

export async function sheets(token, cfg, path, options = {}) {
  const res = await timed(SHEETS + encodeURIComponent(cfg.sheetId) + path, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) }
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

export async function ensureTab(token, cfg, title, header) {
  const meta = await sheets(token, cfg, '?fields=sheets.properties.title');
  if (!meta.ok) throw new Error('sheets-meta ' + meta.status);
  if ((meta.body.sheets || []).some(s => s.properties.title === title)) return false;
  const add = await sheets(token, cfg, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
  if (!add.ok) throw new Error('sheets-add ' + add.status);
  if (header) {
    await sheets(token, cfg, '/values/' + encodeURIComponent(title + '!A1') + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: [header] }) });
  }
  return true;
}

export function sameSecret(a, b) {
  const x = createHash('sha256').update(String(a), 'utf8').digest();
  const y = createHash('sha256').update(String(b), 'utf8').digest();
  return timingSafeEqual(x, y);
}

export function limiter(limit, windowMs) {
  const buckets = new Map();
  return request => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    const key = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const b = buckets.get(key);
    if (!b) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return false; }
    b.count += 1;
    return b.count > limit;
  };
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function requestFromNode(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach(i => headers.append(k, i)); else headers.set(k, String(v));
  }
  const method = (req.method || 'GET').toUpperCase();
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    body = typeof req.body === 'string' ? req.body : req.body && typeof req.body === 'object' ? JSON.stringify(req.body) : undefined;
  }
  return new Request(new URL(req.url || '/', proto + '://' + host), { method, headers, body });
}

export function nodeAdapter(fetchHandler) {
  return async function handler(req, res) {
    if (!(res && typeof res.end === 'function')) return fetchHandler(req);
    if (req.body === undefined) {
      const chunks = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      if (chunks.length) req.body = Buffer.concat(chunks).toString('utf8');
    }
    const response = await fetchHandler(requestFromNode(req));
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(await response.text());
  };
}
