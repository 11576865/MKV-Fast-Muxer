import './style.css';
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { auditMuxProbe } from './mux-audit.js';
import { buildProbeArgs } from './probe-policy.js';
import { buildMuxCommand, dispositionValue, normalizeTrackLanguage } from './mux-command.js';
import { assignUniqueAttachmentNames, dedupeFilesBySha256, sha256Hex } from './file-dedupe.js';
import { createMuxReport, reportFilename, serializeMuxReport } from './mux-report.js';
import { classifyBrowserWorkload, formatBytes, sumFileSizes } from './workload.js';
import { formatOperationError } from './error-feedback.js';
import {
  analyzeAssFontUsage,
  checkFontCharacters,
  forceAssFontFamily,
  readFontDescriptors,
  scoreFontFaceMatch,
} from './ass-font-rewrite.js';

const $ = (id) => document.getElementById(id);

const videoInput = $('videoInput');
const audioInput = $('audioInput');
const subInput = $('subInput');
const fontInput = $('fontInput');
const fontMode = $('fontMode');
const fontModeHint = $('fontModeHint');
const newAudioList = $('newAudioList');
const newSubtitleList = $('newSubtitleList');
const preserveAttachments = $('preserveAttachments');
const attachmentList = $('attachmentList');
const scanTracksBtn = $('scanTracksBtn');
const trackList = $('trackList');
const refreshPlanBtn = $('refreshPlanBtn');
const muxPlan = $('muxPlan');
const planWarnings = $('planWarnings');
const muxBtn = $('muxBtn');
const cancelBtn = $('cancelBtn');
const status = $('status');
const logEl = $('log');
const bar = $('bar');
const downloadLink = $('downloadLink');
const reportLink = $('reportLink');
const auditResult = $('auditResult');
const workloadNotice = $('workloadNotice');
const trackBulkTools = $('trackBulkTools');
const bulkLanguage = $('bulkLanguage');
const applyAudioLanguage = $('applyAudioLanguage');
const applySubtitleLanguage = $('applySubtitleLanguage');
const firstAudioDefault = $('firstAudioDefault');
const firstSubtitleDefault = $('firstSubtitleDefault');
const clearAllDefaults = $('clearAllDefaults');
const keepAllAudio = $('keepAllAudio');
const dropAllAudio = $('dropAllAudio');
const keepAllSubtitles = $('keepAllSubtitles');
const dropAllSubtitles = $('dropAllSubtitles');
const resetAudioMetadata = $('resetAudioMetadata');
const resetSubtitleMetadata = $('resetSubtitleMetadata');
const attachmentBulkTools = $('attachmentBulkTools');
const keepAllAttachments = $('keepAllAttachments');
const dropAllAttachments = $('dropAllAttachments');
const resetAttachmentMetadata = $('resetAttachmentMetadata');
const previewImage = $('previewImage');
const previewEmpty = $('previewEmpty');
const previewStatus = $('previewStatus');
const previewSubtitleSelect = $('previewSubtitleSelect');
const previewRefreshBtn = $('previewRefreshBtn');

document.documentElement.dataset.theme = 'dark';
document.documentElement.dataset.themePreference = 'dark';

const languageTitles = {
  und: 'ASS 字幕',
  zho: '简体中文 ASS',
  eng: 'English ASS',
  jpn: '日本語 ASS',
  kor: '한국어 ASS',
  mul: '多语言 ASS',
};

const ffmpeg = new FFmpeg();
let loaded = false;
let running = false;
let scanning = false;
let cancelRequested = false;
let outputURL = null;
let reportURL = null;
let trackState = null;
let externalAudioState = [];
let newSubtitleState = [];
let previewImageURL = null;
let previewGeneration = 0;
let previewing = false;

ffmpeg.on('log', ({ message }) => {
  logEl.textContent += message + '\n';
  logEl.scrollTop = logEl.scrollHeight;
});

ffmpeg.on('progress', ({ progress }) => {
  if ((running || scanning) && Number.isFinite(progress) && progress >= 0) {
    bar.style.width = `${Math.min(95, Math.max(8, progress * 95))}%`;
  }
});

function ext(name) {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

function safeOutputName(videoName) {
  return videoName.replace(/\.[^.]+$/, '') + '.mkv';
}

function selectedFonts() {
  return Array.from(fontInput.files || []);
}

function selectedExternalAudioFiles() {
  return Array.from(audioInput.files || []);
}

function selectedSubtitleFiles() {
  return Array.from(subInput.files || []);
}

function stripExtension(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function syncNewTrackState() {
  const oldAudio = new Map(externalAudioState.map((item) => [fileKey(item.file), item]));
  externalAudioState = selectedExternalAudioFiles().map((file) => {
    const old = oldAudio.get(fileKey(file));
    return old || {
      file,
      language: 'und',
      title: stripExtension(file.name),
      default: false,
      original: false,
      commentary: false,
      hearingImpaired: false,
    };
  });

  const oldSubs = new Map(newSubtitleState.map((item) => [fileKey(item.file), item]));
  newSubtitleState = selectedSubtitleFiles().map((file, index) => {
    const old = oldSubs.get(fileKey(file));
    return old || {
      file,
      language: 'und',
      title: stripExtension(file.name) || languageTitles.und,
      default: index === 0,
      forced: false,
      original: false,
      commentary: false,
      hearingImpaired: false,
    };
  });
}

function renderNewTrackLists() {
  newAudioList.innerHTML = externalAudioState.length
    ? externalAudioState.map((item, index) => `
      <div class="new-track-row is-audio">
        <div class="new-track-main">
          <strong class="new-track-name">${escapeHtml(item.file.name)}</strong>
          <div class="new-track-fields">
            <input data-new-audio-field="language" data-index="${index}" value="${escapeHtml(item.language)}" list="languageSuggestions" maxlength="35" aria-label="外部音频语言">
            <input data-new-audio-field="title" data-index="${index}" value="${escapeHtml(item.title)}" maxlength="160" aria-label="外部音频标题">
          </div>
        </div>
        <div class="new-track-flags">
          <label><input type="checkbox" data-new-audio-field="default" data-index="${index}" ${item.default ? 'checked' : ''}> Default</label>
          <details class="track-advanced">
            <summary>高级属性</summary>
            <label><input type="checkbox" data-new-audio-field="original" data-index="${index}" ${item.original ? 'checked' : ''}> Original</label>
            <label><input type="checkbox" data-new-audio-field="commentary" data-index="${index}" ${item.commentary ? 'checked' : ''}> Commentary</label>
            <label><input type="checkbox" data-new-audio-field="hearingImpaired" data-index="${index}" ${item.hearingImpaired ? 'checked' : ''}> Hearing impaired</label>
          </details>
        </div>
      </div>`).join('')
    : '<div class="track-empty">未选择外部音频。</div>';

  newSubtitleList.innerHTML = newSubtitleState.length
    ? newSubtitleState.map((item, index) => `
      <div class="new-track-row is-subtitle">
        <div class="new-track-main">
          <strong class="new-track-name">${escapeHtml(item.file.name)}</strong>
          <div class="new-track-fields">
            <input data-new-sub-field="language" data-index="${index}" value="${escapeHtml(item.language)}" list="languageSuggestions" maxlength="35" aria-label="字幕语言">
            <input data-new-sub-field="title" data-index="${index}" value="${escapeHtml(item.title)}" maxlength="160" aria-label="字幕标题">
          </div>
        </div>
        <div class="new-track-flags">
          <label><input type="checkbox" data-new-sub-field="default" data-index="${index}" ${item.default ? 'checked' : ''}> Default</label>
          <label><input type="checkbox" data-new-sub-field="forced" data-index="${index}" ${item.forced ? 'checked' : ''}> Forced</label>
          <details class="track-advanced">
            <summary>高级属性</summary>
            <label><input type="checkbox" data-new-sub-field="original" data-index="${index}" ${item.original ? 'checked' : ''}> Original</label>
            <label><input type="checkbox" data-new-sub-field="commentary" data-index="${index}" ${item.commentary ? 'checked' : ''}> Commentary</label>
            <label><input type="checkbox" data-new-sub-field="hearingImpaired" data-index="${index}" ${item.hearingImpaired ? 'checked' : ''}> Hearing impaired</label>
          </details>
        </div>
      </div>`).join('')
    : '<div class="track-empty">未选择 ASS 字幕。</div>';
}

function fileKey(file) {
  return file ? `${file.name}|${file.size}|${file.lastModified}` : '';
}

function formatFontSelection(files) {
  if (!files.length) return '未选择';
  if (files.length === 1) return files[0].name;
  const head = files.slice(0, 3).map((file) => file.name).join('、');
  return files.length > 3 ? `${files.length} 个字体：${head}…` : `${files.length} 个字体：${head}`;
}

function selectedInputFiles() {
  return [
    ...Array.from(videoInput.files || []),
    ...selectedExternalAudioFiles(),
    ...selectedSubtitleFiles(),
    ...selectedFonts(),
  ];
}

function renderWorkloadNotice() {
  if (!workloadNotice) return;
  const files = selectedInputFiles();
  if (!files.length) {
    workloadNotice.dataset.level = 'normal';
    workloadNotice.innerHTML = '<strong>输入规模：—</strong><span>选择文件后显示浏览器内处理规模提示。</span>';
    return;
  }

  const totalBytes = sumFileSizes(files);
  const workload = classifyBrowserWorkload(totalBytes);
  workloadNotice.dataset.level = workload.level;
  workloadNotice.innerHTML = `<strong>输入规模：${escapeHtml(formatBytes(totalBytes))} · ${escapeHtml(workload.label)}</strong><span>${escapeHtml(workload.message)}</span>`;
}

function setBulkToolsDisabled(disabled) {
  if (!trackBulkTools) return;
  trackBulkTools.querySelectorAll('input, button').forEach((control) => {
    control.disabled = disabled;
  });
}

function isBusy() {
  return running || scanning || previewing;
}

function setInputsDisabled(disabled) {
  videoInput.disabled = disabled;
  audioInput.disabled = disabled;
  subInput.disabled = disabled;
  fontInput.disabled = disabled;
  fontMode.disabled = disabled;
  preserveAttachments.disabled = disabled || ext(videoInput.files[0]?.name || '') !== '.mkv';
  newAudioList.querySelectorAll('input').forEach((input) => { input.disabled = disabled; });
  newSubtitleList.querySelectorAll('input').forEach((input) => { input.disabled = disabled; });
  attachmentList.querySelectorAll('input').forEach((input) => { input.disabled = disabled; });
  setBulkToolsDisabled(disabled || !trackState);
  attachmentBulkTools?.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled || !trackState;
  });
}

