import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const script = path.join(root, 'scripts', 'monitor-sources.mjs');
assert.ok(fs.existsSync(script), 'monitor script missing');
assert.match(fs.readFileSync(script, 'utf8'), /changed_requires_review/, 'changes must require review');
assert.match(fs.readFileSync(script, 'utf8'), /reviewRequired:changed\|\|!result\.ok/, 'unreachable/changed sources must require review');
assert.match(fs.readFileSync(script, 'utf8'), /substantiveRulesNotModifiedByMonitor:true/, 'monitor must not directly modify substantive rules');
assert.match(fs.readFileSync(script, 'utf8'), /impactedRuleIds/, 'source-to-rule impact mapping missing');

function runMonitor(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--write-state'], {cwd: root, env: {...process.env, ...env}});
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('error', reject);
    child.on('close', code => resolve({code, stdout, stderr}));
  });
}

const temp = fs.mkdtempSync(path.join(root, '.tmp-monitor-test-'));
const server = http.createServer((req, res) => { res.writeHead(200, {'content-type':'text/plain'}); res.end(server.body); });
server.body = 'official baseline\n';

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const {port} = server.address();
  const sourcesPath = path.join(temp, 'sources.json');
  const statePath = path.join(temp, 'state.json');
  const outDir = path.join(temp, 'out');
  fs.writeFileSync(sourcesPath, JSON.stringify([{id:'test-source',title:'Test source',publisher:'Test official publisher',
    url:`http://127.0.0.1:${port}/source`,authority:'primary',sourceType:'primary'}]));
  fs.writeFileSync(statePath, JSON.stringify({version:1,sources:{}}));

  let result = await runMonitor({MONITOR_SOURCES_PATH:sourcesPath,MONITOR_STATE_PATH:statePath,MONITOR_OUT:outDir});
  assert.equal(result.code, 0);
  let report = JSON.parse(fs.readFileSync(path.join(outDir,'monitor-results.json'),'utf8'));
  assert.equal(report.firstSeen, 1);
  assert.equal(report.changed, 0);
  assert.equal(report.results[0].reviewRequired, false);

  server.body = 'official changed content\n';
  result = await runMonitor({MONITOR_SOURCES_PATH:sourcesPath,MONITOR_STATE_PATH:statePath,MONITOR_OUT:outDir});
  assert.equal(result.code, 0);
  report = JSON.parse(fs.readFileSync(path.join(outDir,'monitor-results.json'),'utf8'));
  assert.equal(report.changed, 1);
  assert.equal(report.results[0].changeStatus, 'changed_requires_review');
  assert.equal(report.results[0].reviewRequired, true);
  assert.deepEqual(report.results[0].impactedRuleIds, []);
} finally {
  if (server.listening) server.close();
  fs.rmSync(temp, {recursive:true,force:true});
}
console.log('source monitor tests: PASS');
