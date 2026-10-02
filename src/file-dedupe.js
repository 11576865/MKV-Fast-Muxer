function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(fileLike) {
  const bytes = fileLike instanceof Uint8Array
    ? fileLike
    : new Uint8Array(await fileLike.arrayBuffer());
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

function splitName(name) {
  const text = String(name || 'font');
  const dot = text.lastIndexOf('.');
  if (dot <= 0) return { stem: text, ext: '' };
  return { stem: text.slice(0, dot), ext: text.slice(dot) };
}

export async function dedupeFilesBySha256(files) {
  const unique = [];
  const duplicates = [];
  const byDigest = new Map();

  for (let originalIndex = 0; originalIndex < files.length; originalIndex += 1) {
    const file = files[originalIndex];
    const sha256 = await sha256Hex(file);
    const first = byDigest.get(sha256);

    if (first) {
      duplicates.push({
        file,
        originalIndex,
        sha256,
        duplicateOf: first.file,
        duplicateOfIndex: first.originalIndex,
      });
      continue;
    }

    const item = { file, originalIndex, sha256 };
    unique.push(item);
    byDigest.set(sha256, item);
  }

  return { unique, duplicates };
}

export function assignUniqueAttachmentNames(items, reservedNames = []) {
  const used = new Set(
    reservedNames
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .map((name) => name.toLocaleLowerCase('en-US'))
  );

  return items.map((item) => {
    const originalName = String(item.attachmentName || item.file?.name || 'font');
    const key = originalName.toLocaleLowerCase('en-US');
    let attachmentName = originalName;

    if (used.has(key)) {
      const { stem, ext } = splitName(originalName);
      const shortHash = String(item.sha256 || '').slice(0, 8) || 'duplicate';
      attachmentName = `${stem}-mkvfm-${shortHash}${ext}`;
      let serial = 2;
      while (used.has(attachmentName.toLocaleLowerCase('en-US'))) {
        attachmentName = `${stem}-mkvfm-${shortHash}-${serial}${ext}`;
        serial += 1;
      }
    }

    used.add(attachmentName.toLocaleLowerCase('en-US'));
    return { ...item, attachmentName };
  });
}
