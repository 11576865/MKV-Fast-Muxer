/**
 * TEST-ONLY portability experiment for Matroska Foundation's pinned Core-C.
 * The upstream platform guard does not recognize __EMSCRIPTEN__.
 * This branch's browser probe deliberately uses Emscripten's POSIX emulation
 * as a *hypothesis*, not a claim that upstream supports this target.
 *
 * Applies ONE exact additive platform guard to an ephemeral CI checkout.
 * Never modifies production Softmux, re-licenses code, or publishes a fork.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const vendorRoot = path.resolve(process.argv[2] || '.e2e/foundation-upstream');
const header = path.join(vendorRoot, 'corec/corec/portab.h');
const before = await fs.readFile(header, 'utf8');
const anchor = '#elif defined(__linux__) || defined(__CYGWIN__) || defined(__FreeBSD__) || defined(__NetBSD__) || defined(__OpenBSD__)';
const patch = [
  '#elif defined(__EMSCRIPTEN__)',
  '/* Experiment only: use the Core-C Linux/POSIX layer against WASM libc. */',
  '#define TARGET_LINUX',
  '',
  anchor,
].join('\n');
if (!before.includes(anchor) || before.includes('defined(__EMSCRIPTEN__)'))
  throw Error('PINNED_COREC_PLATFORM_GUARD_UNEXPECTED');
const next = before.replace(anchor, patch);
if (next === before)
  throw Error('COREC_EMSCRIPTEN_ADAPTER_NOT_APPLIED');
await fs.writeFile(header, next);
console.log(JSON.stringify({
  status: 'PINNED_UPSTREAM_EPHEMERAL_PLATFORM_ADAPTER_APPLIED',
  file: 'corec/corec/portab.h',
  strategy: 'Emscripten POSIX compatibility hypothesis, not upstream support',
}));
