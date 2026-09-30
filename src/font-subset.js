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

export function canSubsetFontFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return ['.ttf', '.otf'].includes(extension(name));
}

export function subsetAttachmentName(name = '') {
  const suffix = extension(name);
  if (!suffix) return `${name}.subset`;
  return `${name.slice(0, -suffix.length)}.subset${suffix}`;
}

export async function subsetFontFile(file, text) {
  if (!canSubsetFontFile(file)) {
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

  const mime = extension(file.name) === '.otf' ? 'font/otf' : 'font/ttf';
  const subsetFile = new File([output], subsetAttachmentName(file.name), {
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
    const result = await subsetFontFile(item.file, text);
    results.push({
      ...item,
      originalFile: item.originalFile || item.file,
      file: result.file,
      attachmentName: result.subsetted ? subsetAttachmentName(item.attachmentName || item.file.name) : (item.attachmentName || item.file.name),
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
