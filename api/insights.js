// Owner-only growth dashboard data. The passcode lives in the private Google
// Sheet (tab "Config", cell B1), so it never appears in code or the browser bundle.
import { json, googleConfig, accessToken, sheets, ensureTab, sameSecret, limiter, sameOrigin, nodeAdapter } from './_google.js';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const SITE = 'https://home-project-planner-mvp.vercel.app/';
const limited = limiter(10, 10 * 60 * 1000);

const day = iso => String(iso || '').slice(0, 10);

export function summarize(feedbackRows, eventRows, now = new Date()) {
  const feedback = feedbackRows.filter(r => /^\d{4}-\d{2}-\d{2}T/.test(r[0] || ''));
  const events = eventRows.filter(r => /^\d{4}-\d{2}-\d{2}T/.test(r[0] || ''));
  const since = days => new Date(now.getTime() - days * 864e5).toISOString();
  const count = (rows, ev, from) => rows.filter(r => r[1] === ev && (!from || r[0] >= from)).length;
  const tally = (rows, i) => rows.reduce((m, r) => { const k = r[i] || 'unspecified'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const visits = events.filter(r => r[1] === 'visit');
  const newVisitors = visits.filter(r => r[3] !== 'yes').length;
  const started = count(events, 'project_started');
  const generated = count(events, 'plan_generated');
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = day(new Date(now.getTime() - i * 864e5).toISOString());
    daily.push({
      date: d,
      visits: visits.filter(r => day(r[0]) === d).length,
      projects: events.filter(r => r[1] === 'project_started' && day(r[0]) === d).length
    });
  }
  const useful = feedback.filter(r => r[3] === 'Very useful' || r[3] === 'Somewhat useful').length;
  return {
    totals: {
      visits: visits.length,
      newVisitors,
      returningVisitors: visits.length - newVisitors,
      projectsStarted: started,
      plansGenerated: generated,
      projectsResumed: count(events, 'project_resumed'),
      feedback: feedback.length
    },
    last7: {
      visits: count(events, 'visit', since(7)),
      newVisitors: visits.filter(r => r[0] >= since(7) && r[3] !== 'yes').length,
      projectsStarted: count(events, 'project_started', since(7)),
      plansGenerated: count(events, 'plan_generated', since(7)),
      feedback: feedback.filter(r => r[0] >= since(7)).length
    },
    rates: {
      completion: started ? Math.round(generated / started * 100) : null,
      returning: visits.length ? Math.round((visits.length - newVisitors) / visits.length * 100) : null,
      useful: feedback.length ? Math.round(useful / feedback.length * 100) : null
    },
    projectTypes: tally(events.filter(r => r[1] === 'project_started'), 2),
    roles: tally(feedback, 1),
    usefulness: tally(feedback, 3),
    recentFeedback: feedback.slice(-5).reverse().map(r => ({ date: day(r[0]), role: r[1] || '', usefulness: r[3] || '', text: String(r[5] || '').slice(0, 600) })),
    daily,
    trackingSince: events[0] ? day(events[0][0]) : null
  };
}

async function searchData(cfg) {
  try {
    const token = await accessToken(cfg, GSC_SCOPE);
    const end = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const q = async dims => {
      const r = await fetch('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(SITE) + '/searchAnalytics/query', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: dims, rowLimit: 8 })
      });
      if (!r.ok) throw new Error('gsc ' + r.status);
      return (await r.json()).rows || [];
    };
    const [total, queries, pages] = await Promise.all([q([]), q(['query']), q(['page'])]);
    const t = total[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    return {
      ok: true, start, end,
      clicks: t.clicks, impressions: t.impressions, ctr: Math.round(t.ctr * 1000) / 10, position: Math.round(t.position * 10) / 10,
      queries: queries.map(r => ({ q: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
      pages: pages.map(r => ({ page: r.keys[0].replace(SITE, '/'), clicks: r.clicks, impressions: r.impressions }))
    };
  } catch (e) {
    return { ok: false, serviceAccount: cfg.email };
  }
}

export async function fetchHandler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin.' }, 403);
  if (limited(request)) return json({ error: 'Too many attempts. Try again in 10 minutes.' }, 429);
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'Invalid request.' }, 400); }
  const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
  const cfg = googleConfig();
  if (!cfg.email || !cfg.key || !cfg.sheetId) return json({ error: 'Not configured.' }, 503);
  try {
    const token = await accessToken(cfg, SHEETS_SCOPE);
    await ensureTab(token, cfg, 'Config', ['insights_passcode', '']);
    const conf = await sheets(token, cfg, '/values/' + encodeURIComponent('Config!B1'));
    const expected = String(conf.body?.values?.[0]?.[0] || '');
    if (expected.length < 8) return json({ error: 'setup', message: 'Open your feedback Google Sheet, go to the "Config" tab, and type a passcode (8+ characters) in cell B1.' }, 403);
    if (!passcode || !sameSecret(passcode, expected)) return json({ error: 'Incorrect passcode.' }, 401);
    await ensureTab(token, cfg, 'Events', ['timestamp', 'event', 'project_type', 'returning_visitor']);
    const meta = await sheets(token, cfg, '?fields=sheets.properties.title');
    const titles = (meta.body?.sheets || []).map(t => t.properties.title);
    const fbTab = titles.find(t => /^feedback$/i.test(t)) || (titles.includes('Sheet1') ? 'Sheet1' : (titles.find(t => !/^(config|events|events_config)$/i.test(t)) || 'Sheet1'));
    const data = await sheets(token, cfg, '/values:batchGet?ranges=' + encodeURIComponent("'" + fbTab + "'!A:G") + '&ranges=' + encodeURIComponent('Events!A:D'));
    if (!data.ok) throw new Error('read ' + data.status);
    const [fb, ev] = data.body.valueRanges.map(v => v.values || []);
    return json({ ok: true, generatedAt: new Date().toISOString(), ...summarize(fb, ev), search: await searchData(cfg) });
  } catch (e) {
    console.error('insights failed:', e?.message);
    return json({ error: 'Could not load insights right now.' }, 502);
  }
}

export default nodeAdapter(fetchHandler);
