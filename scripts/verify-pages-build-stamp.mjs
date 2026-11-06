// Runs after the normal Vite production build, on both PR and main.
// Prevent a fake green deployment where the live-page SHA meta was not
// actually substituted in the bytes uploaded to GitHub Pages.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const sha=process.env.GITHUB_SHA||'';
assert.match(sha,/^[0-9a-f]{40}$/,'CI must provide exact GITHUB_SHA');
const file=path.resolve('dist/index.html');
const html=await fs.readFile(file,'utf8');
const m=html.match(/<meta\s+name="softmux-deployment-sha"\s+content="([^"]+)"\s*\/>/);
assert.ok(m,'the built HTML must contain an exact source-provenance meta');
assert.equal(m[1],sha,'Vite must substitute the exact current workflow commit SHA');
assert.ok(!html.includes('%VITE_GIT_SHA%'),'unresolved env placeholder is not deployable');
console.log('Pages HTML exact-Git-SHA attestation: PASS '+sha);
