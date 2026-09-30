import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const coreSrc = resolve('node_modules/@ffmpeg/core/dist/esm');
const coreOut = resolve('public/ffmpeg-core');
const workerSrc = resolve('node_modules/@ffmpeg/ffmpeg/dist/esm');
const workerOut = resolve('public/ffmpeg-class-worker');

await mkdir(coreOut, { recursive: true });
await mkdir(workerOut, { recursive: true });

await copyFile(resolve(coreSrc, 'ffmpeg-core.js'), resolve(coreOut, 'ffmpeg-core.js'));
await copyFile(resolve(coreSrc, 'ffmpeg-core.wasm'), resolve(coreOut, 'ffmpeg-core.wasm'));

for (const name of ['worker.js', 'const.js', 'errors.js']) {
  await copyFile(resolve(workerSrc, name), resolve(workerOut, name));
}

console.log('Copied ffmpeg.wasm core and class worker to public/.');