function resetTrackState() {
  trackState = null;
  trackList.innerHTML = '<div class="track-empty">选择 MKV 后可扫描轨道。非 MKV 输入默认保留所有音频。</div>';
  attachmentList.innerHTML = '<div class="track-empty">扫描 MKV 后显示附件列表。</div>';
  trackBulkTools?.classList.add('hidden');
  attachmentBulkTools?.classList.add('hidden');
  renderMuxPlan();
}

function updateUI() {
  const video = videoInput.files[0];
  const subs = selectedSubtitleFiles();
  const fonts = selectedFonts();
  const inputIsMkv = ext(video?.name || '') === '.mkv';
  const mode = fontMode.value || 'preserve';
  const busy = isBusy();

  $('videoName').textContent = video?.name ?? '未选择';
  $('audioName').textContent = formatFontSelection(selectedExternalAudioFiles()).replace(/字体/g, '音频');
  $('subName').textContent = subs.length ? (subs.length === 1 ? subs[0].name : `${subs.length} 个 ASS`) : '未选择';
  $('fontName').textContent = formatFontSelection(fonts);
  $('fontSummary').textContent = fonts.length ? `${fonts.length} file${fonts.length === 1 ? '' : 's'}` : '—';
  $('outputName').textContent = video ? safeOutputName(video.name) : '—';
  renderWorkloadNotice();
  syncPreviewControls();

  fontModeHint.textContent = mode === 'force'
    ? '兼容旧行为：只使用并附加第一个上传字体；所有新增 ASS 的 Fontname 与显式内联 \\fn 会统一改写。'
    : '保留各 ASS Fontname；按 Family、Weight/Bold、Italic 匹配字体 face，并检查实际字符覆盖。';

  if (!inputIsMkv) {
    preserveAttachments.checked = false;
    if (trackState) resetTrackState();
  }

  preserveAttachments.disabled = busy || !inputIsMkv;
  scanTracksBtn.disabled = busy || !inputIsMkv || !video;
  muxBtn.disabled = busy || !(video && subs.length && fonts.length);
  cancelBtn.disabled = !busy;
  trackBulkTools?.classList.toggle('hidden', !trackState);
  attachmentBulkTools?.classList.toggle('hidden', !trackState || !trackState.attachments.length);
  renderNewTrackLists();
  setInputsDisabled(busy);
  refreshPlanBtn.disabled = busy;
  renderMuxPlan();
}

function bindNewTrackEditor(container, selector, getState) {
  const update = (event) => {
    const input = event.target.closest(selector);
    if (!input) return;
    const item = getState()[Number(input.dataset.index)];
    if (!item) return;
    const field = input.dataset.newAudioField || input.dataset.newSubField;
    item[field] = input.type === 'checkbox' ? input.checked : input.value;
    renderMuxPlan();
  };
  container.addEventListener('input', update);
  container.addEventListener('change', update);
}

videoInput.addEventListener('change', () => {
  resetTrackState();
  preserveAttachments.checked = false;
  destroySubtitlePreview();
  clearPreviewImage();
  updateUI();
  previewStatus.textContent = '视频已更换；点击“生成预览帧”按需检查字幕效果。';
});
audioInput.addEventListener('change', () => {
  syncNewTrackState();
  updateUI();
});
subInput.addEventListener('change', () => {
  syncNewTrackState();
  destroySubtitlePreview();
  updateUI();
  previewStatus.textContent = '字幕已更换；点击“生成预览帧”按需检查字幕效果。';
});
fontInput.addEventListener('change', () => {
  destroySubtitlePreview();
  updateUI();
  previewStatus.textContent = '字体已更换；点击“生成预览帧”重新检查。';
});
fontMode.addEventListener('change', () => {
  destroySubtitlePreview();
  updateUI();
  previewStatus.textContent = '字体模式已更换；点击“生成预览帧”重新检查。';
});
previewSubtitleSelect?.addEventListener('change', () => {
  destroySubtitlePreview();
  previewStatus.textContent = '预览字幕已切换；点击“生成预览帧”。';
});
previewRefreshBtn?.addEventListener('click', refreshSubtitlePreview);

preserveAttachments.addEventListener('change', () => {
  if (trackState) {
    trackState.attachments.forEach((item) => { item.include = preserveAttachments.checked; });
    renderAttachmentList();
  }
  renderMuxPlan();
});
refreshPlanBtn.addEventListener('click', renderMuxPlan);
bindNewTrackEditor(newAudioList, 'input[data-new-audio-field]', () => externalAudioState);
bindNewTrackEditor(newSubtitleList, 'input[data-new-sub-field]', () => newSubtitleState);

function applyLanguageToSelectedTracks(type) {
  if (!trackState) return;
  const language = normalizeTrackLanguage(bulkLanguage?.value);
  selectedTracks(type).forEach((track) => { track.language = language; });
  renderTrackList();
}

function setOnlyFirstDefault(type) {
  if (!trackState) return;
  const selected = selectedTracks(type);
  selected.forEach((track, index) => { track.default = index === 0; });
  renderTrackList();
}

applyAudioLanguage?.addEventListener('click', () => applyLanguageToSelectedTracks('audio'));
applySubtitleLanguage?.addEventListener('click', () => applyLanguageToSelectedTracks('subtitle'));
firstAudioDefault?.addEventListener('click', () => setOnlyFirstDefault('audio'));
firstSubtitleDefault?.addEventListener('click', () => setOnlyFirstDefault('subtitle'));
clearAllDefaults?.addEventListener('click', () => {
  if (!trackState) return;
  selectedTracks('audio').forEach((track) => { track.default = false; });
  selectedTracks('subtitle').forEach((track) => { track.default = false; });
  externalAudioState.forEach((track) => { track.default = false; });
  newSubtitleState.forEach((track) => { track.default = false; });
  renderTrackList();
  renderNewTrackLists();
  renderMuxPlan();
});

function setTrackInclusion(type, include) {
  if (!trackState) return;
  trackState.tracks
    .filter((track) => track.type === type)
    .forEach((track) => {
      track.include = include;
      if (!include) {
        track.default = false;
        track.forced = false;
        track.original = false;
        track.commentary = false;
        track.hearingImpaired = false;
      }
    });
  renderTrackList();
}

function restoreTrackMetadata(type) {
  if (!trackState) return;
  trackState.tracks
    .filter((track) => track.type === type)
    .forEach((track) => {
      track.language = track.originalLanguage;
      track.title = track.originalTitle;
      track.default = track.originalDefault;
      track.forced = track.originalForced;
      track.original = track.originalOriginal;
      track.commentary = track.originalCommentary;
      track.hearingImpaired = track.originalHearingImpaired;
    });
  renderTrackList();
}

keepAllAudio?.addEventListener('click', () => setTrackInclusion('audio', true));
dropAllAudio?.addEventListener('click', () => setTrackInclusion('audio', false));
keepAllSubtitles?.addEventListener('click', () => setTrackInclusion('subtitle', true));
dropAllSubtitles?.addEventListener('click', () => setTrackInclusion('subtitle', false));
resetAudioMetadata?.addEventListener('click', () => restoreTrackMetadata('audio'));
resetSubtitleMetadata?.addEventListener('click', () => restoreTrackMetadata('subtitle'));

function setAttachmentInclusion(include) {
  if (!trackState) return;
  trackState.attachments.forEach((item) => { item.include = include; });
  preserveAttachments.checked = include && trackState.attachments.length > 0;
  renderAttachmentList();
  renderMuxPlan();
}

keepAllAttachments?.addEventListener('click', () => setAttachmentInclusion(true));
dropAllAttachments?.addEventListener('click', () => setAttachmentInclusion(false));
resetAttachmentMetadata?.addEventListener('click', () => {
  if (!trackState) return;
  trackState.attachments.forEach((item) => {
    item.filename = item.originalFilename;
    item.mimetype = item.originalMimetype;
  });
  renderAttachmentList();
  renderMuxPlan();
});

async function loadFFmpeg() {
  if (loaded) return;

  status.textContent = '正在从本机加载 ffmpeg.wasm 核心（约 31 MB）……';
  bar.style.width = '8%';

  const coreBase = new URL('ffmpeg-core/', window.location.href).href;
  const classWorkerURL = new URL('ffmpeg-class-worker/worker.js', window.location.href).href;

  const slowTimer = setTimeout(() => {
    status.textContent = '核心仍在加载。若持续超过约 30 秒，请查看 Termux 输出和浏览器开发者日志。';
  }, 15000);

  try {
    await ffmpeg.load({
      coreURL: `${coreBase}ffmpeg-core.js`,
      wasmURL: `${coreBase}ffmpeg-core.wasm`,
      classWorkerURL,
    });
    loaded = true;
  } finally {
    clearTimeout(slowTimer);
  }

  status.textContent = 'ffmpeg.wasm 已从本机加载。';
  bar.style.width = '12%';
}

async function removeQuietly(path) {
  if (!loaded) return;
  try { await ffmpeg.deleteFile(path); } catch {}
}

function taskPrefix() {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `task-${Date.now()}-${random}`;
}

