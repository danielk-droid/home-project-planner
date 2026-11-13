import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const script = readFileSync(join(root, 'insights-access.js'), 'utf8');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));

// The dashboard shortcut must be loaded from a file: the site's Content-Security-Policy
// (script-src 'self') blocks inline scripts, so an inline copy of this code never runs.
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter((m) => !m[1].includes('ld+json'))
  .filter((m) => m[2].trim().length > 0);
assert.equal(inlineScripts.length, 0, 'homepage must not carry an executable inline script');
assert.ok(
  /<script src="\/insights-access\.js"/.test(html),
  'homepage must load the dashboard shortcut from /insights-access.js'
);

// The protection that caused the failure must stay switched on.
const csp = vercel.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy').value;
assert.match(csp, /script-src 'self'/, 'CSP must keep script-src to same-origin files');
assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, 'CSP must not allow inline scripts');

// Both private entry points must be wired: footer double-click and Shift+Alt+I.
assert.match(script, /var DASHBOARD = ["']\/insights\/["']/, 'shortcut must point at /insights/');
assert.match(script, /location\.href = DASHBOARD/, 'shortcut must navigate to the dashboard');
assert.match(script, /getElementById\(["']footerBrand["']\)/, 'shortcut must bind the footer brand');
assert.match(script, /["']dblclick["']/, 'shortcut must listen for footer double-click');
assert.match(script, /shiftKey/, 'shortcut must require Shift');
assert.match(script, /altKey/, 'shortcut must require Alt/Option');
assert.match(script, /KeyI/, 'shortcut must require the I key');
assert.match(script, /isContentEditable/, 'shortcut must stay silent while the user is typing');

// The shortcut must not be discoverable from any visible link or nav item.
assert.equal(
  [...html.matchAll(/<a[^>]+href=["']\/insights\/["']/g)].length,
  0,
  'the dashboard must not be linked from the homepage'
);

console.log('insights-access shortcut tests: PASS');
