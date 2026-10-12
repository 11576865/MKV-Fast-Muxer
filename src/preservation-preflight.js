/**
 * P0 bounded, seek-based Matroska structural hazard inspection.
 * NO_KNOWN_HAZARD does NOT mean full EBML or packet preservation.
 * Read only Chapters/Tags; skip large Cluster payloads via Blob.slice offsets.
 * Element IDs per RFC 9559 §§5.1.7–5.1.8.
 */
const E = {
  ebml: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067,
  chapters: 0x1043a770, edition: 0x45b9, atom: 0xb6, process: 0x6944,
  ordered: 0x45dd, tags: 0x1254c367, tag: 0x7373, targets: 0x63c0,
};
const uidTargets = new Map([
  [0x63c4, { name: '章节', blocking: true }],
  [0x63c9, { name: '章节版本', blocking: true }],
  // Track/attachment UID tags are common even in old passing fixtures.
  // Their exact survival still needs separate independent comparison.
  [0x63c5, { name: '轨道', blocking: false }],
  [0x63c6, { name: '附件', blocking: false }],
]);
const LIMIT = 8 * 1024 * 1024;
const MAX_ELEMENTS = 100000;

function header(bytes, offset, parentEnd = bytes.length, bounds = true) {
  if (offset >= parentEnd) throw Error('EBML 元素头超出范围');
  const first = bytes[offset];
  if (!first) throw Error('EBML ID 前缀无效');
  let n = 1;
  while (n <= 4 && (first & (0x80 >> (n - 1))) === 0) n++;
  if (n > 4 || offset + n >= parentEnd) throw Error('EBML ID 不完整');
  let id = 0;
  for (let i = 0; i < n; i++) id = id * 256 + bytes[offset + i];
  const start = offset + n, lead = bytes[start];
  if (!lead) throw Error('EBML 大小 VINT 前缀无效');
  let width = 1;
  while (width <= 8 && (lead & (0x80 >> (width - 1))) === 0) width++;
  if (width > 8 || start + width > parentEnd) throw Error('EBML 元素长度不完整');
  let value = BigInt(lead & ((1 << (8 - width)) - 1));
  for (let i = 1; i < width; i++) value = (value << 8n) | BigInt(bytes[start + i]);
  const unknown = value === (1n << BigInt(7 * width)) - 1n;
  if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('EBML 元素无法安全寻址');
  const dataStart = start + width, end = unknown ? null : dataStart + Number(value);
  if (bounds && end !== null && end > parentEnd) throw Error('EBML 元素超出父级');
  return { id, dataStart, end, unknown };
}

function walk(bytes, from, to, fn, depth = 0, counter = { n: 0 }) {
  if (depth > 32) throw Error('EBML 过度嵌套');
  for (let at = from; at < to;) {
    if (++counter.n > MAX_ELEMENTS) throw Error('EBML 元素过多');
    const el = header(bytes, at, to);
    if (el.unknown) throw Error('元数据元素为未知长度');
    fn(el, (callback) => walk(bytes, el.dataStart, el.end, callback, depth + 1, counter));
    at = el.end;
  }
}
function uint(bytes, el) {
  if (el.end - el.dataStart > 8) throw Error('EBML UID 超长');
  let val = 0n;
  for (let i = el.dataStart; i < el.end; i++) val = (val << 8n) + BigInt(bytes[i]);
  return val;
}
function chapters(bytes, issues) {
  let editions = 0;
  walk(bytes, 0, bytes.length, (el, children) => {
    if (el.id !== E.edition) return;
    editions++;
    children((item) => {
      if (item.id === E.ordered && uint(bytes, item) !== 0n) issues.add('有序章节版本');
      if (item.id !== E.atom) return;
      function atom(el, depth) {
        if (depth > 1) issues.add('嵌套章节');
        walk(bytes, el.dataStart, el.end, (child) => {
          if (child.id === E.atom) atom(child, depth + 1);
          if (child.id === E.process) issues.add('章节处理指令');
        });
      }
      atom(item, 1);
    });
  });
  if (editions > 1) issues.add('多个章节版本');
}
function tags(bytes, issues, warnings) {
  walk(bytes, 0, bytes.length, (tag, children) => {
    if (tag.id !== E.tag) return;
    children((el, targetChildren) => {
      if (el.id !== E.targets) return;
      targetChildren((target) => {
        const kind = uidTargets.get(target.id);
        if (!kind || uint(bytes, target) === 0n) return;
        const label = '指向特定' + kind.name + ' UID 的标签';
        if (kind.blocking) issues.add(label);
        else warnings.add(label + '；当前路径尚未完成该类关联的独立保留验证');
      });
    });
  });
}
async function fileHeader(file, offset, parentEnd) {
  const slice = new Uint8Array(await file.slice(offset, Math.min(offset + 12, parentEnd)).arrayBuffer());
  const el = header(slice, 0, slice.length, false);
  const end = el.end === null ? null : offset + el.end;
  if (end !== null && end > parentEnd) throw Error('EBML 元素越界');
  return { id: el.id, dataStart: offset + el.dataStart, end, unknown: el.unknown };
}
function make(state, reasons = [], warnings = []) {
  return { state, reasons, warnings,
    evidence: 'raw-ebml-structural-preflight',
    caveat: '未发现已证实的阻断风险不等于源容器整体结构可无损保留。' };
}