function decodeUtf16BE(bytes) {
  const evenLength = bytes.length - (bytes.length % 2);
  const swapped = new Uint8Array(evenLength);
  for (let i = 0; i < evenLength; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return new TextDecoder('utf-16le').decode(swapped);
}

function detectUtf16WithoutBom(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  let evenZeros = 0;
  let oddZeros = 0;
  let pairs = 0;

  for (let i = 0; i + 1 < sample.length; i += 2) {
    if (sample[i] === 0) evenZeros += 1;
    if (sample[i + 1] === 0) oddZeros += 1;
    pairs += 1;
  }

  if (pairs < 4) return null;
  if (oddZeros / pairs > 0.3 && evenZeros / pairs < 0.1) return 'utf-16le';
  if (evenZeros / pairs > 0.3 && oddZeros / pairs < 0.1) return 'utf-16be';
  return null;
}

async function readAssText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16LE BOM' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16BE(bytes.subarray(2)), encoding: 'UTF-16BE BOM' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8 BOM' };
  }

  const guessedUtf16 = detectUtf16WithoutBom(bytes);
  if (guessedUtf16 === 'utf-16le') {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'UTF-16LE（启发式）' };
  }
  if (guessedUtf16 === 'utf-16be') {
    return { text: decodeUtf16BE(bytes), encoding: 'UTF-16BE（启发式）' };
  }

  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'UTF-8',
    };
  } catch {
    throw new Error('ASS 不是有效的 UTF-8 / UTF-16 文本。请先转换为 UTF-8、UTF-16LE 或 UTF-16BE。');
  }
}

function assTimestampSeconds(value = '') {
  const match = String(value).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return NaN;
  const fraction = Number(`0.${match[4] || '0'}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction;
}

function splitAssCsv(text, count) {
  const out = [];
  let start = 0;
  for (let index = 0; index < count - 1; index += 1) {
    const comma = text.indexOf(',', start);
    if (comma < 0) break;
    out.push(text.slice(start, comma).trim());
    start = comma + 1;
  }
  out.push(text.slice(start).trim());
  while (out.length < count) out.push('');
  return out;
}

function secondsToAssTime(seconds) {
  const centiseconds = Math.max(0, Math.round(Number(seconds || 0) * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function shiftAssForPreview(text, offsetSeconds) {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds <= 0) return text;

  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '';
  let format = [];

  return lines.map((raw) => {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      return raw;
    }
    if (section !== 'events') return raw;

    if (/^\s*Format\s*:/i.test(raw)) {
      format = raw.replace(/^\s*Format\s*:/i, '').split(',').map((item) => item.trim().toLowerCase());
      return raw;
    }
    if (!/^\s*(Dialogue|Comment)\s*:/i.test(raw) || !format.length) return raw;

    const prefix = raw.slice(0, raw.indexOf(':') + 1);
    const values = splitAssCsv(raw.slice(raw.indexOf(':') + 1), format.length);
    const startIndex = format.indexOf('start');
    const endIndex = format.indexOf('end');
    if (startIndex < 0 || endIndex < 0) return raw;

    const start = assTimestampSeconds(values[startIndex]);
    const end = assTimestampSeconds(values[endIndex]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return raw;

    values[startIndex] = secondsToAssTime(Math.max(0, start - offsetSeconds));
    values[endIndex] = secondsToAssTime(Math.max(0, end - offsetSeconds));
    return `${prefix} ${values.join(',')}`;
  }).join('\n');
}

function choosePreviewFrameTime(assText) {
  const lines = String(assText || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '';
  let format = [];
  const candidates = [];

  for (const raw of lines) {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      continue;
    }
    if (section !== 'events') continue;

    if (/^\s*Format\s*:/i.test(raw)) {
      format = raw.replace(/^\s*Format\s*:/i, '').split(',').map((item) => item.trim().toLowerCase());
      continue;
    }

    if (!/^\s*Dialogue\s*:/i.test(raw) || !format.length) continue;
    const values = splitAssCsv(raw.slice(raw.indexOf(':') + 1), format.length);
    const startIndex = format.indexOf('start');
    const endIndex = format.indexOf('end');
    if (startIndex < 0 || endIndex < 0) continue;

    const start = assTimestampSeconds(values[startIndex]);
    const end = assTimestampSeconds(values[endIndex]);
    if (!Number.isFinite(start)) continue;

    const midpoint = Number.isFinite(end) && end > start
      ? start + Math.max(0.08, Math.min((end - start) / 2, 1))
      : start + 0.12;
    candidates.push(Math.max(0, midpoint));
  }

  if (!candidates.length) return 0;
  const firstVisible = candidates.find((value) => value >= 0.25);
  return firstVisible ?? candidates[0];
}


async function destroySubtitlePreview() {
  previewGeneration += 1;
  if (previewImageURL) {
    URL.revokeObjectURL(previewImageURL);
    previewImageURL = null;
  }
  previewImage?.removeAttribute('src');
}

function clearPreviewImage() {
  if (previewImageURL) {
    URL.revokeObjectURL(previewImageURL);
    previewImageURL = null;
  }
  previewImage?.removeAttribute('src');
}

function syncPreviewControls() {
  if (!previewSubtitleSelect || !previewRefreshBtn) return;
  const subs = selectedSubtitleFiles();
  const previous = Number(previewSubtitleSelect.value);
  previewSubtitleSelect.innerHTML = subs.length
    ? subs.map((file, index) => `<option value="${index}">${escapeHtml(file.name)}</option>`).join('')
    : '<option value="">未选择 ASS</option>';

  if (subs.length) {
    const next = Number.isInteger(previous) && previous >= 0 && previous < subs.length ? previous : 0;
    previewSubtitleSelect.value = String(next);
  }

  previewSubtitleSelect.disabled = !subs.length;
  previewRefreshBtn.disabled = !(videoInput.files[0] && subs.length);
}


async function buildPreviewAss(track, fontFiles) {
  const { text } = await readAssText(track.file);
  if ((fontMode.value || 'preserve') !== 'force' || !fontFiles.length) return text;
  const descriptors = await readFontDescriptors(fontFiles[0]);
  return forceAssFontFamily(text, descriptors[0].family);
}

async function refreshSubtitlePreview() {
  if (isBusy()) return;

  const video = videoInput.files[0];
  const subs = selectedSubtitleFiles();
  const selectedIndex = Number(previewSubtitleSelect?.value || 0);
  const track = subs[selectedIndex];
  const fontFiles = selectedFonts();

  await destroySubtitlePreview();
  const generation = previewGeneration;
  syncPreviewControls();

  if (!video || !track) {
    previewStatus.textContent = '等待视频与 ASS；不会自动加载预览。';
    previewEmpty?.classList.remove('hidden');
    return;
  }

  previewing = true;
  cancelRequested = false;
  updateUI();
  previewRefreshBtn.disabled = true;

  const prefix = taskPrefix();
  const mountPoint = `/${prefix}-preview-input`;
  const inputPath = `${mountPoint}/${video.name}`;
  const assPath = `/${prefix}-preview.ass`;
  const fontDir = `/${prefix}-preview-fonts`;
  const basePath = `/${prefix}-preview-base.png`;
  const outputPath = `/${prefix}-preview-sub.png`;
  let mounted = false;

  try {
    previewStatus.textContent = '正在加载 FFmpeg 并提取字幕所在画面……';
    previewEmpty?.classList.remove('hidden');
    await loadFFmpeg();
    if (cancelRequested || generation !== previewGeneration) return;

    const sourceAss = await buildPreviewAss({ file: track }, fontFiles);
    const previewTime = choosePreviewFrameTime(sourceAss);
    const previewCenter = 0.5;
    const shiftedAss = shiftAssForPreview(sourceAss, Math.max(0, previewTime - previewCenter));

    await ffmpeg.createDir(mountPoint);
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [video] }, mountPoint);
    mounted = true;
    await ffmpeg.createDir(fontDir);

    await Promise.all(fontFiles.map(async (font, index) => {
      const suffix = ext(font.name) || '.font';
      await ffmpeg.writeFile(`${fontDir}/font-${index}${suffix}`, await fetchFile(font));
    }));
    await ffmpeg.writeFile(assPath, new TextEncoder().encode(shiftedAss));

    previewStatus.textContent = `正在提取 ${previewTime.toFixed(2)} s 视频帧……`;
    const extractCode = await ffmpeg.exec([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', previewTime.toFixed(3),
      '-i', inputPath,
      '-an', '-sn',
      '-frames:v', '1',
      basePath,
    ]);
    if (extractCode !== 0) throw new Error(`视频帧提取失败（FFmpeg 返回 ${extractCode}）`);

    previewStatus.textContent = '正在用 libass 渲染字幕到预览帧……';
    const filter = `ass=${assPath}:fontsdir=${fontDir}`;
    const renderCode = await ffmpeg.exec([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-loop', '1',
      '-framerate', '10',
      '-i', basePath,
      '-vf', filter,
      '-ss', previewCenter.toFixed(3),
      '-frames:v', '1',
      outputPath,
    ]);
    if (renderCode !== 0) throw new Error(`libass 预览渲染失败（FFmpeg 返回 ${renderCode}）`);

    const bytes = await ffmpeg.readFile(outputPath);
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('预览 PNG 没有生成。');
    if (generation !== previewGeneration) return;

    clearPreviewImage();
    previewImageURL = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    previewImage.src = previewImageURL;
    previewEmpty?.classList.add('hidden');
    previewStatus.textContent = `预览帧：${track.name} · ${previewTime.toFixed(2)} s · FFmpeg/libass`;
  } catch (error) {
    if (generation !== previewGeneration) return;
    clearPreviewImage();
    previewEmpty?.classList.remove('hidden');
    previewStatus.textContent = `无法生成预览帧：${error?.message || error}`;
    logEl.textContent += `PREVIEW ERROR: ${error?.stack || error}\n`;
  } finally {
    await removeQuietly(outputPath);
    await removeQuietly(basePath);
    await removeQuietly(assPath);
    if (loaded) {
      for (let index = 0; index < fontFiles.length; index += 1) {
        const suffix = ext(fontFiles[index].name) || '.font';
        await removeQuietly(`${fontDir}/font-${index}${suffix}`);
      }
      if (mounted) {
        try { await ffmpeg.unmount(mountPoint); } catch {}
      }
      try { await ffmpeg.deleteDir(fontDir); } catch {}
      try { await ffmpeg.deleteDir(mountPoint); } catch {}
    }
    previewing = false;
    updateUI();
    syncPreviewControls();
  }
}

async function runProbe(path, probePath, { decodeStreams = false } = {}) {
  await removeQuietly(probePath);
  const code = await ffmpeg.ffprobe(
    buildProbeArgs(path, probePath, { decodeStreams })
  );

  // @ffmpeg/core 0.12.10 is known to sometimes report ffprobe ret=-1 even
  // when ffprobe successfully wrote the requested output file. Treat the
  // generated JSON as the source of truth; only fail when it is missing or
  // invalid. This also gives us a real E2E assertion instead of trusting the
  // wrapper return code alone.
  let raw;
  try {
    raw = await ffmpeg.readFile(probePath);
  } catch (readError) {
    const mode = decodeStreams ? '完整 stream-info' : '结构探测';
    throw new Error(`ffprobe 未生成结果（返回 ${code}，${mode}）：${readError?.message || readError}`);
  }

  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch (parseError) {
    throw new Error(`ffprobe 结果不是有效 JSON（返回 ${code}）：${parseError?.message || parseError}`);
  }

  if (code !== 0) {
    logEl.textContent += `INFO: ffprobe wrapper 返回 ${code}，但结构化结果文件有效，继续使用该结果。\n`;
  }

  const streams = Array.isArray(json.streams) ? json.streams : [];

  return {
    streams,
    chapters: Array.isArray(json.chapters) ? json.chapters : [],
    format: json.format || {},
    attachmentCount: streams.filter((stream) => stream.codec_type === 'attachment').length,
    probeMode: decodeStreams ? 'decoded' : 'container',
  };
}

async function probeInput(path, probePath, { allowDecodeFallback = true } = {}) {
  try {
    return await runProbe(path, probePath, { decodeStreams: false });
  } catch (headerError) {
    if (!allowDecodeFallback) throw headerError;

    logEl.textContent += `WARNING: 容器头探测失败，将尝试完整 stream-info：${headerError?.message || headerError}\n`;
    return runProbe(path, probePath, { decodeStreams: true });
  }
}

function streamLabel(stream) {
  const type = stream.codec_type === 'audio' ? '音频' : '字幕';
  const language = stream.tags?.language || 'und';
  const title = stream.tags?.title || '';
  const codec = stream.codec_name || 'unknown';
  return `${type} #${stream.index} · ${codec} · ${language}${title ? ` · ${title}` : ''}`;
}

function trackKindLabel(type) {
  return type === 'audio' ? '音频' : '字幕';
}

function selectedTracks(type) {
  if (!trackState) return [];
  return trackState.tracks
    .filter((track) => track.type === type && track.include)
    .sort((a, b) => a.order - b.order);
}

function moveTrack(track, delta) {
  if (!trackState) return;
  const peers = trackState.tracks
    .filter((item) => item.type === track.type && item.include)
    .sort((a, b) => a.order - b.order);
  const currentIndex = peers.findIndex((item) => item.index === track.index);
  const targetIndex = currentIndex + delta;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= peers.length) return;

  const other = peers[targetIndex];
  const temp = track.order;
  track.order = other.order;
  other.order = temp;
}

