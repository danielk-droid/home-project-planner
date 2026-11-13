// Anonymous usage counter. Visits store only a broad source category, referring
// domain and landing-page path. Full referring URLs and query strings are rejected.
import { json, googleConfig, accessToken, sheets, ensureTab, limiter, sameOrigin, nodeAdapter } from './_google.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const EVENTS = new Set(['visit', 'project_started', 'plan_generated', 'project_resumed']);
export const SOURCES = new Set(['direct', 'search', 'social', 'ai', 'referral', 'internal']);
const HEADER = ['timestamp', 'event', 'project_type', 'returning_visitor', 'source', 'referrer_domain', 'landing_page'];
const limited = limiter(60, 10 * 60 * 1000);
let tabReady = false;

export function validateTrackPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).some(k => !['event', 'projectType', 'returning', 'source', 'referrer', 'landingPage'].includes(k))) return null;
  if (!EVENTS.has(body.event)) return null;
  const projectType = body.projectType == null ? '' : String(body.projectType);
  if (projectType && !/^[a-z0-9_-]{1,40}$/.test(projectType)) return null;
  if (body.returning !== undefined && typeof body.returning !== 'boolean') return null;
  const source = body.source == null ? '' : String(body.source);
  const referrer = body.referrer == null ? '' : String(body.referrer);
  const landingPage = body.landingPage == null ? '' : String(body.landingPage);
  if (source && !SOURCES.has(source)) return null;
  if (referrer && (!/^(?=.{1,100}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(referrer) || referrer.includes('..'))) return null;
  if (landingPage && !/^\/[a-zA-Z0-9/_\-.~%]{0,159}$/.test(landingPage)) return null;
  if (body.event !== 'visit' && (source || referrer || landingPage)) return null;
  return { event: body.event, projectType, returning: body.returning === true, source, referrer, landingPage };
}

export async function fetchHandler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin.' }, 403);
  if (limited(request)) return json({ error: 'Too many requests.' }, 429);
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'Invalid request.' }, 400); }
  const ev = validateTrackPayload(body);
  if (!ev) return json({ error: 'Invalid request.' }, 400);
  const cfg = googleConfig();
  if (!cfg.email || !cfg.key || !cfg.sheetId) return json({ error: 'Not configured.' }, 503);
  try {
    const token = await accessToken(cfg, SCOPE);
    if (!tabReady) {
      await ensureTab(token, cfg, 'Events', HEADER);
      const header = await sheets(token, cfg, '/values/' + encodeURIComponent('Events!A1:G1') + '?valueInputOption=RAW', {
        method: 'PUT', body: JSON.stringify({ values: [HEADER] })
      });
      if (!header.ok) throw new Error('header ' + header.status);
      tabReady = true;
    }
    const r = await sheets(token, cfg, '/values/' + encodeURIComponent('Events!A:G') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
      method: 'POST', body: JSON.stringify({ values: [[new Date().toISOString(), ev.event, ev.projectType, ev.returning ? 'yes' : 'no', ev.source, ev.referrer, ev.landingPage]] })
    });
    if (!r.ok) throw new Error('append ' + r.status);
    return json({ ok: true });
  } catch (e) {
    console.error('track failed:', e?.message);
    return json({ error: 'Could not record.' }, 502);
  }
}

export default nodeAdapter(fetchHandler);
