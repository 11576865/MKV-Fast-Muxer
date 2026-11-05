// Classify whether libass has an ASS Dialogue event to render at the exact
// shifted frame timestamp. Inactive is NOT proof of font availability.
// Malformed, unrecognized or ambiguous ASS remains "unknown" (fail closed).
export function previewAssDialogueActivity(assText, seconds) {
  if (typeof assText !== 'string' || !Number.isFinite(seconds) || seconds < 0) return 'unknown';
  let inEvents = false;
  let foundEvents = false;
  let fields = null;
  const secondsFromAss = value => {
    const m = String(value || '').trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if (!m || Number(m[2]) >= 60 || Number(m[3]) >= 60) return NaN;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number('0.' + (m[4] || '0'));
  };
  for (const raw of assText.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const section = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      inEvents = section[1].toLowerCase() === 'events';
      if (inEvents) foundEvents = true;
      continue;
    }
    if (!inEvents) continue;
    const format = raw.match(/^\s*Format\s*:\s*(.*)$/i);
    if (format) {
      fields = format[1].split(',').map(s => s.trim().toLowerCase());
      if (fields.filter(x => x === 'start').length !== 1 ||
          fields.filter(x => x === 'end').length !== 1) return 'unknown';
      continue;
    }
    const dialogue = raw.match(/^\s*Dialogue\s*:\s*(.*)$/i);
    if (!dialogue) continue;
    if (!fields || fields.length < 2 || fields[fields.length - 1] !== 'text') return 'unknown';
    const parts = dialogue[1].split(',');
    if (parts.length < fields.length) return 'unknown';
    // ASS's Text field is last and may contain commas. The timing fields
    // must be read from the declared Format order, not fixed column indices.
    const values = parts.slice(0, fields.length - 1);
    values.push(parts.slice(fields.length - 1).join(','));
    const start = secondsFromAss(values[fields.indexOf('start')]);
    const end = secondsFromAss(values[fields.indexOf('end')]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'unknown';
    if (start <= seconds && seconds < end) return 'active';
  }
  return foundEvents && fields ? 'inactive' : 'unknown';
}