function selectedOriginalAttachments() {
  return trackState?.attachments?.filter((item) => item.include) || [];
}

const VOLATILE_FORMAT_TAGS = new Set([
  'encoder',
  'major_brand',
  'minor_version',
  'compatible_brands',
]);

function preservableFormatTags(tags) {
  return Object.fromEntries(
    Object.entries(tags || {})
      .filter(([key]) => !VOLATILE_FORMAT_TAGS.has(String(key).toLowerCase()))
      .map(([key, value]) => [String(key).toLowerCase(), value])
  );
}

function attachmentNameConflicts(items) {
  const counts = new Map();
  for (const item of items) {
    const name = String(item.filename || '').trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('en-US');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function defaultConflictWarnings() {
  const warnings = [];
  const audioDefaultCount =
    selectedTracks('audio').filter((track) => track.default).length +
    externalAudioState.filter((track) => track.default).length;
  const subtitleDefaultCount =
    selectedTracks('subtitle').filter((track) => track.default).length +
    newSubtitleState.filter((track) => track.default).length;

  if (audioDefaultCount > 1) {
    warnings.push(`存在 ${audioDefaultCount} 条 Default 音频轨；播放器行为可能不一致。`);
  }
  if (subtitleDefaultCount > 1) {
    warnings.push(`存在 ${subtitleDefaultCount} 条 Default 字幕轨；建议只保留一个 Default。`);
  }

  return warnings;
}

function buildMuxPlan() {
  const video = videoInput.files[0];
  const fonts = selectedFonts();
  const mode = fontMode.value || 'preserve';
  const entries = [];
  const warnings = defaultConflictWarnings();

  if (video) {
    entries.push({
      kind: '视频',
      title: video.name,
      meta: '原视频轨 · stream copy',
      flags: '',
    });
  }

  if (video) {
    if (trackState) {
      const tags = preservableFormatTags(trackState.format?.tags || {});
      const chapterCount = trackState.chapters?.length || 0;
      entries.push({
        kind: '章节',
        title: chapterCount ? `${chapterCount} 个 Chapter` : '无 Chapter',
        meta: '保留源章节 · map_chapters 0',
        flags: 'copy',
      });
      entries.push({
        kind: '元数据',
        title: trackState.format?.tags?.title || `${Object.keys(tags).length} 个全局 tag`,
        meta: `保留全局 metadata · ${Object.keys(tags).length} 个可审计 tag · map_metadata 0`,
        flags: 'copy',
      });
    } else {
      entries.push({
        kind: '容器',
        title: 'Chapters / 全局 metadata',
        meta: '执行时从源容器读取并保留',
        flags: 'copy',
      });
    }
  }

  if (trackState) {
    selectedTracks('audio').forEach((track, index) => {
      entries.push({
        kind: `音频 ${index + 1}`,
        title: track.title || `Audio #${track.index}`,
        meta: `${track.stream.codec_name || 'unknown'} · ${normalizeTrackLanguage(track.language)} · source #${track.index}`,
        flags: dispositionValue(track.default, false, track),
      });
    });
  } else if (video) {
    entries.push({
      kind: '音频',
      title: '全部原音频轨',
      meta: '未扫描 · 保持源顺序',
      flags: 'source',
    });
  }

  externalAudioState.forEach((track, index) => {
    entries.push({
      kind: `外部音频 ${index + 1}`,
      title: track.title || track.file.name,
      meta: `${normalizeTrackLanguage(track.language)} · ${track.file.name} · stream copy`,
      flags: dispositionValue(track.default, false, track),
    });
  });

  newSubtitleState.forEach((track, index) => {
    entries.push({
      kind: `字幕 ${index + 1}`,
      title: track.title || track.file.name,
      meta: `ASS · ${normalizeTrackLanguage(track.language)} · 新增`,
      flags: dispositionValue(track.default, track.forced, track),
    });
  });

  selectedTracks('subtitle').forEach((track, index) => {
    entries.push({
      kind: `原字幕 ${index + 1}`,
      title: track.title || `Subtitle #${track.index}`,
      meta: `${track.stream.codec_name || 'unknown'} · ${normalizeTrackLanguage(track.language)} · source #${track.index}`,
      flags: dispositionValue(track.default, track.forced, track),
    });
  });

  if (trackState) {
    selectedOriginalAttachments().forEach((item) => {
      entries.push({
        kind: '附件',
        title: item.filename || `Attachment #${item.index}`,
        meta: `${item.mimetype || item.stream.codec_name || 'attachment'} · source #${item.index}`,
        flags: '',
      });
    });
  } else if (preserveAttachments.checked) {
    entries.push({
      kind: '附件',
      title: '全部原 MKV 附件',
      meta: '未扫描 · 封装时全部保留',
      flags: '',
    });
  }

  const attachedFonts = mode === 'force' ? fonts.slice(0, 1) : fonts;
  attachedFonts.forEach((file, index) => {
    entries.push({
      kind: `字体 ${index + 1}`,
      title: file.name,
      meta: 'Matroska attachment',
      flags: '',
    });
  });

  if (trackState && selectedTracks('audio').length === 0 && externalAudioState.length === 0) {
    warnings.push('扫描后没有选择原音频，也没有外部音频；输出将没有音频。');
  }

  if (trackState) {
    const selectedAttachments = selectedOriginalAttachments();
    const duplicateNames = attachmentNameConflicts(selectedAttachments);
    if (duplicateNames.length) {
      warnings.push(`原附件存在同名输出：${duplicateNames.join('、')}；建议修改附件文件名。`);
    }

    const reserved = new Set(
      selectedAttachments
        .map((item) => String(item.filename || '').trim().toLocaleLowerCase('en-US'))
        .filter(Boolean)
    );
    const collisions = attachedFonts
      .map((file) => file.name)
      .filter((name) => reserved.has(String(name).toLocaleLowerCase('en-US')));
    if (collisions.length) {
      warnings.push(`新字体与原附件同名：${collisions.join('、')}；封装时会自动重命名新字体附件。`);
    }
  }

  return { entries, warnings };
}

function planKindClass(kind) {
  const label = String(kind || '');
  if (label.startsWith('视频')) return 'plan-video';
  if (label.includes('音频')) return 'plan-audio';
  if (label.includes('字幕')) return 'plan-subtitle';
  if (label.startsWith('字体')) return 'plan-font';
  if (label.startsWith('附件')) return 'plan-attachment';
  return '';
}

function planGroupForKind(kind) {
  const label = String(kind || '');
  if (['容器', '章节', '元数据'].some((prefix) => label.startsWith(prefix))) return '容器';
  if (label.startsWith('视频')) return '视频';
  if (label.includes('音频')) return '音频';
  if (label.includes('字幕')) return '字幕';
  if (label.startsWith('附件') || label.startsWith('字体')) return '附件';
  return '其他';
}

function groupedPlanEntries(entries) {
  const order = ['容器', '视频', '音频', '字幕', '附件', '其他'];
  const groups = new Map(order.map((name) => [name, []]));
  entries.forEach((entry) => groups.get(planGroupForKind(entry.kind))?.push(entry));
  return order
    .map((name) => ({ name, entries: groups.get(name) || [] }))
    .filter((group) => group.entries.length);
}

function renderMuxPlan() {
  if (!muxPlan || !planWarnings) return;
  const { entries, warnings } = buildMuxPlan();
  const groups = groupedPlanEntries(entries);

  muxPlan.innerHTML = groups.length
    ? groups.map((group) => `
      <section class="plan-group" data-plan-group="${escapeHtml(group.name)}">
        <div class="plan-group-head">
          <strong>${escapeHtml(group.name)}</strong>
          <span>${group.entries.length}</span>
        </div>
        <div class="plan-group-body">
          ${group.entries.map((entry) => `
            <div class="plan-row ${planKindClass(entry.kind)}">
              <span class="plan-kind">${escapeHtml(entry.kind)}</span>
              <span class="plan-main">
                <strong>${escapeHtml(entry.title)}</strong>
                <small>${escapeHtml(entry.meta)}</small>
              </span>
              <span class="plan-flags">${escapeHtml(entry.flags === '0' ? '—' : entry.flags)}</span>
            </div>`).join('')}
        </div>
      </section>`).join('')
    : '<div class="track-empty">选择文件后可预览最终 MKV 结构。</div>';

  if (warnings.length) {
    planWarnings.textContent = warnings.join(' ');
    planWarnings.classList.remove('hidden');
  } else {
    planWarnings.textContent = '';
    planWarnings.classList.add('hidden');
  }
}

function renderTrackList() {
  if (!trackState) {
    resetTrackState();
    return;
  }

  const tracks = trackState.tracks;
  if (!tracks.length) {
    trackList.innerHTML = '<div class="track-empty">未发现可管理的音频或字幕轨。</div>';
    return;
  }

  trackList.innerHTML = tracks.map((track) => {
    const forced = track.type === 'subtitle'
      ? `<label><input type="checkbox" data-track-action="forced" data-track-index="${track.index}" ${track.forced ? 'checked' : ''} ${track.include ? '' : 'disabled'}> Forced</label>`
      : '';

    return `
      <div class="track-row track-${track.type}">
        <div class="track-title">
          <strong>${escapeHtml(streamLabel(track.stream))}</strong>
          <span class="track-meta">原始 Default=${track.originalDefault ? '1' : '0'}${track.type === 'subtitle' ? ` · Forced=${track.originalForced ? '1' : '0'}` : ''}</span>
          <div class="track-edit-grid">
            <label>语言
              <input type="text" data-track-field="language" data-track-index="${track.index}" value="${escapeHtml(track.language)}" list="languageSuggestions" maxlength="35" ${track.include ? '' : 'disabled'}>
            </label>
            <label>标题
              <input type="text" data-track-field="title" data-track-index="${track.index}" value="${escapeHtml(track.title)}" maxlength="160" ${track.include ? '' : 'disabled'}>
            </label>
          </div>
        </div>
        <div class="track-controls">
          <span class="track-order">
            <button type="button" data-track-move="-1" data-track-index="${track.index}" ${track.include ? '' : 'disabled'} aria-label="上移">↑</button>
            <button type="button" data-track-move="1" data-track-index="${track.index}" ${track.include ? '' : 'disabled'} aria-label="下移">↓</button>
          </span>
          <label><input type="checkbox" data-track-action="include" data-track-index="${track.index}" ${track.include ? 'checked' : ''}> 保留</label>
          <label><input type="checkbox" data-track-action="default" data-track-index="${track.index}" ${track.default ? 'checked' : ''} ${track.include ? '' : 'disabled'}> Default</label>
          ${forced}
          <details class="track-advanced">
            <summary>高级属性</summary>
            <label><input type="checkbox" data-track-action="original" data-track-index="${track.index}" ${track.original ? 'checked' : ''} ${track.include ? '' : 'disabled'}> Original</label>
            <label><input type="checkbox" data-track-action="commentary" data-track-index="${track.index}" ${track.commentary ? 'checked' : ''} ${track.include ? '' : 'disabled'}> Commentary</label>
            <label><input type="checkbox" data-track-action="hearingImpaired" data-track-index="${track.index}" ${track.hearingImpaired ? 'checked' : ''} ${track.include ? '' : 'disabled'}> Hearing impaired</label>
          </details>
        </div>
      </div>`;
  }).join('');
  renderMuxPlan();
}

function renderAttachmentList() {
  if (!trackState) {
    attachmentList.innerHTML = '<div class="track-empty">扫描 MKV 后显示附件列表。</div>';
    return;
  }
  if (!trackState.attachments.length) {
    attachmentList.innerHTML = '<div class="track-empty">这个 MKV 没有附件。</div>';
    return;
  }

  attachmentList.innerHTML = trackState.attachments.map((item) => `
    <div class="attachment-item">
      <div class="attachment-main">
        <strong>${escapeHtml(item.filename || item.originalFilename || `Attachment #${item.index}`)}</strong>
        <span class="attachment-meta">source #${item.index} · ${escapeHtml(item.stream.codec_name || 'attachment')}</span>
        <div class="attachment-fields">
          <label>文件名
            <input type="text" data-attachment-field="filename" data-attachment-index="${item.index}" value="${escapeHtml(item.filename)}" maxlength="240" ${item.include ? '' : 'disabled'}>
          </label>
          <label>MIME
            <input type="text" data-attachment-field="mimetype" data-attachment-index="${item.index}" value="${escapeHtml(item.mimetype)}" maxlength="120" ${item.include ? '' : 'disabled'}>
          </label>
        </div>
      </div>
      <label class="attachment-select">
        <input type="checkbox" data-attachment-action="include" data-attachment-index="${item.index}" ${item.include ? 'checked' : ''}>
        保留
      </label>
    </div>
  `).join('');
}

attachmentList.addEventListener('input', (event) => {
  if (!trackState) return;
  const input = event.target.closest('input[data-attachment-field]');
  if (!input) return;
  const item = trackState.attachments.find((entry) => entry.index === Number(input.dataset.attachmentIndex));
  if (!item) return;
  item[input.dataset.attachmentField] = input.value;
  renderMuxPlan();
});

attachmentList.addEventListener('change', (event) => {
  if (!trackState) return;
  const includeInput = event.target.closest('input[data-attachment-action="include"]');
  const fieldInput = event.target.closest('input[data-attachment-field]');
  const target = includeInput || fieldInput;
  if (!target) return;

  const item = trackState.attachments.find((entry) => entry.index === Number(target.dataset.attachmentIndex));
  if (!item) return;

  if (includeInput) {
    item.include = includeInput.checked;
    preserveAttachments.checked = trackState.attachments.length > 0 && trackState.attachments.every((entry) => entry.include);
    renderAttachmentList();
  } else {
    item[fieldInput.dataset.attachmentField] = fieldInput.value;
  }
  renderMuxPlan();
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

trackList.addEventListener('change', (event) => {
  if (!trackState) return;
  const actionInput = event.target.closest('input[data-track-action]');
  const fieldInput = event.target.closest('input[data-track-field]');
  const target = actionInput || fieldInput;
  if (!target) return;

  const index = Number(target.dataset.trackIndex);
  const track = trackState.tracks.find((item) => item.index === index);
  if (!track) return;

  if (actionInput) {
    const action = actionInput.dataset.trackAction;
    track[action] = actionInput.checked;
    if (action === 'include' && !actionInput.checked) {
      track.default = false;
      track.forced = false;
      track.original = false;
      track.commentary = false;
      track.hearingImpaired = false;
    }
    renderTrackList();
    return;
  }

  // Text fields are already synchronized on the input event. Re-rendering the
  // whole track list on blur/change can replace a sibling field while the user
  // is moving focus to it, causing the next edit to be lost.
  track[fieldInput.dataset.trackField] = fieldInput.value;
  renderMuxPlan();
});

trackList.addEventListener('input', (event) => {
  if (!trackState) return;
  const input = event.target.closest('input[data-track-field]');
  if (!input) return;
  const track = trackState.tracks.find((item) => item.index === Number(input.dataset.trackIndex));
  if (!track) return;
  track[input.dataset.trackField] = input.value;
  renderMuxPlan();
});

trackList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-track-move]');
  if (!button || !trackState) return;
  const track = trackState.tracks.find((item) => item.index === Number(button.dataset.trackIndex));
  if (!track) return;
  moveTrack(track, Number(button.dataset.trackMove));
  renderTrackList();
});

scanTracksBtn.addEventListener('click', async () => {
  const video = videoInput.files[0];
  if (!video || ext(video.name) !== '.mkv' || isBusy()) return;

  scanning = true;
  cancelRequested = false;
  updateUI();
  logEl.textContent = '';
  bar.style.width = '4%';

  const prefix = taskPrefix();
  const videoPath = `${prefix}-scan.mkv`;
  const probePath = `${prefix}-tracks.json`;

  try {
    await loadFFmpeg();
    if (cancelRequested) return;

    status.textContent = '正在载入 MKV 并扫描轨道……';
    await ffmpeg.writeFile(videoPath, await fetchFile(video));
    const probe = await probeInput(videoPath, probePath);
    if (cancelRequested) return;

    const tracks = probe.streams
      .filter((stream) => ['audio', 'subtitle'].includes(stream.codec_type))
      .map((stream) => ({
        index: stream.index,
        type: stream.codec_type,
        stream,
        include: stream.codec_type === 'audio',
        language: stream.tags?.language || 'und',
        title: stream.tags?.title || '',
        order: stream.index,
        default: Boolean(stream.disposition?.default),
        forced: Boolean(stream.disposition?.forced),
        original: Boolean(stream.disposition?.original),
        commentary: Boolean(stream.disposition?.comment),
        hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
        originalLanguage: stream.tags?.language || 'und',
        originalTitle: stream.tags?.title || '',
        originalDefault: Boolean(stream.disposition?.default),
        originalForced: Boolean(stream.disposition?.forced),
        originalOriginal: Boolean(stream.disposition?.original),
        originalCommentary: Boolean(stream.disposition?.comment),
        originalHearingImpaired: Boolean(stream.disposition?.hearing_impaired),
      }));

    const attachments = probe.streams
      .filter((stream) => stream.codec_type === 'attachment')
      .map((stream) => ({
        index: stream.index,
        stream,
        filename: stream.tags?.filename || '',
        mimetype: stream.tags?.mimetype || '',
        originalFilename: stream.tags?.filename || '',
        originalMimetype: stream.tags?.mimetype || '',
        include: false,
      }));

    trackState = {
      fileKey: fileKey(video),
      tracks,
      attachments,
      chapters: probe.chapters,
      format: probe.format,
      attachmentCount: probe.attachmentCount,
    };

    preserveAttachments.checked = false;
    trackBulkTools?.classList.remove('hidden');
    attachmentBulkTools?.classList.toggle('hidden', !attachments.length);
    renderTrackList();
    renderAttachmentList();
    bar.style.width = '0%';
    status.textContent = `轨道扫描完成：${tracks.filter((x) => x.type === 'audio').length} 条音频，${tracks.filter((x) => x.type === 'subtitle').length} 条字幕，${attachments.length} 个附件。`;
  } catch (err) {
    if (cancelRequested || String(err?.message || err).includes('terminate')) {
      status.textContent = '轨道扫描已取消。';
    } else {
      logEl.textContent += `ERROR: ${err?.stack || err}\n`;
      status.textContent = formatOperationError(err, {
        phase: 'scan',
        logText: logEl.textContent,
      });
    }
    bar.style.width = '0%';
  } finally {
    if (loaded) {
      await removeQuietly(videoPath);
      await removeQuietly(probePath);
    }
    scanning = false;
    cancelRequested = false;
    updateUI();
  }
});

function mimeForFont(file) {
  const suffix = ext(file.name);
  if (suffix === '.ttc' || suffix === '.otc') return 'font/collection';
  return suffix === '.otf' ? 'font/otf' : 'font/ttf';
}

function charPreview(chars, limit = 24) {
  const values = chars.slice(0, limit).map((char) => (
    `${char}(U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`
  ));
  return values.join(' ') + (chars.length > limit ? ' …' : '');
}

function faceLabel(face) {
  return `${face.name} [w${face.weight || 400}${face.italic ? ', italic' : ''}]`;
}

function reportFontFamilyCompleteness(uploadedFonts) {
  const groups = new Map();

  for (const item of uploadedFonts) {
    const family = item.descriptor.family || item.file.name;
    const key = family.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    let group = groups.get(key);
    if (!group) {
      group = { family, faces: new Set(), files: [] };
      groups.set(key, group);
    }

    const bold = Boolean(item.descriptor.bold);
    const italic = Boolean(item.descriptor.italic);
    const face = bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
    group.faces.add(face);
    group.files.push(item.file.name);
  }

  for (const group of groups.values()) {
    const expected = ['Regular', 'Bold', 'Italic', 'Bold Italic'];
    const missing = expected.filter((face) => !group.faces.has(face));
    logEl.textContent += `字体家族：${group.family} · 已有 ${[...group.faces].join(', ')}${missing.length ? ` · 缺 ${missing.join(', ')}` : ' · 四种基础 face 齐全'}\n`;
  }
}

async function analyzePreservedFonts(analysis, uploadedFonts) {
  const usedUploaded = new Set();
  const missingFamilies = [];
  const faceFallbacks = [];
  const missingGlyphGroups = [];

  logEl.textContent += `ASS 实际使用字体 face：${analysis.usedFonts.length}；样式声明 face：${analysis.declaredFonts.length}\n`;

  for (const required of analysis.usedFonts) {
    const candidates = uploadedFonts
      .map((item) => ({ item, match: scoreFontFaceMatch(required, item.descriptor) }))
      .filter((entry) => entry.match.matched)
      .sort((a, b) => b.match.score - a.match.score);

    if (!candidates.length) {
      missingFamilies.push(faceLabel(required));
      logEl.textContent += `WARNING: ASS 字体依赖未满足：“${faceLabel(required)}”（来源：${required.sources.join(', ') || 'Dialogue'}）\n`;
      continue;
    }

    const bestScore = candidates[0].match.score;
    const bestCandidates = candidates.filter((entry) => entry.match.score >= bestScore - 20);
    const styleExact = bestCandidates.some((entry) => entry.match.styleExact);

    if (!styleExact) {
      faceFallbacks.push(faceLabel(required));
      logEl.textContent += `WARNING: 找到字体家族，但没有精确 face：“${faceLabel(required)}”；将使用最接近的 ${bestCandidates.map((entry) => entry.item.file.name).join('、')}\n`;
    }

    for (const entry of bestCandidates) usedUploaded.add(entry.item.index);

    logEl.textContent += `字体 face 映射：“${faceLabel(required)}” -> ${bestCandidates.map((entry) => `${entry.item.file.name} [w${entry.item.descriptor.weight}${entry.item.descriptor.italic ? ', italic' : ''}]`).join('、')}\n`;

    if (!required.characters.length) continue;

    let remaining = [...required.characters];
    let successfulChecks = 0;

    for (const entry of bestCandidates) {
      if (!remaining.length) break;
      try {
        const result = await checkFontCharacters(entry.item.file, remaining, entry.item.descriptor.collectionIndex);
        const missing = new Set(result.missing);
        remaining = remaining.filter((char) => missing.has(char));
        successfulChecks += 1;
      } catch (error) {
        logEl.textContent += `WARNING: 无法检查“${entry.item.file.name}”的字形覆盖：${error?.message || error}\n`;
      }
    }

    if (successfulChecks > 0 && remaining.length) {
      missingGlyphGroups.push({ font: faceLabel(required), characters: remaining });
      logEl.textContent += `WARNING: “${faceLabel(required)}”仍缺少 ${remaining.length} 个实际字幕字符：${charPreview(remaining)}\n`;
    } else if (successfulChecks > 0) {
      logEl.textContent += `字形覆盖通过：“${faceLabel(required)}”的 ${required.characters.length} 个实际字幕字符均有匹配 face 覆盖。\n`;
    }
  }

  const unused = uploadedFonts.filter((item) => !usedUploaded.has(item.index));
  if (unused.length) {
    logEl.textContent += `INFO: ${unused.length} 个上传字体未匹配到当前 ASS 的实际 face，但仍会作为附件封装：${unused.map((item) => item.file.name).join('、')}\n`;
  }

  return { missingFamilies, faceFallbacks, missingGlyphGroups };
}

function getScannedSelection(video) {
  if (!trackState || trackState.fileKey !== fileKey(video)) return null;
  return trackState;
}

cancelBtn.addEventListener('click', () => {
  if (!isBusy()) return;
  cancelRequested = true;
  status.textContent = '正在取消当前操作……';
  logEl.textContent += 'CANCEL: 用户请求终止当前操作。\n';
  ffmpeg.terminate();
  loaded = false;
});

muxBtn.addEventListener('click', async () => {
  if (isBusy()) return;

  syncNewTrackState();
  const video = videoInput.files[0];
  const fontFiles = selectedFonts();
  const subtitleTracks = newSubtitleState;
  const externalAudioTracks = externalAudioState;
  if (!video || !subtitleTracks.length || !fontFiles.length) return;

  const videoExt = ext(video.name);
  const invalidSubtitle = subtitleTracks.find((track) => ext(track.file.name) !== '.ass');
  const invalidFont = fontFiles.find((file) => !['.ttf', '.otf', '.ttc', '.otc'].includes(ext(file.name)));
  const mode = fontMode.value || 'preserve';
  const scanned = getScannedSelection(video);
  const preserveAllOriginalAttachments = !scanned
    && preserveAttachments.checked
    && videoExt === '.mkv';

  if (!['.mp4', '.mkv', '.webm', '.mov', '.m4v'].includes(videoExt)) {
    status.textContent = '请选择 MP4 / MKV / WebM / MOV / M4V 视频文件。';
    return;
  }
  if (invalidSubtitle) {
    status.textContent = `字幕“${invalidSubtitle.file.name}”不是 .ass 文件。`;
    return;
  }
  if (invalidFont) {
    status.textContent = `字体“${invalidFont.name}”不是 .ttf / .otf / .ttc / .otc 文件。`;
    return;
  }

  running = true;
  cancelRequested = false;
  updateUI();
  downloadLink.classList.add('hidden');
  reportLink.classList.add('hidden');
  auditResult.className = 'audit-result hidden';
  auditResult.textContent = '';
  logEl.textContent = '';
  bar.style.width = '4%';

  if (outputURL) {
    URL.revokeObjectURL(outputURL);
    outputURL = null;
  }
  if (reportURL) {
    URL.revokeObjectURL(reportURL);
    reportURL = null;
  }

  const prefix = taskPrefix();
  const videoPath = `${prefix}-input${videoExt}`;
  const outputPath = `${prefix}-output.mkv`;
  const probePath = `${prefix}-probe.json`;
  const auditPath = `${prefix}-audit.json`;
  const outputName = safeOutputName(video.name);
  const fontPaths = [];
  const audioPaths = [];
  const subtitlePaths = [];
  const extraProbePaths = [];

  try {
    status.textContent = '正在解析 ASS 与字体 face……';
    bar.style.width = '10%';

    const fontDedupe = await dedupeFilesBySha256(fontFiles);
    const initialReservedAttachmentNames = scanned
      ? selectedOriginalAttachments().map((item) => item.filename).filter(Boolean)
      : [];
    const uniqueFontItems = assignUniqueAttachmentNames(fontDedupe.unique, initialReservedAttachmentNames);
    const descriptorGroups = await Promise.all(uniqueFontItems.map(async (item, attachmentIndex) => {
      const faces = await readFontDescriptors(item.file);
      return faces.map((descriptor, faceIndex) => ({
        ...item,
        index: `${attachmentIndex}:${faceIndex}`,
        attachmentIndex,
        descriptor,
      }));
    }));
    const descriptors = descriptorGroups.flat();

    if (fontDedupe.duplicates.length) {
      logEl.textContent += `INFO: 检测到 ${fontDedupe.duplicates.length} 个内容完全相同的重复字体，按 SHA-256 去重，不重复写入 MKV：${fontDedupe.duplicates.map((item) => item.file.name).join('、')}\n`;
    }
    for (const item of descriptors) {
      const attachmentRename = item.attachmentName !== item.file.name ? ` -> attachment “${item.attachmentName}”` : '';
      const collectionFace = item.descriptor.collectionIndex == null ? '' : ` · collection face #${item.descriptor.collectionIndex}`;
      logEl.textContent += `上传字体：${item.file.name}${attachmentRename} -> Family “${item.descriptor.family}” / ${item.descriptor.subfamily || 'Regular'} / weight ${item.descriptor.weight}${item.descriptor.italic ? ' / italic' : ''}${collectionFace}\n`;
    }
    reportFontFamilyCompleteness(descriptors);

    let attachments = uniqueFontItems;
    let completionNote = '';
    let dependencyWarningCount = 0;
    const preparedSubtitles = [];

    for (let index = 0; index < subtitleTracks.length; index += 1) {
      const track = subtitleTracks[index];
      const { text: sourceAss, encoding } = await readAssText(track.file);
      const analysis = analyzeAssFontUsage(sourceAss);
      let outputAss = sourceAss;

      logEl.textContent += `ASS #${index + 1}：${track.file.name} · 编码 ${encoding}\n`;

      if (mode === 'force') {
        const primary = descriptors[0];
        outputAss = forceAssFontFamily(sourceAss, primary.descriptor.family);
        attachments = [uniqueFontItems[primary.attachmentIndex]];

        try {
          const coverage = await checkFontCharacters(primary.file, analysis.allCharacters, primary.descriptor.collectionIndex);
          if (coverage.missing.length) {
            dependencyWarningCount += 1;
            logEl.textContent += `WARNING: ASS #${index + 1} 强制字体缺少 ${coverage.missing.length}/${coverage.checkedCount} 个唯一字幕字符：${charPreview(coverage.missing)}\n`;
          }
        } catch (coverageError) {
          logEl.textContent += `WARNING: ASS #${index + 1} 无法完成字体缺字检查：${coverageError?.message || coverageError}\n`;
        }
      } else {
        const dependencyResult = await analyzePreservedFonts(analysis, descriptors);
        dependencyWarningCount +=
          dependencyResult.missingFamilies.length +
          dependencyResult.faceFallbacks.length +
          dependencyResult.missingGlyphGroups.length;
      }

      preparedSubtitles.push({
        ...track,
        encoding,
        outputAss,
      });
    }

    if (mode === 'force' && uniqueFontItems.length > 1) {
      logEl.textContent += `INFO: 强制字体模式只使用第一个字体文件；其余 ${uniqueFontItems.length - 1} 个上传字体文件不会附加。\n`;
    }
    if (dependencyWarningCount) {
      completionNote = `；字体检查存在 ${dependencyWarningCount} 组警告`;
    }

    await loadFFmpeg();
    if (cancelRequested) return;

    status.textContent = '正在把文件载入浏览器内存……';
    bar.style.width = '20%';

    await ffmpeg.writeFile(videoPath, await fetchFile(video));

    for (let index = 0; index < externalAudioTracks.length; index += 1) {
      const track = externalAudioTracks[index];
      const path = `${prefix}-audio-${index}${ext(track.file.name) || '.bin'}`;
      audioPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(track.file));
    }

    for (let index = 0; index < preparedSubtitles.length; index += 1) {
      const path = `${prefix}-subtitle-${index}.ass`;
      subtitlePaths.push(path);
      await ffmpeg.writeFile(path, new TextEncoder().encode(preparedSubtitles[index].outputAss));
    }

    for (let index = 0; index < attachments.length; index += 1) {
      const item = attachments[index];
      const path = `${prefix}-font-${index}${ext(item.file.name)}`;
      fontPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(item.file));
    }
    if (cancelRequested) return;

    status.textContent = '正在读取输入容器结构……';
    const inputProbe = await probeInput(videoPath, probePath);
    const originalAttachmentCount = inputProbe.attachmentCount;
    const sourceVideos = inputProbe.streams.filter((stream) => stream.codec_type === 'video');
    const sourceAudios = inputProbe.streams.filter((stream) => stream.codec_type === 'audio');
    const sourceAttachments = inputProbe.streams.filter((stream) => stream.codec_type === 'attachment');

    const selectedAudio = scanned ? selectedTracks('audio') : null;
    const selectedSubtitles = scanned ? selectedTracks('subtitle') : [];
    const originalAttachments = scanned ? selectedOriginalAttachments() : [];

    const reservedAttachmentNames = scanned
      ? originalAttachments.map((item) => item.filename).filter(Boolean)
      : (preserveAllOriginalAttachments
          ? sourceAttachments.map((stream) => String(stream.tags?.filename || '')).filter(Boolean)
          : []);
    const renamedFontItems = assignUniqueAttachmentNames(uniqueFontItems, reservedAttachmentNames);
    renamedFontItems.forEach((named, index) => {
      if (uniqueFontItems[index].attachmentName !== named.attachmentName) {
        logEl.textContent += `INFO: 新字体附件与原附件重名，“${uniqueFontItems[index].attachmentName}”自动改为“${named.attachmentName}”。\n`;
      }
      uniqueFontItems[index].attachmentName = named.attachmentName;
    });

    const runtimeExternalAudio = [];
    for (let index = 0; index < externalAudioTracks.length; index += 1) {
      const probeOutput = `${prefix}-audio-${index}-probe.json`;
      extraProbePaths.push(probeOutput);
      const probe = await probeInput(audioPaths[index], probeOutput);
      const audioStream = probe.streams.find((stream) => stream.codec_type === 'audio');
      if (!audioStream) {
        throw new Error(`外部音频“${externalAudioTracks[index].file.name}”没有可用音频轨。`);
      }
      runtimeExternalAudio.push({
        ...externalAudioTracks[index],
        path: audioPaths[index],
        inputIndex: 1 + index,
        codec: audioStream.codec_name || '',
      });
    }

    const subtitleInputOffset = 1 + runtimeExternalAudio.length;
    const runtimeSubtitles = preparedSubtitles.map((track, index) => ({
      ...track,
      path: subtitlePaths[index],
      inputIndex: subtitleInputOffset + index,
    }));

    if (scanned) {
      logEl.textContent += `轨道方案：原音频 ${selectedAudio.length}/${scanned.tracks.filter((x) => x.type === 'audio').length}，外部音频 ${runtimeExternalAudio.length}，新增 ASS ${runtimeSubtitles.length}，原字幕 ${selectedSubtitles.length}/${scanned.tracks.filter((x) => x.type === 'subtitle').length}，原附件 ${originalAttachments.length}/${scanned.attachments.length}。\n`;
    } else if (videoExt === '.mkv') {
      logEl.textContent += `INFO: 未扫描轨道，按兼容模式保留所有原音频、不保留原字幕；原附件${preserveAllOriginalAttachments ? '全部保留' : '不保留'}。\n`;
    }

    status.textContent = '正在无损封装 MKV……';
    bar.style.width = '40%';

    const fontAttachments = attachments.map((item, index) => ({
      path: fontPaths[index],
      mimeType: mimeForFont(item.file),
      filename: item.attachmentName,
    }));

    const args = buildMuxCommand({
      mainInputPath: videoPath,
      outputPath,
      sourceAudioCount: sourceAudios.length,
      originalAudioTracks: selectedAudio,
      externalAudioTracks: runtimeExternalAudio,
      newSubtitleTracks: runtimeSubtitles,
      originalSubtitleTracks: selectedSubtitles,
      originalAttachments,
      preserveAllOriginalAttachments,
      originalAttachmentCount,
      fontAttachments,
    });

    const code = await ffmpeg.exec(args);
    if (cancelRequested) return;
    if (code !== 0) throw new Error(`FFmpeg 返回错误代码 ${code}`);

    status.textContent = '正在审计输出 MKV……';
    bar.style.width = '94%';

    const expectedAudio = [
      ...(selectedAudio
        ? selectedAudio.map((track) => ({
            codec: track.stream.codec_name || '',
            language: normalizeTrackLanguage(track.language),
            title: track.title || '',
            default: track.default,
            original: track.original,
            commentary: track.commentary,
            hearingImpaired: track.hearingImpaired,
          }))
        : sourceAudios.map((stream) => ({
            codec: stream.codec_name || '',
            language: normalizeTrackLanguage(stream.tags?.language),
            title: stream.tags?.title || '',
            default: Boolean(stream.disposition?.default),
            original: Boolean(stream.disposition?.original),
            commentary: Boolean(stream.disposition?.comment),
            hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
          }))),
      ...runtimeExternalAudio.map((track) => ({
        codec: track.codec,
        language: normalizeTrackLanguage(track.language),
        title: track.title || '',
        default: track.default,
        original: track.original,
        commentary: track.commentary,
        hearingImpaired: track.hearingImpaired,
      })),
    ];

    const expectedOriginalAttachments = scanned
      ? originalAttachments.map((item) => ({
          filename: item.filename || '',
          mimetype: item.mimetype || '',
        }))
      : (preserveAllOriginalAttachments
          ? sourceAttachments.map((stream) => ({
              filename: String(stream.tags?.filename || ''),
              mimetype: String(stream.tags?.mimetype || ''),
            }))
          : []);
    const expectedOriginalAttachmentNames = expectedOriginalAttachments
      .map((item) => item.filename)
      .filter(Boolean);
    const expectedFontAttachments = attachments.map((item) => ({
      filename: item.attachmentName,
      mimetype: mimeForFont(item.file),
    }));

    const expectedAudit = {
      video: sourceVideos.map((stream) => ({ codec: stream.codec_name || '' })),
      audio: expectedAudio,
      subtitles: [
        ...runtimeSubtitles.map((track) => ({
          codec: 'ass',
          language: normalizeTrackLanguage(track.language),
          title: track.title || '',
          default: track.default,
          forced: track.forced,
          original: track.original,
          commentary: track.commentary,
          hearingImpaired: track.hearingImpaired,
        })),
        ...selectedSubtitles.map((track) => ({
          codec: track.stream.codec_name || '',
          language: normalizeTrackLanguage(track.language),
          title: track.title || '',
          default: track.default,
          forced: track.forced,
          original: track.original,
          commentary: track.commentary,
          hearingImpaired: track.hearingImpaired,
        })),
      ],
      chapterCount: inputProbe.chapters.length,
      formatTitle: inputProbe.format?.tags?.title || '',
      formatTags: preservableFormatTags(inputProbe.format?.tags || {}),
      attachmentCount: expectedOriginalAttachments.length + expectedFontAttachments.length,
      attachments: [...expectedOriginalAttachments, ...expectedFontAttachments],
      attachmentFilenames: expectedOriginalAttachmentNames,
      newFontFilenames: attachments.map((item) => item.attachmentName),
    };

    let finalAudit = null;

    try {
      const auditProbe = await probeInput(outputPath, auditPath, {
        allowDecodeFallback: false,
      });
      const audit = auditMuxProbe(auditProbe, expectedAudit);
      finalAudit = {
        status: audit.ok ? 'pass' : 'warning',
        ...audit,
      };
      if (audit.ok) {
        const auditText = `封装后审计通过：${audit.counts.video} 视频 / ${audit.counts.audio} 音频 / ${audit.counts.subtitle} 字幕 / ${audit.counts.attachment} 附件 / ${audit.counts.chapter} 章节。`;
        logEl.textContent += `AUDIT: ${auditText}\n`;
        auditResult.textContent = auditText;
        auditResult.className = 'audit-result';
      } else {
        const auditText = `封装后审计发现 ${audit.issues.length} 项偏差：${audit.issues.join('；')}`;
        logEl.textContent += `AUDIT WARNING: 输出与计划存在 ${audit.issues.length} 项偏差：\n- ${audit.issues.join('\n- ')}\n`;
        auditResult.textContent = auditText;
        auditResult.className = 'audit-result warn';
        completionNote += `；封装后审计发现 ${audit.issues.length} 项偏差`;
      }
    } catch (auditError) {
      const reason = auditError?.message || String(auditError);
      const auditText = `封装已完成，但 ffprobe 审计不可用：${reason}`;
      logEl.textContent += `AUDIT WARNING: ${auditText}。已保留 MKV 输出，不把审计工具限制当作封装失败。\n`;
      auditResult.textContent = auditText;
      auditResult.className = 'audit-result warn';
      completionNote += '；封装后审计未完成（不影响已生成 MKV）';
      finalAudit = {
        status: 'unavailable',
        reason,
        ok: false,
        issues: [reason],
      };
    }

    status.textContent = '正在准备保存……';
    bar.style.width = '96%';

    const data = await ffmpeg.readFile(outputPath);
    const outputSha256 = await sha256Hex(data);
    outputURL = URL.createObjectURL(
      new Blob([data.buffer], { type: 'video/x-matroska' })
    );

    const report = createMuxReport({
      appVersion: '1.0.2',
      input: {
        name: video.name,
        sizeBytes: video.size,
        format: inputProbe.format?.format_name || '',
        formatTitle: inputProbe.format?.tags?.title || '',
        formatTags: preservableFormatTags(inputProbe.format?.tags || {}),
        videoCodecs: sourceVideos.map((stream) => stream.codec_name || 'unknown'),
        audioCodecs: sourceAudios.map((stream) => stream.codec_name || 'unknown'),
        chapterCount: inputProbe.chapters.length,
        chapters: inputProbe.chapters.map((chapter) => ({
          id: chapter.id,
          startTime: chapter.start_time,
          endTime: chapter.end_time,
          title: chapter.tags?.title || '',
          language: chapter.tags?.language || '',
        })),
        attachmentCount: originalAttachmentCount,
        selectedOriginalAttachments: expectedOriginalAttachments,
      },
      subtitle: {
        tracks: runtimeSubtitles.map((track) => ({
          name: track.file.name,
          encoding: track.encoding,
          language: normalizeTrackLanguage(track.language),
          title: track.title || '',
          default: track.default,
          forced: track.forced,
          original: track.original,
          commentary: track.commentary,
          hearingImpaired: track.hearingImpaired,
        })),
      },
      fonts: {
        selectedCount: fontFiles.length,
        uniqueCount: uniqueFontItems.length,
        faceCount: descriptors.length,
        duplicateCount: fontDedupe.duplicates.length,
        attachments: attachments.map((item) => ({
          sourceName: item.file.name,
          attachmentName: item.attachmentName,
          sizeBytes: item.file.size,
          sha256: item.sha256,
          mimeType: mimeForFont(item.file),
          faces: descriptors
            .filter((face) => face.attachmentIndex === uniqueFontItems.indexOf(item))
            .map((face) => ({
              family: face.descriptor.family,
              subfamily: face.descriptor.subfamily || '',
              weight: face.descriptor.weight,
              italic: Boolean(face.descriptor.italic),
              collectionIndex: face.descriptor.collectionIndex,
            })),
        })),
      },
      plan: buildMuxPlan(),
      expectedAudit,
      audit: finalAudit,
      output: {
        name: outputName,
        sizeBytes: data.byteLength,
        sha256: outputSha256,
        container: 'matroska',
        streamCopy: true,
      },
      warnings: {
        fontDependencyWarningCount: dependencyWarningCount,
        externalAudioCount: runtimeExternalAudio.length,
        originalAttachmentSelectionCount: originalAttachments.length,
      },
    });
    report.externalAudio = runtimeExternalAudio.map((track) => ({
      name: track.file.name,
      codec: track.codec,
      language: normalizeTrackLanguage(track.language),
      title: track.title || '',
      default: track.default,
      original: track.original,
      commentary: track.commentary,
      hearingImpaired: track.hearingImpaired,
    }));

    reportURL = URL.createObjectURL(
      new Blob([serializeMuxReport(report)], { type: 'application/json' })
    );

    downloadLink.href = outputURL;
    downloadLink.download = outputName;
    downloadLink.textContent = `保存成品 · ${outputName}`;
    downloadLink.setAttribute('aria-label', `保存成品 ${outputName} 到本机`);
    downloadLink.classList.remove('hidden');

    reportLink.href = reportURL;
    reportLink.download = reportFilename(outputName);
    reportLink.textContent = '保存封装报告';
    reportLink.classList.remove('hidden');

    logEl.textContent += `REPORT: 输出 SHA-256 ${outputSha256}；封装报告已生成。\n`;

    bar.style.width = '100%';
    const modeText = mode === 'force'
      ? `已强制统一 ${runtimeSubtitles.length} 条 ASS 的字体并附加 ${attachments.length} 个字体文件`
      : `已保留 ${runtimeSubtitles.length} 条 ASS 的字体并附加 ${attachments.length} 个字体文件`;
    status.textContent = `完成。${modeText}${completionNote}；共新增 ${runtimeExternalAudio.length} 条外部音频；视频/音频未重新编码。`;

    if (dependencyWarningCount) {
      logEl.textContent += `完成，但存在 ${dependencyWarningCount} 组字体 face / 字形覆盖警告。请在发布前检查日志。\n`;
    }

    videoInput.value = '';
    audioInput.value = '';
    subInput.value = '';
    externalAudioState = [];
    newSubtitleState = [];
    renderNewTrackLists();
    resetTrackState();
  } catch (err) {
    console.error(err);
    if (cancelRequested || String(err?.message || err).includes('terminate')) {
      status.textContent = '任务已取消。下次操作会重新加载 ffmpeg.wasm 核心。';
      bar.style.width = '0%';
    } else {
      logEl.textContent += `ERROR: ${err?.stack || err}\n`;
      status.textContent = formatOperationError(err, {
        phase: 'mux',
        logText: logEl.textContent,
      });
      bar.style.width = '0%';
    }
  } finally {
    if (loaded) {
      await removeQuietly(videoPath);
      for (const path of audioPaths) await removeQuietly(path);
      for (const path of subtitlePaths) await removeQuietly(path);
      for (const path of fontPaths) await removeQuietly(path);
      for (const path of extraProbePaths) await removeQuietly(path);
      await removeQuietly(outputPath);
      await removeQuietly(probePath);
      await removeQuietly(auditPath);
    }
    running = false;
    cancelRequested = false;
    updateUI();
  }
});

resetTrackState();
updateUI();
