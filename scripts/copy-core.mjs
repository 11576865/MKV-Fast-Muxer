import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const coreSrc = resolve('node_modules/@ffmpeg/core/dist/esm');
const coreOut = resolve('public/ffmpeg-core');
const workerSrc = resolve('node_modules/@ffmpeg/ffmpeg/dist/esm');
const workerOut = resolve('public/ffmpeg-class-worker');
const jassubSrc = resolve('node_modules/jassub/dist');
const jassubOut = resolve('public/jassub');

await mkdir(coreOut, { recursive: true });
await mkdir(workerOut, { recursive: true });
await mkdir(resolve(jassubOut, 'worker'), { recursive: true });
await mkdir(resolve(jassubOut, 'wasm'), { recursive: true });

await copyFile(resolve(coreSrc, 'ffmpeg-core.js'), resolve(coreOut, 'ffmpeg-core.js'));
await copyFile(resolve(coreSrc, 'ffmpeg-core.wasm'), resolve(coreOut, 'ffmpeg-core.wasm'));

for (const name of ['worker.js', 'const.js', 'errors.js']) {
  await copyFile(resolve(workerSrc, name), resolve(workerOut, name));
}

await copyFile(resolve(jassubSrc, 'worker/worker.js'), resolve(jassubOut, 'worker/worker.js'));
await copyFile(resolve(jassubSrc, 'wasm/jassub-worker.wasm'), resolve(jassubOut, 'wasm/jassub-worker.wasm'));
await copyFile(resolve(jassubSrc, 'wasm/jassub-worker-modern.wasm'), resolve(jassubOut, 'wasm/jassub-worker-modern.wasm'));
await copyFile(resolve(jassubSrc, 'default.woff2'), resolve(jassubOut, 'default.woff2'));

console.log('Copied ffmpeg.wasm and JASSUB runtime assets to public/.');
