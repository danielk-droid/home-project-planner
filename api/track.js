// Anonymous usage counter. Stores only: time, event name, project type, and
// whether this browser has visited before. No address, IP, or personal data.
import { json, googleConfig, accessToken, sheets, ensureTab, limiter, sameOrigin, nodeAdapter } from './_google.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const EVENTS = new Set(['visit', 'project_started', 'plan_generated', 'project_resumed']);
const HEADER = ['timestamp', 'event', 'project_type', 'returning_visitor'];
const limited = limiter(60, 10 * 60 * 1000);
let tabReady = false;

export function validateTrackPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).some(k => !['event', 'projectType', 'returning'].includes(k))) return null;
  if (!EVENTS.has(body.event)) return null;
  const projectType = body.projectType == null ? '' : String(body.projectType);
  if (projectType && !/^[a-z0-9_-]{1,40}$/.test(projectType)) return null;
  if (body.returning !== undefined && typeof body.returning !== 'boolean') return null;
  return { event: body.event, projectType, returning: body.returning === true };
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
    if (!tabReady) { await ensureTab(token, cfg, 'Events', HEADER); tabReady = true; }
    const r = await sheets(token, cfg, '/values/' + encodeURIComponent('Events!A:D') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
      method: 'POST', body: JSON.stringify({ values: [[new Date().toISOString(), ev.event, ev.projectType, ev.returning ? 'yes' : 'no']] })
    });
    if (!r.ok) throw new Error('append ' + r.status);
    return json({ ok: true });
  } catch (e) {
    console.error('track failed:', e?.message);
    return json({ error: 'Could not record.' }, 502);
  }
}

export default nodeAdapter(fetchHandler);