export async function inspectMatroskaPreservation(file) {
  if (!file?.slice || !Number.isSafeInteger(file.size)) return make('BLOCKED_UNKNOWN', ['无法读取来源文件']);
  try {
    const ebml = await fileHeader(file, 0, file.size);
    if (ebml.id !== E.ebml || ebml.end === null || ebml.end > 65536) throw Error('EBML 头无法确认');
    const bytes = new Uint8Array(await file.slice(ebml.dataStart, ebml.end).arrayBuffer());
    let docType = '';
    walk(bytes, 0, bytes.length, (el) => {
      if (el.id === E.docType) docType = new TextDecoder('ascii').decode(bytes.subarray(el.dataStart, el.end));
    });
    if (docType === 'webm') return make('NOT_MATROSKA');
    if (docType !== 'matroska') throw Error('Matroska DocType 未确认');
    let segment = null;
    for (let at = ebml.end; at < file.size;) {
      const item = await fileHeader(file, at, file.size);
      if (item.id === E.segment) { segment = item; break; }
      if (item.unknown) throw Error('Segment 之前存在未知长度元素');
      at = item.end;
    }
    if (!segment) throw Error('未找到 Segment');
    const issues = new Set();
    const warnings = new Set();
    const segmentEnd = segment.end ?? file.size;
    let inspected = 0;
    for (let at = segment.dataStart; at < segmentEnd;) {
      if (++inspected > MAX_ELEMENTS) throw Error('顶层元素数量超过安全限额');
      const item = await fileHeader(file, at, segmentEnd);
      if (item.unknown) throw Error('无法跳过未知长度的 Cluster 或其他元素');
      if (item.id === E.chapters || item.id === E.tags) {
        const size = item.end - item.dataStart;
        if (size > LIMIT) throw Error('章节或标签超出有界解析大小');
        const content = new Uint8Array(await file.slice(item.dataStart, item.end).arrayBuffer());
        if (item.id === E.chapters) chapters(content, issues);
        else tags(content, issues, warnings);
      }
      at = item.end;
    }
    return issues.size
      ? make('BLOCKED_RISK', [...issues].sort(), [...warnings].sort())
      : warnings.size
        ? make('UNVERIFIED_REFERENCES', [], [...warnings].sort())
        : make('NO_KNOWN_HAZARD');
  } catch (err) {
    return make('BLOCKED_UNKNOWN', [err?.message || String(err)]);
  }
}
export function preservationBlockMessage(name, inspection) {
  if (['NO_KNOWN_HAZARD', 'UNVERIFIED_REFERENCES', 'NOT_MATROSKA'].includes(inspection.state)) return '';
  return '结构保留预检阻断“' + name + '”：' + inspection.reasons.join('；') +
    '。当前 FFmpeg/Wasm 重封装未证明能安全保留这些结构；原文件未被修改。';
}
