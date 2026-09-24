import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_TIMEOUT_MS = 4000;
const REQUEST_TIMEOUT_MS = 9000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const rateBuckets = new Map();

const ALLOWED = {
  role: new Set(['Homeowner','Contractor','Architect/designer','Developer','Realtor','City/planning professional','Other']),
  project: new Set(['Planning a home project','Checking what approvals might apply','Understanding a Newton requirement','Testing/reviewing HPP','Other']),
  usefulness: new Set(['Very useful','Somewhat useful','Not very useful','Not useful']),
  newInformation: new Set(['Yes','Somewhat','No'])
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createServiceAccountAssertion(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + '.' + claim;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return unsigned + '.' + signer.sign(privateKey, 'base64url');
}

function normalizePrivateKey(value) {
  if (typeof value !== 'string') return '';
  let key = value.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  return key.replace(/\\n/g, '\n');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = GOOGLE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validEmail(value) {
  return !value || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function requestOriginAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function clientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || 'unknown';
}

function rateLimited(request) {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  const key = clientKey(request);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

async function getAccessToken(email, privateKey) {
  const assertion = createServiceAccountAssertion(email, privateKey);
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) throw new Error('Google authentication failed.');
  const data = await response.json();
  if (!data.access_token) throw new Error('Google authentication returned no access token.');
  return data.access_token;
}

export async function checkSheetsMetadata(token, spreadsheetId, fetcher = fetchWithTimeout) {
  const metadataUrl =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(spreadsheetId) +
    '?fields=spreadsheetId';
  const response = await fetcher(metadataUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token
    }
  });
  if (!response.ok) throw new Error('Google Sheets metadata request failed.');
  return response;
}

async function sheetsAppend(token, spreadsheetId, row) {
  const range = 'Sheet1!A:G';
  const appendUrl =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(spreadsheetId) +
    '/values/' +
    encodeURIComponent(range) +
    ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false';

  const response = await fetchWithTimeout(appendUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: [row]
    })
  });

  if (!response.ok) throw new Error('Google Sheets append failed.');
}

export function validateFeedbackPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request.' };
  }

  const expectedFields = new Set([
    'role', 'project', 'usefulness', 'newInformation', 'feedback', 'contactEmail', 'website'
  ]);
  if (Object.keys(body).some(key => !expectedFields.has(key))) {
    return { ok: false, error: 'Invalid request.' };
  }

  const role = cleanString(body.role, 100);
  const project = cleanString(body.project, 150);
  const usefulness = cleanString(body.usefulness, 50);
  const newInformation = cleanString(body.newInformation, 50);
  const feedback = cleanString(body.feedback, 3000);
  const contactEmail = cleanString(body.contactEmail, 254);
  const website = cleanString(body.website, 200);

  if (website) return { ok: false, error: 'Invalid request.' };

  if (
    !ALLOWED.role.has(role) ||
    !ALLOWED.project.has(project) ||
    !ALLOWED.usefulness.has(usefulness) ||
    !ALLOWED.newInformation.has(newInformation) ||
    !feedback ||
    !validEmail(contactEmail)
  ) {
    return { ok: false, error: 'Please provide valid feedback form values.' };
  }

  return {
    ok: true,
    value: { role, project, usefulness, newInformation, feedback, contactEmail }
  };
}

export default async function handler(request) {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const spreadsheetId = cleanString(process.env.GOOGLE_SHEETS_SPREADSHEET_ID, 200);

  if (request.method === 'GET') {
    if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
      return json({ ok: false, configured: false, stage: 'configuration' }, 503);
    }

    try {
      const token = await Promise.race([
        getAccessToken(serviceAccountEmail, privateKey),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('health check timeout')), REQUEST_TIMEOUT_MS)
        )
      ]);
      await checkSheetsMetadata(token, spreadsheetId);
      return json({ ok: true, configured: true, stage: 'ready' });
    } catch (error) {
      console.error('Feedback health check failed:', error?.message || 'Unknown error');
      const stage = error?.message === 'Google authentication failed.'
        ? 'google-auth'
        : 'sheets-access';
      return json({ ok: false, configured: true, stage }, 502);
    }
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!requestOriginAllowed(request)) return json({ error: 'Invalid request origin.' }, 403);
  if (rateLimited(request)) return json({ error: 'Too many submissions. Please try again later.' }, 429);

  if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
    return json({ error: 'Feedback service is not configured.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const validation = validateFeedbackPayload(body);
  if (!validation.ok) return json({ error: validation.error }, 400);

  const { role, project, usefulness, newInformation, feedback, contactEmail } = validation.value;
  const row = [
    new Date().toISOString(),
    role,
    project,
    usefulness,
    newInformation,
    feedback,
    contactEmail
  ];

  let stage = 'google-auth';

  try {
    await Promise.race([
      (async () => {
        const token = await getAccessToken(serviceAccountEmail, privateKey);
        stage = 'sheets-append';
        await sheetsAppend(token, spreadsheetId, row);
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('request timeout'), { name: 'RequestTimeout' })), REQUEST_TIMEOUT_MS)
      )
    ]);

    return json({ ok: true });
  } catch (error) {
    console.error('Feedback submission failed at ' + stage + ':', error?.name || error?.message || 'Unknown error');
    return json({ error: 'Feedback could not be submitted right now.' }, 502);
  }
}
