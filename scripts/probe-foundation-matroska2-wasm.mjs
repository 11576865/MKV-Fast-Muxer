/**
 * Evidence-only experiment: execute the Matroska Foundation's actual
 * libEBML2/libMatroska2-linked mkvtree C program as Emscripten WebAssembly.
 * No upstream code/binary ships with Softmux. No production writer is changed.
 *
 * Required: FOUNDATION_WASM_JS=<...>/mkvtree.js
 *           FOUNDATION_FIXTURE=<independently authored Matroska>
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const hash = value => createHash('sha256').update(value).digest('hex');
const wasmJs = path.resolve(process.env.FOUNDATION_WASM_JS || '');
const fixture = path.resolve(process.env.FOUNDATION_FIXTURE ||
  '.e2e/fixtures/p0-independent-mkvtoolnix.mkv');
const output = path.resolve(process.env.FOUNDATION_PROBE_REPORT ||
  '.e2e/output/foundation-matroska2-wasm-probe.json');
const commit = 'd69761114b79c1dfcb2226ceca84452835e745c3';
const report = {
  schema: 'matroska-foundation-libmatroska2-wasm-real-file-probe-v1',
  result: 'NOT_RUN',
  upstream: 'Matroska-Org/foundation-source',
  upstreamCommit: commit,
  upstreamLicense: 'BSD-3-Clause (upstream LICENSE)',
  modules: ['Core-C', 'libEBML2', 'libMatroska2', 'mkvtree'],
  productRuntimeIntegrated: false,
  productWriterChanged: false,
  browserExecuted: false, // This script is the Node Wasm phase only.
  partialReaderCapability: false,
};
await fs.mkdir(path.dirname(output), { recursive: true });
const capturedStdout = [], capturedStderr = [];

try {
  assert.notEqual(process.env.FOUNDATION_WASM_JS, undefined,
    'FOUNDATION_WASM_JS_NOT_SET');
  const fixtureBytes = await fs.readFile(fixture);
  assert.ok(fixtureBytes.length > 0, 'EMPTY_INDEPENDENT_MKV');
  const sourceSha = hash(fixtureBytes);
  const wasm = path.join(path.dirname(wasmJs), 'mkvtree.wasm');
  const wasmBytes = await fs.readFile(wasm);
  assert.ok(wasmBytes.length > 8, 'NO_WASM_MODULE');
  report.wasmSha256 = hash(wasmBytes);
  report.sourceSha256 = sourceSha;
  report.sourceBytes = fixtureBytes.length;

  // Emscripten MODULARIZE output is CommonJS; the product's package.json
  // has type:module. Keep a local .cjs copy for this test only.
  const cjs = path.join(path.dirname(wasmJs), 'mkvtree-probe.cjs');
  await fs.copyFile(wasmJs, cjs);
  const require = createRequire(import.meta.url);
  const createModule = require(cjs);
  assert.equal(typeof createModule, 'function', 'NO_EMSCRIPTEN_FACTORY');

  const stdout = capturedStdout, stderr = capturedStderr;
  const Module = await createModule({
    locateFile: name => path.join(path.dirname(wasmJs), name),
    print: line => stdout.push(String(line)),
    printErr: line => stderr.push(String(line)),
    noInitialRun: true,
  });
  assert.ok(Module.FS && typeof Module.FS.writeFile === 'function',
    'WASM_FILESYSTEM_NOT_EXPORTED');
  assert.equal(typeof Module.callMain, 'function',
    'WASM_CALLMAIN_NOT_EXPORTED');

  Module.FS.writeFile('/upstream-independent.mkv',
    new Uint8Array(fixtureBytes));
  Module.callMain(['/upstream-independent.mkv']);

  const observed = stdout.join('\n');
  const required = {
    ebml: /ebml/i,
    segment: /segment/i,
    tracks: /tracks?/i,
    attachments: /attachments?/i,
    chapters: /chapters?/i,
    tags: /tags?/i,
  };
  report.observed = Object.fromEntries(Object.entries(required)
    .map(([key, regex]) => [key, regex.test(observed)]));
  if (Object.values(report.observed).some(value => !value)) {
    throw Error('UPSTREAM_WASM_INCOMPLETE_OBJECT_TREE: ' +
      JSON.stringify(report.observed));
  }
  report.stdoutSha256 = hash(Buffer.from(observed));
  report.stdoutPreview = observed.slice(0, 2200);
  report.stderrPreview = stderr.join('\n').slice(0, 900);
  report.sourceUnmodified = hash(await fs.readFile(fixture)) === sourceSha;
  assert.equal(report.sourceUnmodified, true,
    'ORIGINAL_FIXTURE_CHANGED');
  report.partialReaderCapability = true;
  report.result = 'UPSTREAM_C_MATROSKA_WASM_REAL_FILE_READ_PASS';
} catch (error) {
  report.result = 'FAILED';
  report.error = error?.stack || String(error);
} finally {
  // A runtime trap must retain whatever the real upstream reader printed
  // before failure; otherwise compiler-success/runtime-failure gets mistaken
  // for an unsupported file rather than a broken port.
  report.stdoutPreview ??= capturedStdout.join('\n').slice(0, 2400);
  report.stderrPreview ??= capturedStderr.join('\n').slice(0, 1400);
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    result: report.result, observed: report.observed || null,
    report: output, error: report.error || null,
  }));
}
if (report.result !== 'UPSTREAM_C_MATROSKA_WASM_REAL_FILE_READ_PASS')
  process.exitCode = 1;
