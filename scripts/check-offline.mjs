// Privacy/offline guard for the production build (run after `vite build`).
// 1. The built index.html must carry the CSP that blocks other origins.
// 2. No external URL may appear in the bundle, except a known list of
//    harmless strings (XML namespaces, links inside library error messages).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ALLOWED_HOSTS = new Set([
  'www.w3.org', // SVG/XML namespace identifiers, never fetched
  'bit.ly', // URL inside Dexie / Workbox error message text
  'tinyurl.com', // URL inside Dexie error message text
]);

const files = [];
const walk = (d) =>
  readdirSync(d).forEach((f) => {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  });
walk(DIST);

let failed = false;
for (const f of files.filter((f) => /\.(js|html|css|webmanifest|svg|json)$/.test(f))) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    if (!ALLOWED_HOSTS.has(m[1].toLowerCase())) {
      console.error(`External URL in ${f}: ${m[0]}`);
      failed = true;
    }
  }
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
if (!/Content-Security-Policy[^>]*connect-src 'self'/.test(html)) {
  console.error('CSP meta tag missing from dist/index.html');
  failed = true;
}

if (failed) process.exit(1);
console.log(`check-offline: OK (${files.length} files)`);
