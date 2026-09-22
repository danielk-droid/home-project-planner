import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const ALLOWED = {
  role: new Set([
    'Homeowner',
    'Contractor',
    'Architect/designer',
    'Developer',
    'Realtor',
    'City/planning professional',
    'Other'
  ]),
  project: new Set([
    'Planning a home project',
    'Checking what approvals might apply',
    'Understanding a Newton requirement',
    'Testing/reviewing HPP',
    'Other'
  ]),
  usefulness: new Set([
    'Very useful',
    'Somewhat useful',
    'Not very useful',
    'Not useful'
  ]),
  newInformation: new Set(['Yes', 'Somewhat', 'No'])
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
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
  }, 7000);

  if (!response.ok) {
    throw new Error('Google authentication failed.');
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Google authentication returned no access token.');
  }

  return data.access_token;
}

async function sheetsRequest(url, token, options = {}) {
  const { signal: ignoredSignal, ...fetchOptions } = options;
  const response = await fetchWithTimeout(url, {
    ...fetchOptions,
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error('Google Sheets request failed.');
  }

  return response;
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validEmail(value) {
  if (!value) return true;
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
    return json({ error: 'Feedback service is not configured.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const role = cleanString(body?.role, 100);
  const project = cleanString(body?.project, 150);
  const usefulness = cleanString(body?.usefulness, 50);
  const newInformation = cleanString(body?.newInformation, 50);
  const feedback = cleanString(body?.feedback, 3000);
  const contactEmail = cleanString(body?.contactEmail, 254);

  if (
    !ALLOWED.role.has(role) ||
    !ALLOWED.project.has(project) ||
    !ALLOWED.usefulness.has(usefulness) ||
    !ALLOWED.newInformation.has(newInformation) ||
    !feedback ||
    !validEmail(contactEmail)
  ) {
    return json({ error: 'Please provide valid feedback form values.' }, 400);
  }

  try {
    const token = await getAccessToken(serviceAccountEmail, privateKey);

    // Sheet1 is the confirmed feedback destination. Avoid an extra metadata round trip.
    const range = 'Sheet1!A:G';
    const appendUrl =
      'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodeURIComponent(spreadsheetId) +
      '/values/' +
      encodeURIComponent(range) +
      ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false';

    await sheetsRequest(appendUrl, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [[
          new Date().toISOString(),
          role,
          project,
          usefulness,
          newInformation,
          feedback,
          contactEmail
        ]]
      })
    });

    return json({ ok: true });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Google service request timed out.'
      : (error?.message || 'Unknown error');
    console.error('Feedback submission failed:', message);
    return json({ error: 'Feedback could not be submitted.' }, 502);
  }
}
