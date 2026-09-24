import assert from 'node:assert/strict';
import {validateFeedbackPayload} from '../api/feedback.js';

const valid = {
  role: 'Homeowner',
  project: 'Planning a home project',
  usefulness: 'Very useful',
  newInformation: 'Yes',
  feedback: 'The project path was clear.',
  contactEmail: ''
};

assert.equal(validateFeedbackPayload(valid).ok, true);

for (const field of ['role','project','usefulness','newInformation','feedback']) {
  const copy = {...valid};
  delete copy[field];
  assert.equal(validateFeedbackPayload(copy).ok, false, field);
}

assert.equal(
  validateFeedbackPayload({...valid, contactEmail:'not-an-email'}).ok,
  false
);

assert.equal(
  validateFeedbackPayload(null).ok,
  false
);

assert.equal(
  validateFeedbackPayload({...valid, website:'bot'}).ok,
  false
);

assert.equal(
  validateFeedbackPayload({...valid, extra:'should not be forwarded'}).ok,
  false
);

const normalized = validateFeedbackPayload({...valid, feedback:'  specific feedback  '});
assert.equal(normalized.value.feedback, 'specific feedback');

console.log('feedback validation tests: PASS');

// --- endpoint behaviour (Google Sheets pipeline mocked) ----------------------
const {fetchHandler, default: handler} = await import('../api/feedback.js');

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'hpp-feedback@example.iam.gserviceaccount.com';
process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'test-spreadsheet-id';
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = (await import('node:crypto'))
  .generateKeyPairSync('rsa', {modulusLength: 2048})
  .privateKey.export({type: 'pkcs8', format: 'pem'});

const realFetch = globalThis.fetch;
const RATE_LIMIT_PROBE = 7;
let calls = [];
function mockGoogle({tokenOk = true, appendOk = true} = {}) {
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url: String(url), options});
    if (String(url).includes('oauth2.googleapis.com')) {
      return tokenOk
        ? new Response(JSON.stringify({access_token: 'test-token'}), {status: 200})
        : new Response('invalid_grant', {status: 400});
    }
    return appendOk
      ? new Response(JSON.stringify({updates: {updatedRows: 1}}), {status: 200})
      : new Response('Unable to parse range: Sheet1!A:G', {status: 400});
  };
}

let ipCounter = 0;
function post(body, headers = {}) {
  // Each test uses a distinct client IP so the rate limiter does not interfere.
  ipCounter += 1;
  return new Request('https://hpp.example.com/api/feedback', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.' + ipCounter, ...headers},
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

// valid submission reaches the Sheets append and reports success
mockGoogle();
let res = await fetchHandler(post(valid));
assert.equal(res.status, 200);
assert.deepEqual(await res.json(), {ok: true});
assert.ok(calls.some(c => c.url.includes('oauth2.googleapis.com')), 'requests a Google token');
const append = calls.find(c => c.url.includes('sheets.googleapis.com'));
assert.ok(append, 'appends a row to the spreadsheet');
assert.ok(append.url.includes('test-spreadsheet-id'));
assert.equal(append.options.method, 'POST');
const appended = JSON.parse(append.options.body).values[0];
assert.equal(appended[1], 'Homeowner');
assert.equal(appended[5], 'The project path was clear.');

// invalid payload is rejected before Google is contacted
mockGoogle();
res = await fetchHandler(post({...valid, usefulness: 'Amazing'}));
assert.equal(res.status, 400);
assert.equal(calls.length, 0, 'invalid payloads never reach Google');

// unexpected fields are rejected
mockGoogle();
res = await fetchHandler(post({...valid, isAdmin: true}));
assert.equal(res.status, 400);
assert.equal(calls.length, 0);

// honeypot submissions are rejected
mockGoogle();
res = await fetchHandler(post({...valid, website: 'spam'}));
assert.equal(res.status, 400);

// malformed JSON is rejected
mockGoogle();
res = await fetchHandler(post('{not json'));
assert.equal(res.status, 400);

// wrong method
res = await fetchHandler(new Request('https://hpp.example.com/api/feedback', {method: 'PUT'}));
assert.equal(res.status, 405);

// a Google Sheets failure must fail, never report success
mockGoogle({appendOk: false});
res = await fetchHandler(post(valid));
assert.equal(res.status, 502);
assert.equal((await res.json()).ok, undefined);

// a Google auth failure must fail too
mockGoogle({tokenOk: false});
res = await fetchHandler(post(valid));
assert.equal(res.status, 502);

// cross-origin submissions are rejected
mockGoogle();
res = await fetchHandler(post(valid, {Origin: 'https://evil.example.com'}));
assert.equal(res.status, 403);

// missing configuration is reported as unconfigured, not as a success
mockGoogle();
const savedId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
res = await fetchHandler(post(valid));
assert.equal(res.status, 503);
process.env.GOOGLE_SHEETS_SPREADSHEET_ID = savedId;

// the default export must also work with the Node (req, res) signature used by
// the deployment runtime, otherwise every submission fails in production.
mockGoogle();
const nodeReq = {
  method: 'POST',
  url: '/api/feedback',
  headers: {host: 'hpp.example.com', 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7'},
  body: JSON.stringify(valid)
};
const nodeRes = {
  statusCode: 0,
  headers: {},
  body: '',
  setHeader(k, v) { this.headers[k] = v; },
  end(payload) { this.body = payload ?? ''; }
};
await handler(nodeReq, nodeRes);
assert.equal(nodeRes.statusCode, 200);
assert.deepEqual(JSON.parse(nodeRes.body), {ok: true});

// repeated submissions from one client are rate limited
mockGoogle();
const floodHeaders = {'x-forwarded-for': '203.0.113.250'};
let lastStatus = 0;
for (let i = 0; i < RATE_LIMIT_PROBE; i += 1) {
  const req = new Request('https://hpp.example.com/api/feedback', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...floodHeaders},
    body: JSON.stringify(valid)
  });
  lastStatus = (await fetchHandler(req)).status;
}
assert.equal(lastStatus, 429, 'rate limiting still protects the endpoint');

globalThis.fetch = realFetch;

console.log('feedback endpoint tests: PASS');
