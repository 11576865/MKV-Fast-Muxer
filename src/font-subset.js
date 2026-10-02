import { fontMimeType, fontVirtualSuffix } from './font-identity.js';
import { init, subset } from 'hb-subset-wasm';
import wasmUrl from 'hb-subset-wasm/hb-subset.wasm?url';

let readyPromise = null;

function ensureReady() {
  if (!readyPromise) readyPromise = init(fetch(wasmUrl));
  return readyPromise;
}

function extension(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function canSubsetFontFile(fileOrName, identity = null) {
  if (identity) return Boolean(identity.valid && identity.container === 'single');
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return ['.ttf', '.otf'].includes(extension(name));
}

export function subsetAttachmentName(name = '', suffixOverride = '') {
  const suffix = extension(name);
  const outputSuffix = suffixOverride || suffix;
  const stem = suffix ? name.slice(0, -suffix.length) : name;
  return `${stem}.subset${outputSuffix}`;
}

export async function subsetFontFile(file, text, { identity = null } = {}) {
  if (!canSubsetFontFile(file, identity)) {
    return {
      file,
      subsetted: false,
      reason: 'font-collection',
      originalSize: Number(file?.size || 0),
      subsetSize: Number(file?.size || 0),
    };
  }

  const sourceText = String(text || '');
  if (!sourceText) {
    return {
      file,
      subsetted: false,
      reason: 'empty-text',
      originalSize: Number(file?.size || 0),
      subsetSize: Number(file?.size || 0),
    };
  }

  await ensureReady();
  const source = new Uint8Array(await file.arrayBuffer());
  const output = await subset(source, {
    text: sourceText,
    layoutFeatures: '*',
  });
  if (!(output instanceof Uint8Array) || !output.byteLength) {
    throw new Error(`字体子集化没有生成有效输出：${file.name}`);
  }

  const outputSuffix = identity ? fontVirtualSuffix(identity) : extension(file.name);
  const mime = identity ? fontMimeType(identity) : (extension(file.name) === '.otf' ? 'font/otf' : 'font/ttf');
  const subsetFile = new File([output], subsetAttachmentName(file.name, outputSuffix), {
    type: mime,
    lastModified: file.lastModified || Date.now(),
  });

  return {
    file: subsetFile,
    subsetted: true,
    reason: '',
    originalSize: source.byteLength,
    subsetSize: output.byteLength,
  };
}

export async function subsetFontItems(items, text) {
  const results = [];
  for (const item of items || []) {
    const result = await subsetFontFile(item.file, text, { identity: item.fontIdentity || null });
    results.push({
      ...item,
      originalFile: item.originalFile || item.file,
      file: result.file,
      attachmentName: result.subsetted
        ? subsetAttachmentName(
            item.attachmentName || item.file.name,
            item.fontIdentity ? fontVirtualSuffix(item.fontIdentity) : ''
          )
        : (item.attachmentName || item.file.name),
      subset: {
        enabled: true,
        applied: result.subsetted,
        reason: result.reason,
        originalSize: result.originalSize,
        subsetSize: result.subsetSize,
      },
    });
  }
  return results;
}
