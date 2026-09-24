import assert from 'node:assert/strict';
import {checkSheetsMetadata} from '../api/feedback.js';

const ok = await checkSheetsMetadata('token','sheet', async () => ({ok:true,status:200}));
assert.equal(ok.ok,true);

await assert.rejects(
  checkSheetsMetadata('token','sheet', async () => ({ok:false,status:403})),
  /metadata request failed/
);

await assert.rejects(
  checkSheetsMetadata('token','sheet', async () => ({ok:false,status:404})),
  /metadata request failed/
);

console.log('feedback health tests: PASS');
