import { init, subset } from 'hb-subset-wasm';
import wasmUrl from 'hb-subset-wasm/hb-subset.wasm?url';
import {
  canSubsetFontIdentity,
  fontVirtualExtension,
  inspectFontFile,
} from './font-identity.js';

let readyPromise = null;

function ensureReady() {
  if (!readyPromise) readyPromise = init(fetch(wasmUrl));
  return readyPromise;
}

function extension(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function canSubsetFontFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return ['.ttf', '.otf'].includes(extension(name));
}

export function subsetAttachmentName(name = '') {
  const suffix = extension(name);
  if (!suffix) return `${name}.subset`;
  return `${name.slice(0, -suffix.length)}.subset${suffix}`;
}

export async function subsetFontFile(file, text, identity = null) {
  const detectedIdentity = identity || await inspectFontFile(file);
  if (!canSubsetFontIdentity(detectedIdentity)) {
    return {
      file,
      identity: detectedIdentity,
      subsetted: false,
      reason: detectedIdentity?.collection ? 'font-collection' : 'unsupported-font',
      originalSize: Number(file?.size || 0),
      subsetSize: Number(file?.size || 0),
    };
  }

  const sourceText = String(text || '');
  if (!sourceText) {
    return {
      file,
      identity: detectedIdentity,
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

  const actualExtension = fontVirtualExtension(detectedIdentity);
  const sourceName = String(file.name || 'font');
  const sourceSuffix = extension(sourceName);
  const baseName = sourceSuffix ? sourceName.slice(0, -sourceSuffix.length) : sourceName;
  const subsetName = `${baseName}.subset${actualExtension}`;
  const subsetFile = new File([output], subsetName, {
    type: detectedIdentity.mimeType || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
  });

  return {
    file: subsetFile,
    identity: {
      ...detectedIdentity,
      fileName: subsetName,
      extension: actualExtension,
      extensionMatches: true,
    },
    subsetted: true,
    reason: '',
    originalSize: source.byteLength,
    subsetSize: output.byteLength,
  };
}

export async function subsetFontItems(items, text) {
  const results = [];
  for (const item of items || []) {
    const result = await subsetFontFile(item.file, text, item.fontIdentity);
    results.push({
      ...item,
      originalFile: item.originalFile || item.file,
      file: result.file,
      sourceFontIdentity: item.sourceFontIdentity || item.fontIdentity,
      fontIdentity: result.identity || item.fontIdentity,
      attachmentName: result.subsetted ? result.file.name : (item.attachmentName || item.file.name),
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
