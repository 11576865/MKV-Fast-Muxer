import './style.css';
import { setupObjectEditor } from './object-editor.js';
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { auditMuxProbe } from './mux-audit.js';
import { buildProbeArgs } from './probe-policy.js';
import {
  audioIdentityFromProbe,
  identityMismatchMessage,
  isMatroskaIdentity,
  isSupportedVideoIdentity,
  sniffFileContainer,
  sniffedVideoIdentity,
  sourceVirtualSuffix,
  videoIdentityFromProbe,
} from './media-identity.js';
import {
  COMPATIBILITY_STATE,
  compatibilityPlanMessages,
  resolveMuxCompatibility,
  summarizeCompatibility,
} from './compatibility.js';
import { buildMuxCommand, dispositionValue, normalizeTrackLanguage } from './mux-command.js';
import { assignUniqueAttachmentNames, dedupeFilesBySha256, sha256Hex } from './file-dedupe.js';
import { createMuxReport, reportFilename, serializeMuxReport } from './mux-report.js';
import { findExistingBatchOutputs, writeNewBatchOutput } from './batch-output.js';
import { createBatchResultUrlRegistry } from './batch-result-urls.js';
import { classifyBrowserWorkload, formatBytes, sumFileSizes } from './workload.js';
import { formatOperationError } from './error-feedback.js';
import {
  collectSubtitleInputs,
  identifySubtitleInputs,
  inferredSubtitleMetadata,
  isAssLikeSubtitle,
   isSupportedSubtitleFile,
  isTextSubtitle,
  subtitleFormatInfo,
  subtitleTrackKey,
  visibleTextForPlainSubtitle,
} from './subtitle-format.js';
import { subsetFontItems } from './font-subset.js';
import {
  fontIdentityMismatchMessage,
  fontMimeType,
  fontVirtualSuffix,
  identifyFontFile,
  isSupportedFontIdentity,
  normalizedFontAttachmentName,
} from './font-identity.js';
import {
  batchSubtitleSummary,
  buildBatchJobs,
  buildBatchJobsFromCollected,
  identifyBatchFonts,
  identifyBatchVideos,
  mergeFileSelections,
} from './batch.js';
import {
  analyzeAssFontUsage,
  checkFontCharacters,
  forceAssFontFamily,
  preferredAssFontFamily,
  readFontDescriptors,
  scoreFontFaceMatch,
} from './ass-font-rewrite.js';

const $ = (id) => document.getElementById(id);
setupObjectEditor(document.querySelector('.editor-grid'));

const videoInput = $('videoInput');
const videoIdentityLabel = $('videoIdentity');
const audioInput = $('audioInput');
const subInput = $('subInput');
const fontInput = $('fontInput');
const fontMode = $('fontMode');
const fontModeHint = $('fontModeHint');
const fontSubsetEnabled = $('fontSubsetEnabled');
const batchVideoInput = $('batchVideoInput');
const batchVideoFolderInput = $('batchVideoFolderInput');
const batchSubtitleInput = $('batchSubtitleInput');
const batchSubtitleFolderInput = $('batchSubtitleFolderInput');
const batchFontInput = $('batchFontInput');
const batchFontFolderInput = $('batchFontFolderInput');
const batchVideoName = $('batchVideoName');
const batchVideoFolderName = $('batchVideoFolderName');
const batchSubtitleName = $('batchSubtitleName');
const batchSubtitleFolderName = $('batchSubtitleFolderName');
const batchFontName = $('batchFontName');
const batchFontFolderName = $('batchFontFolderName');
const batchPlan = $('batchPlan');
const batchStartBtn = $('batchStartBtn');
const batchCancelBtn = $('batchCancelBtn');
const batchPreserveAttachments = $('batchPreserveAttachments');
const batchFontSubsetEnabled = $('batchFontSubsetEnabled');
const batchSubsetScope = $('batchSubsetScope');
const batchOutputDirBtn = $('batchOutputDirBtn');
const batchOutputDirStatus = $('batchOutputDirStatus');
const batchStatus = $('batchStatus');
const batchResults = $('batchResults');
const newAudioList = $('newAudioList');
const newSubtitleList = $('newSubtitleList');
const preserveAttachments = $('preserveAttachments');
const appendPreserveAll = $('appendPreserveAll');
const attachmentList = $('attachmentList');
const scanTracksBtn = $('scanTracksBtn');
const trackList = $('trackList');
const containerChangeSummary = $('containerChangeSummary');
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
const previewTimeInput = $('previewTimeInput');
const previewPrevCueBtn = $('previewPrevCueBtn');
const previewNextCueBtn = $('previewNextCueBtn');
const previewDialog = $('previewDialog');
const previewDialogImage = $('previewDialogImage');
const previewDialogClose = $('previewDialogClose');
const mobilePreviewToggle = $('mobilePreviewToggle');
const mobilePlanToggle = $('mobilePlanToggle');
const previewCard = document.querySelector('.subtitle-preview-card');
const planPanel = document.querySelector('.output-section.plan-panel');

document.documentElement.dataset.theme = 'dark';
document.documentElement.dataset.themePreference = 'dark';

const phoneLayoutQuery = window.matchMedia('(max-width: 600px)');
const tabletLayoutQuery = window.matchMedia('(min-width: 601px) and (max-width: 1359px) and (hover: none) and (pointer: coarse)');

function applyResponsiveDisclosureState() {
  if (!previewCard || !planPanel) return;

  const isPhone = phoneLayoutQuery.matches;
  const isTablet = tabletLayoutQuery.matches;
  const previewUsesDisclosure = isPhone || isTablet;

  if (previewUsesDisclosure) {
    if (!previewCard.dataset.mobileDisclosureInitialized) {
      previewCard.dataset.mobileCollapsed = 'true';
      previewCard.dataset.mobileDisclosureInitialized = 'true';
    }
  } else {
    delete previewCard.dataset.mobileCollapsed;
    delete previewCard.dataset.mobileDisclosureInitialized;
  }

  if (isPhone) {
    if (!planPanel.dataset.mobileDisclosureInitialized) {
      planPanel.dataset.mobileCollapsed = 'true';
      planPanel.dataset.mobileDisclosureInitialized = 'true';
    }
  } else {
    delete planPanel.dataset.mobileCollapsed;
    delete planPanel.dataset.mobileDisclosureInitialized;
  }

  const previewCollapsed = previewUsesDisclosure && previewCard.dataset.mobileCollapsed === 'true';
  const planCollapsed = isPhone && planPanel.dataset.mobileCollapsed === 'true';

  mobilePreviewToggle?.setAttribute('aria-expanded', String(!previewCollapsed));
  mobilePlanToggle?.setAttribute('aria-expanded', String(!planCollapsed));
  if (mobilePreviewToggle) mobilePreviewToggle.textContent = previewCollapsed ? '展开' : '收起';
  if (mobilePlanToggle) mobilePlanToggle.textContent = planCollapsed ? '展开' : '收起';
}

mobilePreviewToggle?.addEventListener('click', () => {
  previewCard.dataset.mobileCollapsed = previewCard.dataset.mobileCollapsed === 'true' ? 'false' : 'true';
  applyResponsiveDisclosureState();
});

mobilePlanToggle?.addEventListener('click', () => {
  planPanel.dataset.mobileCollapsed = planPanel.dataset.mobileCollapsed === 'true' ? 'false' : 'true';
  applyResponsiveDisclosureState();
});

phoneLayoutQuery.addEventListener?.('change', applyResponsiveDisclosureState);
tabletLayoutQuery.addEventListener?.('change', applyResponsiveDisclosureState);
applyResponsiveDisclosureState();


const languageTitles = {
  und: 'ASS 字幕',
  zho: '简体中文 ASS',
  eng: 'English ASS',
  jpn: '日本語 ASS',
  kor: '한국어 ASS',
  mul: '多语言 ASS',
};

const trackLanguageChoices = [
  ['und', '未指定'],
  ['zho', '中文'],
  ['zh-Hans', '简体中文 · BCP 47'],
  ['zh-Hant', '繁体中文 · BCP 47'],
  ['eng', 'English'],
  ['jpn', '日本語'],
  ['kor', '한국어'],
  ['rus', 'Русский'],
  ['deu', 'Deutsch'],
  ['fra', 'Français'],
  ['spa', 'Español'],
  ['por', 'Português'],
  ['ita', 'Italiano'],
  ['ara', 'العربية'],
  ['hin', 'हिन्दी'],
  ['mul', '多语言'],
];

function languageSelectOptions(current = 'und') {
  const value = String(current || 'und');
  const known = new Set(trackLanguageChoices.map(([code]) => code));
  const choices = known.has(value)
    ? trackLanguageChoices
    : [[value, `${value} · 自定义`], ...trackLanguageChoices];
  return choices.map(([code, label]) =>
    `<option value="${escapeHtml(code)}" ${code === value ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
}

const ffmpeg = new FFmpeg();
let loaded = false;
let running = false;
let scanning = false;
let containerScanGeneration = 0;
let containerAutoScanSuppressedKey = '';
let containerScanPromise = Promise.resolve();
let cancelRequested = false;
let outputURL = null;
let reportURL = null;
let trackState = null;
let externalAudioState = [];
let newSubtitleState = [];
let previewImageURL = null;
let previewGeneration = 0;
let previewing = false;
let batchRunning = false;
let batchCancelRequested = false;
let batchOutputDirectoryHandle = null;
const batchResultUrls = createBatchResultUrlRegistry();
let batchPlanGeneration = 0;
let batchPlanPromise = Promise.resolve(null);
let latestBatchPairing = null;
const batchVideoIdentityCache = new Map();
const batchFontIdentityCache = new Map();
let fontInspectGeneration = 0;
let fontInspectPromise = Promise.resolve();
let fontInspectState = {
  status: 'idle',
  selectionKey: '',
  recognition: { recognized: [], ignored: [] },
};
let previewCueTimes = [];
let previewCueIndex = -1;
let videoSniffGeneration = 0;
let videoSniffPromise = Promise.resolve();
let videoSniffState = {
  status: 'idle',
  fileKey: '',
  identity: null,
};
let subtitleInspectGeneration = 0;
let subtitleInspectPromise = Promise.resolve();
let subtitleInspectState = {
  status: 'idle',
  selectionKey: '',
  collected: null,
};
const batchSubtitleIdentityCache = new Map();

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

function fontSelectionKey(files = selectedFonts()) {
  return Array.from(files || [])
    .map((file) => fileKey(file))
    .sort()
    .join('\n');
}

function selectedFontRecognition() {
  const files = selectedFonts();
  if (!files.length) return { recognized: [], ignored: [] };
  const key = fontSelectionKey(files);
  if (
    fontInspectState.status === 'ready' &&
    fontInspectState.selectionKey === key &&
    fontInspectState.recognition
  ) {
    return fontInspectState.recognition;
  }
  return { recognized: [], ignored: [] };
}

function fontIdentityPending() {
  const files = selectedFonts();
  if (!files.length) return false;
  return (
    fontInspectState.status === 'pending' &&
    fontInspectState.selectionKey === fontSelectionKey(files)
  );
}

async function inspectSelectedFonts() {
  const files = selectedFonts();
  const selectionKey = fontSelectionKey(files);
  const generation = ++fontInspectGeneration;

  if (!files.length) {
    fontInspectState = {
      status: 'idle',
      selectionKey: '',
      recognition: { recognized: [], ignored: [] },
    };
    updateUI();
    return fontInspectState.recognition;
  }

  fontInspectState = {
    status: 'pending',
    selectionKey,
    recognition: null,
  };
  updateUI();

  const recognition = await identifyBatchFonts(files, {
    cache: batchFontIdentityCache,
    concurrency: 4,
  });
  if (
    generation !== fontInspectGeneration ||
    fontSelectionKey(selectedFonts()) !== selectionKey
  ) {
    return null;
  }

  fontInspectState = {
    status: 'ready',
    selectionKey,
    recognition,
  };
  updateUI();
  return recognition;
}

function selectedExternalAudioFiles() {
  return Array.from(audioInput.files || []);
}

function selectedSubtitleRawFiles() {
  return Array.from(subInput.files || []);
}

function subtitleSelectionKey(files = selectedSubtitleRawFiles()) {
  return Array.from(files || [])
    .map((file) => fileKey(file))
    .sort()
    .join('\n');
}

function selectedSubtitleTrackInputs() {
  const files = selectedSubtitleRawFiles();
  const key = subtitleSelectionKey(files);
  if (
    subtitleInspectState.status === 'ready' &&
    subtitleInspectState.selectionKey === key &&
    subtitleInspectState.collected
  ) {
    return subtitleInspectState.collected;
  }
  if (!files.length) return collectSubtitleInputs([]);
  return {
    tracks: [],
    orphanSidecars: [],
    invalid: [],
    identities: [],
    mismatches: [],
  };
}

function subtitleIdentityPending() {
  const files = selectedSubtitleRawFiles();
  if (!files.length) return false;
  return (
    subtitleInspectState.status === 'pending' &&
    subtitleInspectState.selectionKey === subtitleSelectionKey(files)
  );
}

async function inspectSelectedSubtitles() {
  const files = selectedSubtitleRawFiles();
  const selectionKey = subtitleSelectionKey(files);
  const generation = ++subtitleInspectGeneration;

  if (!files.length) {
    subtitleInspectState = {
      status: 'idle',
      selectionKey: '',
      collected: collectSubtitleInputs([]),
    };
    syncNewTrackState();
    updateUI();
    return subtitleInspectState.collected;
  }

  subtitleInspectState = {
    status: 'pending',
    selectionKey,
    collected: null,
  };
  updateUI();

  const collected = await identifySubtitleInputs(files, { concurrency: 8 });
  if (
    generation !== subtitleInspectGeneration ||
    subtitleSelectionKey(selectedSubtitleRawFiles()) !== selectionKey
  ) {
    return null;
  }

  subtitleInspectState = {
    status: 'ready',
    selectionKey,
    collected,
  };
  syncNewTrackState();
  updateUI();
  return collected;
}

function selectedSubtitleTracks() {
  return selectedSubtitleTrackInputs().tracks;
}

function selectedSubtitleFiles() {
  return selectedSubtitleTracks().map((track) => track.file);
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

  const oldSubs = new Map(newSubtitleState.map((item) => [subtitleTrackKey(item), item]));
  const collected = selectedSubtitleTrackInputs();
  newSubtitleState = collected.tracks.map((trackInput, index) => {
    const key = subtitleTrackKey(trackInput);
    const old = oldSubs.get(key);
    if (old) {
      old.file = trackInput.file;
      old.sidecarFile = trackInput.sidecarFile || null;
      old.format = trackInput.format;
      old.identity = trackInput.identity || null;
      old.identityMismatch = trackInput.identityMismatch || '';
      old.displayName = trackInput.displayName || trackInput.file.name;
      return old;
    }
    const format = trackInput.format || subtitleFormatInfo(trackInput.file.name);
    const inferred = inferredSubtitleMetadata(trackInput.file, format);
    return {
      file: trackInput.file,
      sidecarFile: trackInput.sidecarFile || null,
      displayName: trackInput.displayName || trackInput.file.name,
      format,
      identity: trackInput.identity || null,
      identityMismatch: trackInput.identityMismatch || '',
      language: inferred.language,
      title: inferred.title || stripExtension(trackInput.file.name) || languageTitles.und,
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
            <select data-new-audio-field="language" data-index="${index}" aria-label="外部音频语言" title="语言代码：${escapeHtml(item.language)}">${languageSelectOptions(item.language)}</select>
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
          <strong class="new-track-name">${escapeHtml(item.displayName || item.file.name)} <span class="track-meta">· ${escapeHtml(item.format?.label || subtitleFormatInfo(item.file.name)?.label || 'SUB')}</span></strong>
          ${item.identityMismatch ? `<small class="track-warning">${escapeHtml(item.identityMismatch)} · 已按实际内容识别</small>` : ''}
          <div class="new-track-fields">
            <select data-new-sub-field="language" data-index="${index}" aria-label="字幕语言" title="语言代码：${escapeHtml(item.language)}">${languageSelectOptions(item.language)}</select>
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
    : '<div class="track-empty">未选择字幕。</div>';
}

function fileKey(file) {
  return file ? `${file.name}|${file.size}|${file.lastModified}` : '';
}

function selectedVideoHeaderIdentity(video = videoInput.files[0]) {
  if (!video) return null;
  if (videoSniffState.fileKey !== fileKey(video)) return null;
  return videoSniffState.identity;
}

function currentVideoIsMatroska(video = videoInput.files[0]) {
  if (!video) return false;
  const sameFile = videoSniffState.fileKey === fileKey(video);
  if (sameFile && videoSniffState.status === 'ready') {
    return isMatroskaIdentity(videoSniffState.identity);
  }
  if (sameFile && videoSniffState.status === 'pending') {
    return ext(video.name) === '.mkv';
  }
  return ext(video.name) === '.mkv';
}

function renderVideoIdentityNotice() {
  if (!videoIdentityLabel) return;
  const video = videoInput.files[0];

  if (!video) {
    videoIdentityLabel.textContent = '实际内容：等待选择';
    videoIdentityLabel.dataset.state = 'idle';
    return;
  }

  const sameFile = videoSniffState.fileKey === fileKey(video);
  if (sameFile && videoSniffState.status === 'pending') {
    videoIdentityLabel.textContent = '实际内容：正在读取文件头…';
    videoIdentityLabel.dataset.state = 'pending';
    return;
  }

  const identity = selectedVideoHeaderIdentity(video);
  if (!identity || identity.container === 'unknown') {
    videoIdentityLabel.textContent = '实际内容：文件头未确认；封装时将由 ffprobe 验证';
    videoIdentityLabel.dataset.state = 'unknown';
    return;
  }

  const mismatch = identityMismatchMessage(identity);
  videoIdentityLabel.textContent = mismatch
    ? `实际内容：${identity.containerLabel} · ${mismatch}`
    : `实际内容：${identity.containerLabel}`;
  videoIdentityLabel.dataset.state = mismatch ? 'warning' : 'verified';
}

async function inspectSelectedVideoHeader() {
  const video = videoInput.files[0];
  const generation = ++videoSniffGeneration;

  if (!video) {
    videoSniffState = { status: 'idle', fileKey: '', identity: null };
    updateUI();
    return;
  }

  const key = fileKey(video);
  videoSniffState = { status: 'pending', fileKey: key, identity: null };
  updateUI();

  let detectedMkv = false;
  try {
    const sniffed = await sniffFileContainer(video);
    if (generation !== videoSniffGeneration || fileKey(videoInput.files[0]) !== key) return;

    const identity = sniffedVideoIdentity(video, sniffed);
    videoSniffState = { status: 'ready', fileKey: key, identity };

    detectedMkv = isMatroskaIdentity(identity);
    if (appendPreserveAll && appendPreserveAll.dataset.userTouched !== '1') {
      appendPreserveAll.checked = detectedMkv;
    }
    preserveAttachments.checked = detectedMkv;
  } catch (error) {
    if (generation !== videoSniffGeneration || fileKey(videoInput.files[0]) !== key) return;
    videoSniffState = {
      status: 'ready',
      fileKey: key,
      identity: sniffedVideoIdentity(video, { container: 'unknown', evidence: 'read-error' }),
    };
    logEl.textContent += `WARNING: 无法读取视频文件头，将在执行时交给 ffprobe 验证：${error?.message || error}\n`;
  }

  updateUI();

  // Container discovery is observational: detecting the source must not
  // silently switch the user out of preserve-all mode.
  if (
    detectedMkv &&
    fileKey(videoInput.files[0]) === key &&
    containerAutoScanSuppressedKey !== key &&
    (!trackState || trackState.fileKey !== key) &&
    !isBusy() &&
    !batchRunning
  ) {
    containerScanPromise = scanSourceContainer({ automatic: true });
  }
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
    ...selectedSubtitleRawFiles(),
    ...selectedFonts(),
  ];
}

function renderWorkloadNotice() {
  if (!workloadNotice) return;
  const files = selectedInputFiles();
  if (!files.length) {
    workloadNotice.dataset.level = 'normal';
    workloadNotice.innerHTML = '<strong>等待素材</strong>';
    return;
  }

  const totalBytes = sumFileSizes(files);
  const workload = classifyBrowserWorkload(totalBytes);
  workloadNotice.dataset.level = workload.level;
  workloadNotice.innerHTML = `<strong>输入：${escapeHtml(formatBytes(totalBytes))}</strong>${workload.level === 'normal' ? '' : `<span>${escapeHtml(workload.message)}</span>`}`;
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
  // A background MKV inventory scan may be expensive, but it should not block
  // selection of the remaining inputs. Mux/preview still lock source changes.
  const sourceLocked = running || previewing;
  videoInput.disabled = sourceLocked;
  audioInput.disabled = sourceLocked;
  subInput.disabled = sourceLocked;
  fontInput.disabled = sourceLocked;
  fontMode.disabled = sourceLocked;
  if (fontSubsetEnabled) fontSubsetEnabled.disabled = sourceLocked;
  preserveAttachments.disabled = disabled || !currentVideoIsMatroska();
  newAudioList.querySelectorAll('input').forEach((input) => { input.disabled = sourceLocked; });
  newSubtitleList.querySelectorAll('input').forEach((input) => { input.disabled = sourceLocked; });
  attachmentList.querySelectorAll('input').forEach((input) => { input.disabled = disabled; });
  setBulkToolsDisabled(disabled || !trackState);
  attachmentBulkTools?.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled || !trackState;
  });
  if (appendPreserveAll) appendPreserveAll.disabled = sourceLocked || !currentVideoIsMatroska();
  if (previewTimeInput) previewTimeInput.disabled = disabled || !selectedSubtitleTracks().some((track) => track.format?.previewable);
  if (previewPrevCueBtn) previewPrevCueBtn.disabled = disabled || !previewCueTimes.length;
  if (previewNextCueBtn) previewNextCueBtn.disabled = disabled || !previewCueTimes.length;
  if (batchVideoInput) batchVideoInput.disabled = sourceLocked || batchRunning;
  if (batchVideoFolderInput) batchVideoFolderInput.disabled = sourceLocked || batchRunning;
  if (batchSubtitleInput) batchSubtitleInput.disabled = sourceLocked || batchRunning;
  if (batchSubtitleFolderInput) batchSubtitleFolderInput.disabled = sourceLocked || batchRunning;
  if (batchFontInput) batchFontInput.disabled = sourceLocked || batchRunning;
  if (batchFontFolderInput) batchFontFolderInput.disabled = sourceLocked || batchRunning;
  if (batchPreserveAttachments) batchPreserveAttachments.disabled = sourceLocked || batchRunning;
  if (batchFontSubsetEnabled) batchFontSubsetEnabled.disabled = sourceLocked || batchRunning;
  if (batchSubsetScope) batchSubsetScope.disabled = sourceLocked || batchRunning || !batchFontSubsetEnabled?.checked;
  if (batchOutputDirBtn) batchOutputDirBtn.disabled = sourceLocked || batchRunning;
}
function resetTrackState() {
  trackState = null;
  trackList.innerHTML = '<div class="track-empty">选择 MKV 后自动读取容器内容。</div>';
  attachmentList.innerHTML = '';
  trackBulkTools?.classList.add('hidden');
  attachmentBulkTools?.classList.add('hidden');
  renderContainerChangeSummary();
  renderMuxPlan();
  if (!batchRunning) syncBatchPlan?.();
}
function captureNewTrackEditorState() {
  for (const control of newAudioList.querySelectorAll('[data-new-audio-field]')) {
    const item = externalAudioState[Number(control.dataset.index)];
    if (!item) continue;
    const field = control.dataset.newAudioField;
    item[field] = control.type === 'checkbox' ? control.checked : control.value;
  }
  for (const control of newSubtitleList.querySelectorAll('[data-new-sub-field]')) {
    const item = newSubtitleState[Number(control.dataset.index)];
    if (!item) continue;
    const field = control.dataset.newSubField;
    item[field] = control.type === 'checkbox' ? control.checked : control.value;
  }
}

function updateUI() {
  // Async container/font/subtitle probes may complete while the user is editing
  // track metadata. Snapshot live editor values before replacing list markup so
  // background readiness updates cannot restore inferred defaults over user input.
  captureNewTrackEditorState();
  const video = videoInput.files[0];
  const collectedSubs = selectedSubtitleTrackInputs();
  const subs = collectedSubs.tracks.map((track) => track.file);
  const subtitlePending = subtitleIdentityPending();
  const fonts = selectedFonts();
  const fontRecognition = selectedFontRecognition();
  const fontPending = fontIdentityPending();
  const inputIsMkv = currentVideoIsMatroska(video);
  const identityPending = Boolean(
    video &&
    videoSniffState.fileKey === fileKey(video) &&
    videoSniffState.status === 'pending'
  );
  const mode = fontMode.value || 'preserve';
  const busy = isBusy();

  const videoLabel = video?.name ?? '未选择';
  const audioFiles = selectedExternalAudioFiles();
  const audioLabel = formatFontSelection(audioFiles).replace(/字体/g, '音频');
  const subtitleLabel = subtitlePending
    ? '正在识别实际字幕格式…'
    : subs.length
      ? (subs.length === 1 ? (collectedSubs.tracks[0].displayName || subs[0].name) : `${subs.length} 条字幕`)
      : (collectedSubs.invalid.length ? '字幕内容无法识别或配对不完整' : '未选择');
  const fontLabel = fontPending
    ? '正在识别实际字体结构…'
    : fontRecognition.ignored.length
      ? `${fontRecognition.ignored.length} 个字体内容无法识别`
      : formatFontSelection(fonts);
  const outputLabel = video ? safeOutputName(video.name) : '—';

  $('videoName').textContent = videoLabel;
  $('videoName').title = video?.name || '';
  $('audioName').textContent = audioLabel;
  $('audioName').title = audioFiles.map((file) => file.name).join('\n');
  $('subName').textContent = subtitleLabel;
  $('subName').title = collectedSubs.tracks.map((track) => track.displayName || track.file.name).join('\n');
  $('fontName').textContent = fontLabel;
  $('fontName').title = fontRecognition.recognized.length
    ? fontRecognition.recognized.map((entry) => {
        const suffix = entry.mismatch ? ` · ${entry.mismatch}` : '';
        return `${entry.file.name} · ${entry.identity?.label || 'Font'}${suffix}`;
      }).join('\n')
    : fonts.map((file) => file.name).join('\n');
  $('fontSummary').textContent = fontPending
    ? 'checking…'
    : fonts.length
      ? `${fontRecognition.recognized.length}/${fonts.length} verified${fontSubsetEnabled?.checked ? ' · subset' : ''}`
      : '—';
  $('outputName').textContent = outputLabel;
  $('outputName').title = outputLabel === '—' ? '' : outputLabel;
  renderVideoIdentityNotice();
  renderWorkloadNotice();
  syncPreviewControls();

  fontModeHint.textContent = !fonts.length
    ? '未附加字体；ASS / SSA 预览使用可用替代字体。'
    : fontPending
      ? '正在解析字体内部结构与 face…'
      : fontRecognition.ignored.length
        ? '存在无法解析的字体文件；请移除或更换后再封装。'
        : mode === 'force'
          ? '使用第一个已验证字体，统一 ASS / SSA 字体名（含内联指定）。'
          : '按已验证的字体内部 Family / face 匹配原字幕字体，并检查字符覆盖。';

  if (!inputIsMkv) {
    preserveAttachments.checked = false;
    if (appendPreserveAll) appendPreserveAll.checked = false;
    if (trackState) resetTrackState();
  } else if (appendPreserveAll && appendPreserveAll.dataset.userTouched !== '1') {
    appendPreserveAll.checked = true;
  }

  const appendMode = Boolean(inputIsMkv && appendPreserveAll?.checked);
  preserveAttachments.checked = appendMode ? true : preserveAttachments.checked;
  preserveAttachments.disabled = busy || !inputIsMkv || appendMode;
  scanTracksBtn.disabled = busy || identityPending || !inputIsMkv || !video;
  muxBtn.disabled =
    busy ||
    identityPending ||
    subtitlePending ||
    fontPending ||
    !(video && subs.length) ||
    collectedSubs.invalid.length > 0 ||
    fontRecognition.ignored.length > 0;
  cancelBtn.disabled = !busy;
  trackBulkTools?.classList.toggle('hidden', !trackState || appendMode);
  attachmentBulkTools?.classList.toggle('hidden', !trackState || appendMode || !trackState.attachments.length);
  renderNewTrackLists();
  if (trackState) {
    renderTrackList();
    renderAttachmentList();
  } else {
    renderContainerChangeSummary();
  }
  setInputsDisabled(busy);
  refreshPlanBtn.disabled = busy;
  renderMuxPlan();
  if (!batchRunning) requestBatchPlanSync();
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
  containerScanGeneration += 1;
  containerAutoScanSuppressedKey = '';
  resetTrackState();
  videoSniffGeneration += 1;
  videoSniffState = {
    status: 'idle',
    fileKey: '',
    identity: null,
  };
  if (appendPreserveAll) {
    appendPreserveAll.dataset.userTouched = '0';
    appendPreserveAll.checked = false;
  }
  preserveAttachments.checked = false;
  destroySubtitlePreview();
  clearPreviewImage();
  videoSniffPromise = inspectSelectedVideoHeader();
  previewStatus.textContent = '视频已更换；正在识别实际容器。';
});
audioInput.addEventListener('change', () => {
  syncNewTrackState();
  updateUI();
});
subInput.addEventListener('change', () => {
  subtitleInspectGeneration += 1;
  subtitleInspectState = {
    status: 'idle',
    selectionKey: '',
    collected: null,
  };
  previewCueTimes = [];
  previewCueIndex = -1;
  if (previewTimeInput) previewTimeInput.value = '';
  destroySubtitlePreview();
  subtitleInspectPromise = inspectSelectedSubtitles();
  previewStatus.textContent = '字幕已更换；正在识别实际字幕格式。';
});
fontInput.addEventListener('change', () => {
  fontInspectGeneration += 1;
  fontInspectState = {
    status: 'idle',
    selectionKey: '',
    recognition: { recognized: [], ignored: [] },
  };
  destroySubtitlePreview();
  fontInspectPromise = inspectSelectedFonts();
  previewStatus.textContent = '字体已更换；正在识别实际字体结构。';
});
fontSubsetEnabled?.addEventListener('change', () => {
  updateUI();
  renderMuxPlan();
});
fontMode.addEventListener('change', () => {
  destroySubtitlePreview();
  updateUI();
  previewStatus.textContent = '字体模式已更换；点击“生成预览帧”重新检查。';
});
previewSubtitleSelect?.addEventListener('change', () => {
  previewCueTimes = [];
  previewCueIndex = -1;
  if (previewTimeInput) previewTimeInput.value = '';
  destroySubtitlePreview();
  previewStatus.textContent = '预览字幕已切换；可输入任意时间点，或使用上一条 / 下一条。';
});
previewTimeInput?.addEventListener('change', () => {
  const value = parsePreviewTime(previewTimeInput.value);
  previewTimeInput.setCustomValidity(Number.isFinite(value) ? '' : '请输入秒数或 HH:MM:SS.mmm');
});
previewPrevCueBtn?.addEventListener('click', () => navigatePreviewCue(-1));
previewNextCueBtn?.addEventListener('click', () => navigatePreviewCue(1));
previewRefreshBtn?.addEventListener('click', refreshSubtitlePreview);
previewImage?.addEventListener('click', openPreviewDialog);
previewImage?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openPreviewDialog();
});
previewDialogClose?.addEventListener('click', () => previewDialog?.close());
previewDialog?.addEventListener('click', (event) => {
  if (event.target === previewDialog) previewDialog.close();
});

appendPreserveAll?.addEventListener('change', () => {
  appendPreserveAll.dataset.userTouched = '1';
  if (appendPreserveAll.checked) preserveAttachments.checked = true;
  updateUI();
  renderMuxPlan();
});

preserveAttachments.addEventListener('change', () => {
  if (trackState) {
    trackState.attachments.forEach((item) => { item.include = preserveAttachments.checked; });
    renderAttachmentList();
  }
  renderMuxPlan();
});
refreshPlanBtn.addEventListener('click', renderMuxPlan);
bindNewTrackEditor(newAudioList, '[data-new-audio-field]', () => externalAudioState);
bindNewTrackEditor(newSubtitleList, '[data-new-sub-field]', () => newSubtitleState);

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

async function execWithCapturedLogs(args) {
  const lines = [];
  const listener = ({ message }) => {
    const value = String(message || '').trim();
    if (value) lines.push(value);
  };
  ffmpeg.on('log', listener);
  try {
    const code = await ffmpeg.exec(args);
    return { code, logs: lines };
  } finally {
    ffmpeg.off('log', listener);
  }
}

function usefulLogTail(lines, limit = 6) {
  const cleaned = (lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !/^frame=|^size=|^video:|^Input #|^Output #/.test(line));
  return cleaned.slice(-limit).join(' | ');
}

function previewSourceDuration(probe) {
  const values = [
    Number(probe?.format?.duration),
    ...(probe?.streams || [])
      .filter((stream) => stream.codec_type === 'video')
      .map((stream) => Number(stream.duration)),
  ].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

function clampPreviewTime(timeSeconds, durationSeconds) {
  const value = Math.max(0, Number(timeSeconds) || 0);
  if (!(durationSeconds > 0)) return value;
  return Math.min(value, Math.max(0, durationSeconds - 0.08));
}

function waitForMedia(video, eventName, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`浏览器等待 ${eventName} 超时`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      const mediaError = video.error;
      cleanup();
      reject(new Error(mediaError?.message || `浏览器无法解码该视频（MediaError ${mediaError?.code || 'unknown'}）`));
    };
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function captureBrowserFramePng(file, timeSeconds) {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  try {
    video.src = url;
    video.load();
    if (video.readyState < 1) await waitForMedia(video, 'loadedmetadata');

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const target = clampPreviewTime(timeSeconds, duration);
    if (target > 0.001) {
      video.currentTime = target;
      await waitForMedia(video, 'seeked', 20000);
    } else if (video.readyState < 2) {
      await waitForMedia(video, 'loadeddata', 20000);
    }

    if (typeof video.requestVideoFrameCallback === 'function') {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        video.requestVideoFrameCallback(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!(sourceWidth > 0 && sourceHeight > 0)) {
      throw new Error('浏览器没有取得可绘制的视频帧。');
    }

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / sourceWidth);
    const width = Math.max(2, Math.round(sourceWidth * scale));
    const height = Math.max(2, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器 Canvas 不可用。');
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('浏览器无法编码预览 PNG。')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    video.pause();
    video.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
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
    throw new Error('字幕文件不是有效的 UTF-8 / UTF-16 文本。请先转换为 UTF-8、UTF-16LE 或 UTF-16BE。');
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

function extractPreviewCueTimes(assText) {
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

  return candidates;
}

function choosePreviewFrameTime(assText) {
  const candidates = extractPreviewCueTimes(assText);
  if (!candidates.length) return 0;
  const firstVisible = candidates.find((value) => value >= 0.25);
  return firstVisible ?? candidates[0];
}

function parsePreviewTime(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const match = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!match) return NaN;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const fraction = Number(`0.${String(match[4] || '0').padEnd(3, '0')}`);
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function formatPreviewTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const millis = Math.round((value - Math.floor(value)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

async function loadPreviewCueTimes() {
  const tracks = selectedSubtitleTracks();
  const selectedIndex = Number(previewSubtitleSelect?.value || 0);
  const track = tracks[selectedIndex];
  const file = track?.file;
  if (!file || !track?.format?.previewable) {
    previewCueTimes = [];
    previewCueIndex = -1;
    return [];
  }
  const { text } = await readAssText(file);
  previewCueTimes = extractPreviewCueTimes(text);
  const current = parsePreviewTime(previewTimeInput?.value);
  if (Number.isFinite(current) && previewCueTimes.length) {
    let nearest = 0;
    let distance = Infinity;
    previewCueTimes.forEach((value, index) => {
      const delta = Math.abs(value - current);
      if (delta < distance) {
        nearest = index;
        distance = delta;
      }
    });
    previewCueIndex = nearest;
  } else {
    previewCueIndex = previewCueTimes.length ? 0 : -1;
  }
  return previewCueTimes;
}

async function navigatePreviewCue(delta) {
  if (isBusy()) return;
  await loadPreviewCueTimes();
  if (!previewCueTimes.length) return;
  if (previewCueIndex < 0) previewCueIndex = 0;
  else previewCueIndex = Math.max(0, Math.min(previewCueTimes.length - 1, previewCueIndex + delta));
  const target = previewCueTimes[previewCueIndex];
  if (previewTimeInput) previewTimeInput.value = formatPreviewTime(target);
  await refreshSubtitlePreview();
}

async function destroySubtitlePreview() {
  previewGeneration += 1;
  if (previewImageURL) {
    URL.revokeObjectURL(previewImageURL);
    previewImageURL = null;
  }
  previewImage?.removeAttribute('src');
  previewImage?.classList.add('hidden');
}

function clearPreviewImage() {
  if (previewImageURL) {
    URL.revokeObjectURL(previewImageURL);
    previewImageURL = null;
  }
  previewImage?.removeAttribute('src');
  previewImage?.classList.add('hidden');
  previewDialogImage?.removeAttribute('src');
  if (previewDialog?.open) previewDialog.close();
}

function openPreviewDialog() {
  if (!previewImage?.src || !previewDialog || !previewDialogImage) return;
  previewDialogImage.src = previewImage.src;
  if (!previewDialog.open) previewDialog.showModal();
}

function syncPreviewControls() {
  if (!previewSubtitleSelect || !previewRefreshBtn) return;
  const tracks = selectedSubtitleTracks();
  const previewable = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => Boolean(track.format?.previewable));
  const previous = Number(previewSubtitleSelect.value);
  previewSubtitleSelect.innerHTML = previewable.length
    ? previewable.map(({ track, index }) => `<option value="${index}">${escapeHtml(track.file.name)} · ${escapeHtml(track.format?.label || 'ASS/SSA')}</option>`).join('')
    : '<option value="">没有可预览的 ASS / SSA</option>';

  if (previewable.length) {
    const known = previewable.some((item) => item.index === previous);
    previewSubtitleSelect.value = String(known ? previous : previewable[0].index);
  }

  previewSubtitleSelect.disabled = !previewable.length;
  const fontRecognition = selectedFontRecognition();
  previewRefreshBtn.disabled =
    !(videoInput.files[0] && previewable.length) ||
    fontIdentityPending() ||
    fontRecognition.ignored.length > 0;
  if (previewTimeInput) previewTimeInput.disabled = !previewable.length;
  if (previewPrevCueBtn) previewPrevCueBtn.disabled = !previewable.length;
  if (previewNextCueBtn) previewNextCueBtn.disabled = !previewable.length;
}

async function buildPreviewAss(track, fontFiles) {
  const { text } = await readAssText(track.file);
  if ((fontMode.value || 'preserve') !== 'force' || !fontFiles.length) return text;
  const descriptors = await readFontDescriptors(fontFiles[0]);
  const forcedFamily = preferredAssFontFamily(descriptors[0]);
  return forceAssFontFamily(text, forcedFamily);
}

async function refreshSubtitlePreview() {
  if (running || previewing) return;
  if (scanning) {
    previewStatus.textContent = '正在等待后台容器扫描完成，然后生成预览帧……';
    try { await containerScanPromise; } catch {}
  }
  if (isBusy()) return;

  const video = videoInput.files[0];
  const tracks = selectedSubtitleTracks();
  const selectedIndex = Number(previewSubtitleSelect?.value || 0);
  const track = tracks[selectedIndex];
  const fontFiles = selectedFonts();

  await destroySubtitlePreview();
  const generation = previewGeneration;
  syncPreviewControls();

  if (!video || !track?.file || !track?.format?.previewable) {
    previewStatus.textContent = '等待视频与 ASS / SSA。';
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
  const previewFontPaths = [];
  let mounted = false;

  try {
    previewStatus.textContent = '正在加载 FFmpeg 并提取字幕所在画面……';
    previewEmpty?.classList.remove('hidden');
    await loadFFmpeg();
    if (cancelRequested || generation !== previewGeneration) return;

    const previewFonts = await Promise.all(fontFiles.map(async (font) => {
      const identity = await identifyFontFile(font);
      if (!isSupportedFontIdentity(identity)) {
        throw new Error(`字体“${font.name}”的实际内容无法识别：${identity.parseError || '无有效字体结构'}`);
      }
      const mismatch = fontIdentityMismatchMessage(identity);
      if (mismatch) {
        logEl.textContent += `WARNING: 预览字体“${font.name}”：${mismatch}；按实际字体结构载入。\n`;
      }
      return { file: font, identity };
    }));
    const sourceAss = await buildPreviewAss(track, fontFiles);

    await ffmpeg.createDir(mountPoint);
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [video] }, mountPoint);
    mounted = true;
    await ffmpeg.createDir(fontDir);

    const previewProbePath = `/${prefix}-preview-probe.json`;
    const sourceProbe = await runProbe(inputPath, previewProbePath, { decodeStreams: false }).catch((error) => {
      logEl.textContent += `PREVIEW PROBE WARNING: ${error?.message || error}\n`;
      return null;
    });
    await removeQuietly(previewProbePath);

    previewCueTimes = extractPreviewCueTimes(sourceAss);
    const manualPreviewTime = parsePreviewTime(previewTimeInput?.value);
    const requestedPreviewTime = Number.isFinite(manualPreviewTime)
      ? manualPreviewTime
      : choosePreviewFrameTime(sourceAss);
    const duration = previewSourceDuration(sourceProbe);
    const previewTime = clampPreviewTime(requestedPreviewTime, duration);
    if (previewTimeInput) previewTimeInput.value = formatPreviewTime(previewTime);
    if (previewCueTimes.length) {
      let nearest = 0;
      let distance = Infinity;
      previewCueTimes.forEach((value, index) => {
        const delta = Math.abs(value - previewTime);
        if (delta < distance) {
          nearest = index;
          distance = delta;
        }
      });
      previewCueIndex = nearest;
    }
    const previewCenter = 0.5;
    const shiftedAss = shiftAssForPreview(sourceAss, Math.max(0, previewTime - previewCenter));

    await Promise.all(previewFonts.map(async (item, index) => {
      const path = `${fontDir}/font-${index}${fontVirtualSuffix(item.identity)}`;
      previewFontPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(item.file));
    }));
    await ffmpeg.writeFile(assPath, new TextEncoder().encode(shiftedAss));

    const codec = sourceProbe?.streams?.find((stream) => stream.codec_type === 'video')?.codec_name || 'unknown';
    previewStatus.textContent = `正在提取 ${previewTime.toFixed(2)} s 视频帧（${codec}）……`;

    const extractionAttempts = [
      {
        label: 'FFmpeg 快速定位',
        args: [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-ss', previewTime.toFixed(3),
          '-i', inputPath,
          '-map', '0:v:0',
          '-an', '-sn',
          '-frames:v', '1',
          basePath,
        ],
      },
      {
        label: 'FFmpeg 兼容定位',
        args: [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-i', inputPath,
          '-ss', previewTime.toFixed(3),
          '-map', '0:v:0',
          '-an', '-sn',
          '-frames:v', '1',
          basePath,
        ],
      },
    ];

    let extracted = false;
    let extractionMethod = '';
    const extractErrors = [];

    const tryBrowserFrame = async () => {
      try {
        previewStatus.textContent = `正在用浏览器解码 ${codec} 预览帧……`;
        const bytes = await captureBrowserFramePng(video, previewTime);
        if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('浏览器返回了空预览帧。');
        await ffmpeg.writeFile(basePath, bytes);
        extracted = true;
        extractionMethod = 'browser';
        return true;
      } catch (error) {
        extractErrors.push(`浏览器解码：${error?.message || error}`);
        return false;
      }
    };

    // ffmpeg.wasm 5.1.x 的内置 AV1 解码器对部分 MP4 AV1 bitstream
    // 会报 Missing Sequence Header。现代 Chromium 通常能直接解码 AV1，
    // 因此 AV1 优先用浏览器抽一帧，再交给 FFmpeg/libass 烧字幕。
    if (codec === 'av1') {
      await tryBrowserFrame();
    }

    if (!extracted) {
      for (const attempt of extractionAttempts) {
        await removeQuietly(basePath);
        const result = await execWithCapturedLogs(attempt.args);
        if (result.code === 0) {
          try {
            const bytes = await ffmpeg.readFile(basePath);
            if (bytes instanceof Uint8Array && bytes.byteLength > 0) {
              extracted = true;
              extractionMethod = 'ffmpeg';
              break;
            }
          } catch {}
        }
        const detail = usefulLogTail(result.logs);
        extractErrors.push(`${attempt.label}：返回 ${result.code}${detail ? ` · ${detail}` : ''}`);
      }
    }

    if (!extracted) {
      await tryBrowserFrame();
    }

    if (!extracted) {
      throw new Error(`视频帧提取失败。编码：${codec}；目标：${previewTime.toFixed(2)} s${duration > 0 ? ` / 时长 ${duration.toFixed(2)} s` : ''}。 ${extractErrors.join('；')}`);
    }

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
    previewImage.classList.remove('hidden');
    previewEmpty?.classList.add('hidden');
    previewStatus.textContent = `预览帧：${track.file.name} · ${previewTime.toFixed(2)} s · ${extractionMethod === 'browser' ? '浏览器抽帧 + ' : ''}FFmpeg/libass`;
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
      for (const path of previewFontPaths) {
        await removeQuietly(path);
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

function containerKindLabel(type) {
  switch (type) {
    case 'video': return '视频';
    case 'audio': return '音频';
    case 'subtitle': return '字幕';
    case 'attachment': return '附件';
    case 'data': return '数据';
    default: return '其他';
  }
}

function sourceTrackModified(track) {
  return (
    track.language !== track.originalLanguage ||
    track.title !== track.originalTitle ||
    track.default !== track.originalDefault ||
    track.forced !== track.originalForced ||
    track.original !== track.originalOriginal ||
    track.commentary !== track.originalCommentary ||
    track.hearingImpaired !== track.originalHearingImpaired
  );
}

function sourceAttachmentModified(item) {
  return (
    item.filename !== item.originalFilename ||
    item.mimetype !== item.originalMimetype
  );
}

function plannedFontAttachmentCount() {
  const recognized = selectedFontRecognition().recognized || [];
  if (!recognized.length) return 0;
  const hasAssLikeSubtitle = newSubtitleState.some((track) => track.format?.assLike);
  return fontMode.value === 'force' && hasAssLikeSubtitle ? 1 : recognized.length;
}

function containerChangeCounts({ newFontCount = plannedFontAttachmentCount() } = {}) {
  const added =
    externalAudioState.length +
    newSubtitleState.length +
    newFontCount;

  if (!trackState) {
    return { added, removed: 0, modified: 0 };
  }

  const appendMode = Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked);
  let removed = appendMode
    ? 0
    : (trackState.streams || [])
        .filter((stream) => !['video', 'audio', 'subtitle', 'attachment', 'data'].includes(stream.codec_type))
        .length;
  let modified = 0;

  if (!appendMode) {
    for (const track of trackState.tracks) {
      if (!track.include) removed += 1;
      else if (sourceTrackModified(track)) modified += 1;
    }
    for (const item of trackState.attachments) {
      if (!item.include) removed += 1;
      else if (sourceAttachmentModified(item)) modified += 1;
    }
  }

  return { added, removed, modified };
}

function renderContainerChangeSummary() {
  if (!containerChangeSummary) return;
  if (scanning) {
    containerChangeSummary.textContent = '读取中…';
    containerChangeSummary.dataset.state = 'pending';
    return;
  }
  if (!currentVideoIsMatroska()) {
    containerChangeSummary.textContent = '—';
    containerChangeSummary.dataset.state = 'idle';
    return;
  }
  if (!trackState) {
    containerChangeSummary.textContent = '等待容器扫描';
    containerChangeSummary.dataset.state = 'pending';
    return;
  }

  const { added, removed, modified } = containerChangeCounts();
  containerChangeSummary.dataset.state = removed ? 'destructive' : (added || modified ? 'changed' : 'clean');
  containerChangeSummary.innerHTML = [
    added ? `<span data-change="add">+${added} 新增</span>` : '',
    removed ? `<span data-change="remove">−${removed} 删除</span>` : '<span data-change="keep">无删除</span>',
    modified ? `<span data-change="modify">~${modified} 修改</span>` : '',
  ].filter(Boolean).join('');
}

function containerStatusBadge(state) {
  const labels = {
    keep: '保留',
    add: '新增',
    remove: '删除',
    modify: '修改',
  };
  return `<span class="change-badge" data-change="${state}">${labels[state] || state}</span>`;
}

function containerStreamTitle(stream) {
  const title = String(stream.tags?.title || '').trim();
  const type = containerKindLabel(stream.codec_type);
  return title || `${type} #${stream.index}`;
}

function containerStreamMeta(stream) {
  return [
    stream.codec_name || 'unknown',
    stream.tags?.language || '',
    `source #${stream.index}`,
  ].filter(Boolean).join(' · ');
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
  const appendMode = Boolean(video && currentVideoIsMatroska(video) && appendPreserveAll?.checked);
  const entries = [];
  const warnings = appendMode ? [] : defaultConflictWarnings();

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

  if (appendMode && video) {
    entries.push({
      kind: '音频',
      title: '全部原音频轨',
      meta: '完整保留并追加 · 保持源顺序与原 metadata / dispositions',
      flags: 'source',
    });
  } else if (trackState) {
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
      meta: `${track.format?.label || subtitleFormatInfo(track.file.name)?.label || 'SUB'} · ${normalizeTrackLanguage(track.language)} · 新增`,
      flags: dispositionValue(track.default, track.forced, track),
    });
  });

  if (appendMode && video) {
    entries.push({
      kind: '原字幕',
      title: '全部原字幕轨',
      meta: '完整保留并追加 · 保持原 codec / metadata / dispositions',
      flags: 'source',
    });
  } else {
    selectedTracks('subtitle').forEach((track, index) => {
      entries.push({
        kind: `原字幕 ${index + 1}`,
        title: track.title || `Subtitle #${track.index}`,
        meta: `${track.stream.codec_name || 'unknown'} · ${normalizeTrackLanguage(track.language)} · source #${track.index}`,
        flags: dispositionValue(track.default, track.forced, track),
      });
    });
  }

  if (appendMode && video) {
    entries.push({
      kind: '附件',
      title: '全部原 MKV 附件',
      meta: '完整保留并追加 · 封装时全部保留',
      flags: 'source',
    });
  } else if (trackState) {
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

  const hasAssLikeSubtitle = newSubtitleState.some((track) => track.format?.assLike);
  const attachedFonts = mode === 'force' && hasAssLikeSubtitle ? fonts.slice(0, 1) : fonts;
  attachedFonts.forEach((file, index) => {
    entries.push({
      kind: `字体 ${index + 1}`,
      title: file.name,
      meta: `Matroska attachment${fontSubsetEnabled?.checked ? ' · subset 可选' : ''}`,
      flags: '',
    });
  });

  if (!appendMode && trackState && selectedTracks('audio').length === 0 && externalAudioState.length === 0) {
    warnings.push('扫描后没有选择原音频，也没有外部音频；输出将没有音频。');
  }

  if (trackState && !appendMode) {
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

  const hasKnownAssLikeSource = Boolean(
    trackState &&
    selectedTracks('subtitle').some((track) =>
      ['ass', 'ssa', 'substation_alpha'].includes(
        String(track.stream?.codec_name || '').toLowerCase()
      )
    )
  );
  warnings.push(...compatibilityPlanMessages({
    newSubtitles: newSubtitleState,
    fontCount: attachedFonts.length,
    hasKnownAssLikeSource,
    sourceSubtitleKnowledge: appendMode && !trackState ? 'unknown' : 'known',
  }));

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
    trackList.innerHTML = '<div class="track-empty">选择 MKV 后自动读取容器内容。</div>';
    renderContainerChangeSummary();
    return;
  }

  const appendMode = Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked);
  const editableByIndex = new Map(trackState.tracks.map((track) => [track.index, track]));
  const sourceRows = [];

  for (const stream of trackState.streams || []) {
    if (stream.codec_type === 'attachment') continue;

    const track = editableByIndex.get(stream.index);
    if (track) {
      const forced = track.type === 'subtitle'
        ? `<label><input type="checkbox" data-track-action="forced" data-track-index="${track.index}" ${track.forced ? 'checked' : ''} ${appendMode || !track.include ? 'disabled' : ''}> Forced</label>`
        : '';
      const change = appendMode
        ? 'keep'
        : (!track.include ? 'remove' : (sourceTrackModified(track) ? 'modify' : 'keep'));
      const controlsDisabled = appendMode || !track.include ? 'disabled' : '';
      sourceRows.push(`
        <div class="track-row track-${track.type} container-item" data-change="${change}">
          <span class="container-item-kind">${containerKindLabel(track.type)}</span>
          <div class="track-title">
            <strong>${escapeHtml(containerStreamTitle(stream))}</strong>
            <span class="track-meta">${escapeHtml(containerStreamMeta(stream))}</span>
            <div class="track-edit-grid">
              <label>语言
                <input type="text" data-track-field="language" data-track-index="${track.index}" value="${escapeHtml(track.language)}" list="languageSuggestions" maxlength="35" ${controlsDisabled}>
              </label>
              <label>标题
                <input type="text" data-track-field="title" data-track-index="${track.index}" value="${escapeHtml(track.title)}" maxlength="160" ${controlsDisabled}>
              </label>
            </div>
          </div>
          <div class="track-controls">
            <span class="track-order">
              <button type="button" data-track-move="-1" data-track-index="${track.index}" ${controlsDisabled} aria-label="上移" title="上移">↑</button>
              <button type="button" data-track-move="1" data-track-index="${track.index}" ${controlsDisabled} aria-label="下移" title="下移">↓</button>
            </span>
            <label><input type="checkbox" data-track-action="include" data-track-index="${track.index}" ${track.include ? 'checked' : ''} ${appendMode ? 'disabled' : ''}> 保留</label>
            <label><input type="checkbox" data-track-action="default" data-track-index="${track.index}" ${track.default ? 'checked' : ''} ${controlsDisabled}> Default</label>
            ${forced}
            <details class="track-advanced">
              <summary>属性</summary>
              <label><input type="checkbox" data-track-action="original" data-track-index="${track.index}" ${track.original ? 'checked' : ''} ${controlsDisabled}> Original</label>
              <label><input type="checkbox" data-track-action="commentary" data-track-index="${track.index}" ${track.commentary ? 'checked' : ''} ${controlsDisabled}> Commentary</label>
              <label><input type="checkbox" data-track-action="hearingImpaired" data-track-index="${track.index}" ${track.hearingImpaired ? 'checked' : ''} ${controlsDisabled}> Hearing impaired</label>
            </details>
          </div>
          ${containerStatusBadge(change)}
        </div>`);
      continue;
    }

    const supportedReadOnly = ['video', 'data'].includes(stream.codec_type);
    const change = appendMode ? 'keep' : (supportedReadOnly ? 'keep' : 'remove');
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="${change}">
        <span class="container-item-kind">${containerKindLabel(stream.codec_type)}</span>
        <div class="container-item-main">
          <strong>${escapeHtml(containerStreamTitle(stream))}</strong>
          <small>${escapeHtml(containerStreamMeta(stream))}</small>
        </div>
        ${containerStatusBadge(change)}
      </div>`);
  }

  const chapters = trackState.chapters || [];
  chapters.forEach((chapter, index) => {
    const chapterTitle = String(chapter.tags?.title || '').trim() || `Chapter #${index + 1}`;
    const chapterLanguage = String(chapter.tags?.language || '').trim();
    const start = String(chapter.start_time ?? chapter.start ?? '').trim();
    const end = String(chapter.end_time ?? chapter.end ?? '').trim();
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="keep">
        <span class="container-item-kind">章节</span>
        <div class="container-item-main">
          <strong>${escapeHtml(chapterTitle)}</strong>
          <small>${escapeHtml([start && end ? `${start} → ${end}` : (start || end), chapterLanguage].filter(Boolean).join(' · '))}</small>
        </div>
        ${containerStatusBadge('keep')}
      </div>`);
  });

  const tags = preservableFormatTags(trackState.format?.tags || {});
  const tagEntries = Object.entries(tags);
  sourceRows.push(`
    <div class="container-item container-readonly-row container-metadata-row" data-change="keep">
      <span class="container-item-kind">元数据</span>
      <div class="container-item-main">
        <strong>${tagEntries.length} 个全局字段</strong>
        ${tagEntries.length ? `<details class="container-meta"><summary>查看</summary><div>${tagEntries.map(([key, value]) => `<span><b>${escapeHtml(key)}</b> ${escapeHtml(value)}</span>`).join('')}</div></details>` : ''}
      </div>
      ${containerStatusBadge('keep')}
    </div>`);

  externalAudioState.forEach((item, index) => {
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="add">
        <span class="container-item-kind">音频</span>
        <div class="container-item-main"><strong>${escapeHtml(item.title || item.file.name)}</strong><small>外部音频 #${index + 1} · ${escapeHtml(normalizeTrackLanguage(item.language))}</small></div>
        ${containerStatusBadge('add')}
      </div>`);
  });
  newSubtitleState.forEach((item, index) => {
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="add">
        <span class="container-item-kind">字幕</span>
        <div class="container-item-main"><strong>${escapeHtml(item.title || item.displayName || item.file.name)}</strong><small>${escapeHtml(item.format?.label || 'SUB')} · ${escapeHtml(normalizeTrackLanguage(item.language))} · 新字幕 #${index + 1}</small></div>
        ${containerStatusBadge('add')}
      </div>`);
  });

  const fonts = selectedFontRecognition().recognized || [];
  const visibleFonts = fontMode.value === 'force' && newSubtitleState.some((track) => track.format?.assLike)
    ? fonts.slice(0, 1)
    : fonts;
  visibleFonts.forEach((item) => {
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="add">
        <span class="container-item-kind">附件</span>
        <div class="container-item-main"><strong>${escapeHtml(item.file.name)}</strong><small>新字体附件</small></div>
        ${containerStatusBadge('add')}
      </div>`);
  });

  trackList.innerHTML = sourceRows.join('') || '<div class="track-empty">容器中没有可显示的流。</div>';
  renderContainerChangeSummary();
  renderMuxPlan();
}

function renderAttachmentList() {
  if (!trackState || !trackState.attachments.length) {
    attachmentList.innerHTML = '';
    renderContainerChangeSummary();
    return;
  }

  const appendMode = Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked);
  attachmentList.innerHTML = trackState.attachments.map((item) => {
    const change = appendMode
      ? 'keep'
      : (!item.include ? 'remove' : (sourceAttachmentModified(item) ? 'modify' : 'keep'));
    const disabled = appendMode || !item.include ? 'disabled' : '';
    return `
      <div class="attachment-item container-item" data-change="${change}">
        <span class="container-item-kind">附件</span>
        <div class="attachment-main">
          <strong>${escapeHtml(item.filename || item.originalFilename || `Attachment #${item.index}`)}</strong>
          <span class="attachment-meta">source #${item.index} · ${escapeHtml(item.stream.codec_name || item.mimetype || 'attachment')}</span>
          <div class="attachment-fields">
            <label>文件名
              <input type="text" data-attachment-field="filename" data-attachment-index="${item.index}" value="${escapeHtml(item.filename)}" maxlength="240" ${disabled}>
            </label>
            <label>MIME
              <input type="text" data-attachment-field="mimetype" data-attachment-index="${item.index}" value="${escapeHtml(item.mimetype)}" maxlength="120" ${disabled}>
            </label>
          </div>
        </div>
        <label class="attachment-select">
          <input type="checkbox" data-attachment-action="include" data-attachment-index="${item.index}" ${item.include ? 'checked' : ''} ${appendMode ? 'disabled' : ''}>
          保留
        </label>
        ${containerStatusBadge(change)}
      </div>`;
  }).join('');
  renderContainerChangeSummary();
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

async function scanSourceContainer({ automatic = false } = {}) {
  const video = videoInput.files[0];
  if (!video || !currentVideoIsMatroska(video) || isBusy()) return;

  const sourceKey = fileKey(video);
  if (automatic && (trackState?.fileKey === sourceKey || containerAutoScanSuppressedKey === sourceKey)) return;
  if (!automatic) containerAutoScanSuppressedKey = '';


  const scanGeneration = ++containerScanGeneration;
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
    if (
      cancelRequested ||
      scanGeneration !== containerScanGeneration ||
      fileKey(videoInput.files[0]) !== sourceKey
    ) return;

    status.textContent = automatic ? '正在读取 MKV 容器内容……' : '正在重新扫描 MKV 容器……';
    await ffmpeg.writeFile(videoPath, await fetchFile(video));
    const probe = await probeInput(videoPath, probePath);
    if (
      cancelRequested ||
      scanGeneration !== containerScanGeneration ||
      fileKey(videoInput.files[0]) !== sourceKey
    ) return;

    const headerIdentity = selectedVideoHeaderIdentity(video) || sniffedVideoIdentity(video, {});
    const verifiedIdentity = videoIdentityFromProbe(video, probe, headerIdentity);
    if (!isMatroskaIdentity(verifiedIdentity)) {
      throw new Error(`实际检测到的容器为 ${verifiedIdentity.containerLabel}，不是 Matroska / MKV，不能进入 MKV 原轨扫描。`);
    }
    const identityMismatch = identityMismatchMessage(verifiedIdentity);
    if (identityMismatch) {
      logEl.textContent += `WARNING: ${identityMismatch}；轨道扫描以实际内容为准。\n`;
    }

    const tracks = probe.streams
      .filter((stream) => ['audio', 'subtitle'].includes(stream.codec_type))
      .map((stream) => ({
        index: stream.index,
        type: stream.codec_type,
        stream,
        include: true,
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
        include: true,
      }));

    trackState = {
      fileKey: fileKey(video),
      streams: probe.streams || [],
      tracks,
      attachments,
      chapters: probe.chapters,
      format: probe.format,
      attachmentCount: probe.attachmentCount,
    };

    preserveAttachments.checked = true;
    trackBulkTools?.classList.remove('hidden');
    attachmentBulkTools?.classList.toggle('hidden', !attachments.length);
    renderTrackList();
    renderAttachmentList();
    bar.style.width = '0%';
    status.textContent = `轨道扫描完成：${(probe.streams || []).length} 个流 · ${attachments.length} 个附件 · ${(probe.chapters || []).length} 个章节。`;
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

    const current = videoInput.files[0];
    if (
      current &&
      currentVideoIsMatroska(current) &&
      containerAutoScanSuppressedKey !== fileKey(current) &&
      (!trackState || trackState.fileKey !== fileKey(current))
    ) {
      queueMicrotask(() => {
        containerScanPromise = scanSourceContainer({ automatic: true });
      });
    }
  }
}

scanTracksBtn.addEventListener('click', () => {
  containerScanPromise = scanSourceContainer({ automatic: false });
});
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
  if (scanning) containerAutoScanSuppressedKey = fileKey(videoInput.files[0]);
  status.textContent = '正在取消当前操作……';
  logEl.textContent += 'CANCEL: 用户请求终止当前操作。\n';
  ffmpeg.terminate();
  loaded = false;
});

muxBtn.addEventListener('click', async () => {
  if (isBusy()) return;

  syncNewTrackState();
  const video = videoInput.files[0];
  const fontRecognition = selectedFontRecognition();
  if (fontIdentityPending()) return;
  if (selectedFonts().length && fontRecognition.ignored.length) {
    const first = fontRecognition.ignored[0];
    status.textContent = `字体“${first.file.name}”的实际内容无法识别：${first.identity?.parseError || '无有效字体结构'}`;
    return;
  }
  const fontFiles = fontRecognition.recognized.map((entry) => entry.file);
  const fontIdentityByKey = new Map(
    fontRecognition.recognized.map((entry) => [fileKey(entry.file), entry.identity])
  );
  const subtitleTracks = newSubtitleState;
  const externalAudioTracks = externalAudioState;
  if (!video || !subtitleTracks.length) return;

  const headerVideoIdentity = selectedVideoHeaderIdentity(video) || sniffedVideoIdentity(video, {});
  const videoIsMatroska = isMatroskaIdentity(headerVideoIdentity);
  const invalidSubtitle = subtitleTracks.find((track) => !track.format);
  const mode = fontFiles.length ? (fontMode.value || 'preserve') : 'preserve';
  const manualScanned = getScannedSelection(video);
  const appendMode = Boolean(videoIsMatroska && appendPreserveAll?.checked);
  const scanned = appendMode ? null : manualScanned;
  const preserveAllOriginalSubtitles = appendMode;
  const preserveAllOriginalAttachments = videoIsMatroska && (
    appendMode || (!scanned && preserveAttachments.checked)
  );
  if (invalidSubtitle) {
    status.textContent = `字幕“${invalidSubtitle.file.name}”的实际内容无法识别为支持的 ASS / SSA / SRT / WebVTT / PGS / VobSub。`;
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
  const videoPath = `${prefix}-input${sourceVirtualSuffix(headerVideoIdentity)}`;
  const outputPath = `${prefix}-output.mkv`;
  const probePath = `${prefix}-probe.json`;
  const auditPath = `${prefix}-audit.json`;
  const outputName = safeOutputName(video.name);
  const fontPaths = [];
  const audioPaths = [];
  const subtitlePaths = [];
  const subtitlePrimaryPaths = [];
  const extraProbePaths = [];

  try {
    status.textContent = '正在解析 ASS 与字体 face……';
    bar.style.width = '10%';

    const fontDedupe = await dedupeFilesBySha256(fontFiles);
    const identifiedFontItems = await Promise.all(fontDedupe.unique.map(async (item) => {
      const fontIdentity = fontIdentityByKey.get(fileKey(item.file)) || await identifyFontFile(item.file);
      if (!isSupportedFontIdentity(fontIdentity)) {
        throw new Error(`字体“${item.file.name}”的实际内容无法识别为支持的 TTF / OTF / TTC / OTC：${fontIdentity.parseError || '无有效 SFNT / collection 结构'}`);
      }
      const mismatch = fontIdentityMismatchMessage(fontIdentity);
      if (mismatch) {
        logEl.textContent += `WARNING: 字体“${item.file.name}”：${mismatch}；按实际字体结构处理。\n`;
      }
      return {
        ...item,
        fontIdentity,
        attachmentName: normalizedFontAttachmentName(item.file.name, fontIdentity),
      };
    }));
    const initialReservedAttachmentNames = scanned
      ? selectedOriginalAttachments().map((item) => item.filename).filter(Boolean)
      : [];
    const uniqueFontItems = assignUniqueAttachmentNames(identifiedFontItems, initialReservedAttachmentNames)
      .map((item, sourceIndex) => ({ ...item, sourceIndex }));
    const descriptorGroups = uniqueFontItems.map((item, attachmentIndex) => (
      item.fontIdentity.descriptors.map((descriptor, faceIndex) => ({
        ...item,
        index: `${attachmentIndex}:${faceIndex}`,
        attachmentIndex,
        descriptor,
      }))
    ));
    const descriptors = descriptorGroups.flat();

    if (fontDedupe.duplicates.length) {
      logEl.textContent += `INFO: 检测到 ${fontDedupe.duplicates.length} 个内容完全相同的重复字体，按 SHA-256 去重，不重复写入 MKV：${fontDedupe.duplicates.map((item) => item.file.name).join('、')}\n`;
    }
    for (const item of descriptors) {
      const attachmentRename = item.attachmentName !== item.file.name ? ` -> attachment “${item.attachmentName}”` : '';
      const collectionFace = item.descriptor.collectionIndex == null ? '' : ` · collection face #${item.descriptor.collectionIndex}`;
      logEl.textContent += `上传字体：${item.file.name}${attachmentRename} -> Family “${item.descriptor.family}” / ${item.descriptor.subfamily || 'Regular'} / weight ${item.descriptor.weight}${item.descriptor.italic ? ' / italic' : ''}${collectionFace}\n`;
    }
    if (descriptors.length) reportFontFamilyCompleteness(descriptors);

    let attachments = uniqueFontItems;
    let completionNote = '';
    let dependencyWarningCount = 0;
    const preparedSubtitles = [];

    let fontSubsetText = '';

    for (let index = 0; index < subtitleTracks.length; index += 1) {
      const track = subtitleTracks[index];
      const format = track.format || subtitleFormatInfo(track.file.name);

      if (!format?.text) {
        logEl.textContent += `字幕 #${index + 1}：${track.displayName || track.file.name} · ${format?.label || 'BITMAP'} · 二进制 stream copy\n`;
        preparedSubtitles.push({
          ...track,
          format,
          encoding: 'binary',
          outputText: null,
          inputExtension: format?.inputExtension || ext(track.file.name) || '.bin',
          codecOverride: null,
          expectedCodec: format?.expectedCodec || '',
          binary: true,
        });
        continue;
      }

      const { text: sourceText, encoding } = await readAssText(track.file);
      let outputText = sourceText;

      logEl.textContent += `字幕 #${index + 1}：${track.file.name} · ${format?.label || 'SUB'} · 编码 ${encoding}\n`;

      if (format?.assLike) {
        const analysis = analyzeAssFontUsage(sourceText);
        fontSubsetText += analysis.allCharacters.join('');

        if (descriptors.length && mode === 'force') {
          const primary = descriptors[0];
          const forcedFamily = preferredAssFontFamily(primary.descriptor);
          outputText = forceAssFontFamily(sourceText, forcedFamily);
          attachments = [uniqueFontItems[primary.attachmentIndex]];
          logEl.textContent += `INFO: 字幕 #${index + 1} 强制字体使用 libass 兼容族名 “${forcedFamily}”${forcedFamily !== primary.descriptor.family ? `（字体首选族名：${primary.descriptor.family}）` : ''}\n`;

          try {
            const coverage = await checkFontCharacters(primary.file, analysis.allCharacters, primary.descriptor.collectionIndex);
            if (coverage.missing.length) {
              dependencyWarningCount += 1;
              logEl.textContent += `WARNING: 字幕 #${index + 1} 强制字体缺少 ${coverage.missing.length}/${coverage.checkedCount} 个唯一字幕字符：${charPreview(coverage.missing)}\n`;
            }
          } catch (coverageError) {
            logEl.textContent += `WARNING: 字幕 #${index + 1} 无法完成字体缺字检查：${coverageError?.message || coverageError}\n`;
          }
        } else if (descriptors.length) {
          const dependencyResult = await analyzePreservedFonts(analysis, descriptors);
          dependencyWarningCount +=
            dependencyResult.missingFamilies.length +
            dependencyResult.faceFallbacks.length +
            dependencyResult.missingGlyphGroups.length;
        } else {
          logEl.textContent += `INFO: 字幕 #${index + 1} 未选择字体附件，跳过字体依赖与 glyph coverage 检查。\n`;
        }
      } else {
        fontSubsetText += visibleTextForPlainSubtitle(sourceText, format?.id);
      }

      preparedSubtitles.push({
        ...track,
        format,
        encoding,
        outputText,
        inputExtension: format?.inputExtension || ext(track.file.name) || '.txt',
        codecOverride: format?.ffmpegOutputCodec || null,
        expectedCodec: format?.expectedCodec || '',
        binary: false,
      });
    }

    if (fontSubsetEnabled?.checked && attachments.length) {
      status.textContent = '正在用 HarfBuzz 生成字体子集……';
      const beforeBytes = attachments.reduce((sum, item) => sum + Number(item.file.size || 0), 0);
      attachments = await subsetFontItems(attachments, fontSubsetText);
      const applied = attachments.filter((item) => item.subset?.applied);
      const skipped = attachments.filter((item) => item.subset?.enabled && !item.subset?.applied);
      const afterBytes = attachments.reduce((sum, item) => sum + Number(item.file.size || 0), 0);
      if (applied.length) {
        logEl.textContent += `字体子集化：${applied.length} 个文件 · ${formatBytes(beforeBytes)} → ${formatBytes(afterBytes)}。HarfBuzz 保留 layout glyph closure。\n`;
      }
      if (skipped.length) {
        logEl.textContent += `INFO: ${skipped.length} 个字体未子集化（TTC / OTC 集合或没有可提取字幕文本），保留原文件。\n`;
      }
    }

    if (mode === 'force' && preparedSubtitles.some((track) => track.format?.assLike) && uniqueFontItems.length > 1) {
      logEl.textContent += `INFO: 强制字体模式只对 ASS / SSA 生效，并只使用第一个字体文件；其余 ${uniqueFontItems.length - 1} 个上传字体文件不会附加。\n`;
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
      const path = `${prefix}-audio-${index}.source`;
      audioPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(track.file));
    }

    for (let index = 0; index < preparedSubtitles.length; index += 1) {
      const item = preparedSubtitles[index];
      const path = `${prefix}-subtitle-${index}${item.inputExtension}`;
      subtitlePrimaryPaths.push(path);
      subtitlePaths.push(path);

      if (item.binary) {
        await ffmpeg.writeFile(path, await fetchFile(item.file));
        if (item.format?.id === 'vobsub' && item.sidecarFile) {
          const sidecarPath = `${prefix}-subtitle-${index}.sub`;
          subtitlePaths.push(sidecarPath);
          await ffmpeg.writeFile(sidecarPath, await fetchFile(item.sidecarFile));
        }
      } else {
        await ffmpeg.writeFile(path, new TextEncoder().encode(item.outputText));
      }
    }

    for (let index = 0; index < attachments.length; index += 1) {
      const item = attachments[index];
      const path = `${prefix}-font-${index}${fontVirtualSuffix(item.fontIdentity)}`;
      fontPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(item.file));
    }
    if (cancelRequested) return;

    status.textContent = '正在读取输入容器结构……';
    const inputProbe = await probeInput(videoPath, probePath);
    const inputIdentity = videoIdentityFromProbe(video, inputProbe, headerVideoIdentity);
    if (!inputIdentity.hasVideo) {
      throw new Error(`“${video.name}”没有检测到可用视频轨。`);
    }
    if (!isSupportedVideoIdentity(inputIdentity)) {
      throw new Error(`实际检测到的媒体容器“${inputIdentity.containerLabel}”不在当前 MP4 / MOV / M4V / MKV / WebM Stream Copy 支持范围内。`);
    }
    const inputIdentityMismatch = identityMismatchMessage(inputIdentity);
    if (inputIdentityMismatch) {
      logEl.textContent += `WARNING: ${inputIdentityMismatch}；后续封装以 ffprobe 实际内容为准。\n`;
    } else {
      logEl.textContent += `INFO: 实际媒体身份：${inputIdentity.containerLabel} · ${inputIdentity.videoStreams.map((stream) => stream.codec_name || 'unknown').join(' / ')}。\n`;
    }

    const originalAttachmentCount = inputProbe.attachmentCount;
    const preserveAllSourceStreams = Boolean(appendMode && isMatroskaIdentity(inputIdentity));
    const sourceVideos = inputProbe.streams.filter((stream) => stream.codec_type === 'video');
    const sourceAudios = inputProbe.streams.filter((stream) => stream.codec_type === 'audio');
    const sourceSubtitles = inputProbe.streams.filter((stream) => stream.codec_type === 'subtitle');
    const sourceAttachments = inputProbe.streams.filter((stream) => stream.codec_type === 'attachment');
    const sourceData = inputProbe.streams.filter((stream) => stream.codec_type === 'data');
    const knownContainerTypes = new Set(['video', 'audio', 'subtitle', 'attachment', 'data']);
    const sourceOtherStreams = inputProbe.streams.filter((stream) => !knownContainerTypes.has(stream.codec_type));

    const selectedAudio = scanned ? selectedTracks('audio') : null;
    const selectedSubtitles = scanned ? selectedTracks('subtitle') : [];
    const originalAttachments = scanned ? selectedOriginalAttachments() : [];

    const reservedAttachmentNames = scanned
      ? originalAttachments.map((item) => item.filename).filter(Boolean)
      : (preserveAllOriginalAttachments
          ? sourceAttachments.map((stream) => String(stream.tags?.filename || '')).filter(Boolean)
          : []);
    const renamedFontItems = assignUniqueAttachmentNames(attachments, reservedAttachmentNames);
    renamedFontItems.forEach((named, index) => {
      if (attachments[index].attachmentName !== named.attachmentName) {
        logEl.textContent += `INFO: 新字体附件与原附件重名，“${attachments[index].attachmentName}”自动改为“${named.attachmentName}”。\n`;
      }
      attachments[index].attachmentName = named.attachmentName;
    });

    const runtimeExternalAudio = [];
    for (let index = 0; index < externalAudioTracks.length; index += 1) {
      const probeOutput = `${prefix}-audio-${index}-probe.json`;
      extraProbePaths.push(probeOutput);
      const probe = await probeInput(audioPaths[index], probeOutput);
      const audioIdentity = audioIdentityFromProbe(externalAudioTracks[index].file, probe);
      if (!audioIdentity.hasAudio) {
        throw new Error(`外部音频“${externalAudioTracks[index].file.name}”没有可用音频轨。`);
      }
      const audioMismatch = identityMismatchMessage(audioIdentity);
      if (audioMismatch) {
        logEl.textContent += `WARNING: 外部音频“${externalAudioTracks[index].file.name}”：${audioMismatch}；按实际 codec ${audioIdentity.codec || 'unknown'} 处理。\n`;
      }
      runtimeExternalAudio.push({
        ...externalAudioTracks[index],
        path: audioPaths[index],
        inputIndex: 1 + index,
        codec: audioIdentity.codec,
        identity: audioIdentity,
      });
    }

    const subtitleInputOffset = 1 + runtimeExternalAudio.length;
    const runtimeSubtitles = preparedSubtitles.map((track, index) => ({
      ...track,
      path: subtitlePrimaryPaths[index],
      inputIndex: subtitleInputOffset + index,
    }));

    const compatibilitySourceAudio = selectedAudio
      ? selectedAudio.map((track) => track.stream)
      : sourceAudios;
    const compatibilitySourceSubtitles = preserveAllOriginalSubtitles
      ? sourceSubtitles
      : selectedSubtitles.map((track) => track.stream);
    const compatibility = resolveMuxCompatibility({
      targetContainer: 'matroska',
      videoStreams: sourceVideos,
      sourceAudioStreams: compatibilitySourceAudio,
      externalAudioTracks: runtimeExternalAudio,
      newSubtitles: runtimeSubtitles,
      sourceSubtitleStreams: compatibilitySourceSubtitles,
      fontAttachments: attachments,
    });

    logEl.textContent += `COMPATIBILITY: ${summarizeCompatibility(compatibility)} · 视频/音频策略 stream-copy-only · silent transcode=false。\n`;
    for (const item of compatibility.issues) {
      const level = item.state === COMPATIBILITY_STATE.CONVERSION_REQUIRED ? 'INFO' : 'WARNING';
      logEl.textContent += `${level}: [${item.state}] ${item.message}\n`;
    }
    if (compatibility.state === COMPATIBILITY_STATE.UNSUPPORTED) {
      const reasons = compatibility.issues
        .filter((item) => item.state === COMPATIBILITY_STATE.UNSUPPORTED)
        .map((item) => item.message);
      throw new Error(`组合兼容性不支持：${reasons.join('；')}`);
    }

    if (scanned) {
      logEl.textContent += `轨道方案：原音频 ${selectedAudio.length}/${scanned.tracks.filter((x) => x.type === 'audio').length}，外部音频 ${runtimeExternalAudio.length}，新增字幕 ${runtimeSubtitles.length}，原字幕 ${selectedSubtitles.length}/${scanned.tracks.filter((x) => x.type === 'subtitle').length}，原附件 ${originalAttachments.length}/${scanned.attachments.length}。\n`;
    } else if (isMatroskaIdentity(inputIdentity)) {
      logEl.textContent += appendMode
        ? `INFO: 完整保留并追加模式：使用 -map 0 保留全部原 stream，并保留 Chapters 与 metadata；新增内容只追加。\n`
        : `INFO: 未扫描轨道，兼容模式保留所有原音频、不保留原字幕；原附件${preserveAllOriginalAttachments ? '全部保留' : '不保留'}。\n`;
    }

    status.textContent = '正在无损封装 MKV……';
    bar.style.width = '40%';

    const fontAttachments = attachments.map((item, index) => ({
      path: fontPaths[index],
      mimeType: fontMimeType(item.fontIdentity),
      filename: item.attachmentName,
    }));

    const args = buildMuxCommand({
      mainInputPath: videoPath,
      outputPath,
      sourceAudioCount: sourceAudios.length,
      sourceSubtitleCount: sourceSubtitles.length,
      preserveAllSourceStreams,
      originalAudioTracks: selectedAudio,
      externalAudioTracks: runtimeExternalAudio,
      newSubtitleTracks: runtimeSubtitles,
      originalSubtitleTracks: selectedSubtitles,
      preserveAllOriginalSubtitles,
      originalAttachments,
      preserveAllOriginalAttachments,
      preserveOriginalDataStreams: isMatroskaIdentity(inputIdentity),
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
      mimetype: fontMimeType(item.fontIdentity),
    }));

    const runtimeChanges = containerChangeCounts({ newFontCount: attachments.length });

    const expectedAudit = {
      video: sourceVideos.map((stream) => ({ codec: stream.codec_name || '' })),
      data: isMatroskaIdentity(inputIdentity)
        ? sourceData.map((stream) => ({ codec: stream.codec_name || '' }))
        : [],
      otherStreams: preserveAllSourceStreams
        ? sourceOtherStreams.map((stream) => ({
            type: stream.codec_type || 'unknown',
            codec: stream.codec_name || '',
          }))
        : [],
      audio: expectedAudio,
      subtitles: preserveAllSourceStreams
        ? [
            ...sourceSubtitles.map((stream) => ({
              codec: stream.codec_name || '',
              language: normalizeTrackLanguage(stream.tags?.language),
              title: stream.tags?.title || '',
              default: Boolean(stream.disposition?.default),
              forced: Boolean(stream.disposition?.forced),
              original: Boolean(stream.disposition?.original),
              commentary: Boolean(stream.disposition?.comment),
              hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
            })),
            ...runtimeSubtitles.map((track) => ({
              codec: track.expectedCodec || track.codec || '',
              language: normalizeTrackLanguage(track.language),
              title: track.title || '',
              default: track.default,
              forced: track.forced,
              original: track.original,
              commentary: track.commentary,
              hearingImpaired: track.hearingImpaired,
            })),
          ]
        : [
            ...runtimeSubtitles.map((track) => ({
              codec: track.expectedCodec || track.codec || '',
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
        const auditText = `封装后审计通过：${audit.counts.video} 视频 / ${audit.counts.audio} 音频 / ${audit.counts.subtitle} 字幕 / ${audit.counts.data} 数据 / ${audit.counts.other} 其他 / ${audit.counts.attachment} 附件 / ${audit.counts.chapter} 章节 · 变更 +${runtimeChanges.added} / −${runtimeChanges.removed} / ~${runtimeChanges.modified}。`;
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
      appVersion: '1.2.0',
      input: {
        name: video.name,
        sizeBytes: video.size,
        format: inputProbe.format?.format_name || '',
        formatTitle: inputProbe.format?.tags?.title || '',
        formatTags: preservableFormatTags(inputProbe.format?.tags || {}),
        videoCodecs: sourceVideos.map((stream) => stream.codec_name || 'unknown'),
        audioCodecs: sourceAudios.map((stream) => stream.codec_name || 'unknown'),
        dataCodecs: sourceData.map((stream) => stream.codec_name || 'unknown'),
        otherStreams: sourceOtherStreams.map((stream) => ({
          type: stream.codec_type || 'unknown',
          codec: stream.codec_name || 'unknown',
        })),
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
          format: track.format?.label || '',
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
          mimeType: fontMimeType(item.fontIdentity),
          subset: item.subset || { enabled: false, applied: false },
          faces: descriptors
            .filter((face) => face.attachmentIndex === (item.sourceIndex ?? uniqueFontItems.indexOf(item)))
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
      compatibility: {
        ...compatibility,
        execution: {
          muxSucceeded: true,
          auditStatus: finalAudit?.status || 'unknown',
          evidence: 'actual-ffmpeg-mux',
        },
      },
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
    const assLikeCount = runtimeSubtitles.filter((track) => track.format?.assLike).length;
    const webvttCount = runtimeSubtitles.filter((track) => track.format?.id === 'webvtt').length;
    const modeText = attachments.length
      ? (mode === 'force'
          ? `已处理 ${assLikeCount} 条 ASS / SSA 并附加 ${attachments.length} 个字体文件`
          : `已附加 ${attachments.length} 个字体文件`)
      : '未附加字体';
    const webvttNote = webvttCount ? `；${webvttCount} 条 WebVTT 已转换为 Matroska 兼容 SubRip 字幕流` : '';
    status.textContent = `完成。共新增 ${runtimeSubtitles.length} 条字幕；${modeText}${webvttNote}${completionNote}；新增 ${runtimeExternalAudio.length} 条外部音频；视频/音频未重新编码。`;

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

function batchVideoFiles() {
  return mergeFileSelections(batchVideoInput?.files, batchVideoFolderInput?.files);
}

function batchSubtitleFiles() {
  return mergeFileSelections(batchSubtitleInput?.files, batchSubtitleFolderInput?.files);
}

function batchFontCandidates() {
  const selected = mergeFileSelections(batchFontInput?.files, batchFontFolderInput?.files);
  return selected.length ? selected : selectedFonts();
}

async function syncBatchPlan() {
  if (!batchVideoInput || !batchSubtitleInput || !batchPlan) return null;

  const generation = ++batchPlanGeneration;
  const candidateVideos = batchVideoFiles();
  const subtitles = batchSubtitleFiles();
  const fontCandidates = batchFontCandidates();

  batchVideoName.textContent = Array.from(batchVideoInput.files || []).length
    ? `${Array.from(batchVideoInput.files || []).length} 个文件` : '未选择';
  batchVideoFolderName.textContent = Array.from(batchVideoFolderInput?.files || []).length
    ? `${Array.from(batchVideoFolderInput.files).length} 个文件` : '未选择';
  batchSubtitleName.textContent = Array.from(batchSubtitleInput.files || []).length
    ? `${Array.from(batchSubtitleInput.files || []).length} 个文件` : '未选择';
  batchSubtitleFolderName.textContent = Array.from(batchSubtitleFolderInput?.files || []).length
    ? `${Array.from(batchSubtitleFolderInput.files).length} 个文件` : '未选择';
  batchFontName.textContent = Array.from(batchFontInput?.files || []).length
    ? `${Array.from(batchFontInput.files).length} 个字体` : '未选择';
  batchFontFolderName.textContent = Array.from(batchFontFolderInput?.files || []).length
    ? `${Array.from(batchFontFolderInput.files).length} 个文件` : '未选择';

  batchStartBtn.disabled = true;
  batchCancelBtn.disabled = !batchRunning;
  if (batchSubsetScope) batchSubsetScope.disabled = batchRunning || !batchFontSubsetEnabled?.checked;

  if (candidateVideos.length || subtitles.length) {
    batchPlan.innerHTML = '<div class="track-empty">正在读取实际视频容器与字幕格式…</div>';
  }

  const [recognition, subtitleRecognition, fontRecognition] = await Promise.all([
    identifyBatchVideos(candidateVideos, {
      cache: batchVideoIdentityCache,
      concurrency: 8,
    }),
    identifySubtitleInputs(subtitles, {
      cache: batchSubtitleIdentityCache,
      concurrency: 8,
    }),
    identifyBatchFonts(fontCandidates, {
      cache: batchFontIdentityCache,
      concurrency: 4,
    }),
  ]);

  if (generation !== batchPlanGeneration) return null;

  const videos = recognition.recognized.map((entry) => entry.file);
  const fonts = fontRecognition.recognized.map((entry) => entry.file);
  const identityByVideo = new Map(recognition.recognized.map((entry) => [entry.file, entry]));
  const pairing = buildBatchJobsFromCollected(videos, subtitleRecognition);
  pairing.videoRecognition = recognition;
  pairing.subtitleRecognition = subtitleRecognition;
  pairing.fontRecognition = fontRecognition;
  pairing.fonts = fonts;
  pairing.jobs.forEach((job) => {
    const recognized = identityByVideo.get(job.video);
    job.videoIdentity = recognized?.identity || null;
    job.videoIdentityMismatch = recognized?.mismatch || '';
  });

  pairing.ignoredVideos = recognition.ignored.map((entry) => entry.file);

  pairing.directoryConflicts = [];
  pairing.directoryCheckError = '';
  if (batchOutputDirectoryHandle && pairing.jobs.length) {
    try {
      pairing.directoryConflicts = await findExistingBatchOutputs(
        batchOutputDirectoryHandle, pairing.jobs
      );
    } catch (error) {
      pairing.directoryCheckError = error?.message || String(error);
    }
  }
  if (generation !== batchPlanGeneration) return null;

  const rows = pairing.jobs.map((job, index) => {
    const identityText = job.videoIdentity?.containerLabel
      ? `实际：${job.videoIdentity.containerLabel}${job.videoIdentityMismatch ? ' · 扩展名不一致' : ''}`
      : '实际容器：未识别';
    return `
    <div class="plan-row plan-video">
      <span class="plan-kind">#${index + 1}</span>
      <span class="plan-main">
        <strong>${escapeHtml(job.video.name)}</strong>
        <small>${escapeHtml(identityText)} · ${escapeHtml(batchSubtitleSummary(job))} · ${job.subtitleTracks.map((track) => escapeHtml(track.displayName || track.file.name)).join('、')}</small>
      </span>
      <span class="plan-flags">→ ${escapeHtml(job.outputName)}</span>
    </div>`;
  }).join('');

  const notes = [];
  const mismatchCount = recognition.recognized.filter((entry) => entry.mismatch).length;
  if (mismatchCount) notes.push(`${mismatchCount} 个视频扩展名与实际内容不一致，已按实际容器识别`);
  if (recognition.ignored.length) notes.push(`${recognition.ignored.length} 个文件未识别为支持的视频容器`);
  if (subtitleRecognition.mismatches?.length) notes.push(`${subtitleRecognition.mismatches.length} 个字幕扩展名与实际内容不一致，已按实际格式识别`);
  if (pairing.ambiguousPairings.length) {
    const examples = pairing.ambiguousPairings.slice(0, 3).map(({ track, candidates }) =>
      `${track.file.name} → ${candidates.map((video) => video.webkitRelativePath || video.name).join(' / ')}`
    );
    notes.push(`${pairing.ambiguousPairings.length} 条字幕匹配多个视频（${examples.join('；')}）；请调整文件名或分批处理，未自动选择第一个`);
  }
  if (pairing.outputNameCollisions.length) {
    const examples = pairing.outputNameCollisions.map(({ outputName, videos }) =>
      `${outputName} ← ${videos.map((video) => video.webkitRelativePath || video.name).join(' / ')}`
    );
    notes.push(`输出文件名冲突（${examples.join('；')}）；请调整文件名或分批处理，以免覆盖已有任务产物`);
  }
  if (pairing.directoryConflicts.length) {
    notes.push(`输出目录已有 ${pairing.directoryConflicts.length} 个同名文件（${pairing.directoryConflicts.join('、')}）；不会覆盖，请换目录或移走冲突文件`);
  }
  if (pairing.directoryCheckError) {
    notes.push(`无法安全检查输出目录：${pairing.directoryCheckError}；已禁止启动，避免误覆盖`);
  }
  if (pairing.unmatchedVideos.length) notes.push(`${pairing.unmatchedVideos.length} 个视频没有匹配字幕`);
  if (pairing.unmatchedSubtitles.length) notes.push(`${pairing.unmatchedSubtitles.length} 条字幕没有匹配视频`);
  if (pairing.orphanSidecars.length) notes.push(`${pairing.orphanSidecars.length} 个 VobSub .sub 缺少同名 .idx`);
  if (pairing.invalidSubtitles.length) notes.push(`${pairing.invalidSubtitles.length} 个字幕输入无效或缺少配对文件`);
  const fontMismatchCount = fontRecognition.recognized.filter((entry) => entry.mismatch).length;
  if (fontMismatchCount) notes.push(`${fontMismatchCount} 个字体扩展名与实际内容不一致，已按实际字体结构识别`);
  if (fontRecognition.ignored.length) notes.push(`${fontRecognition.ignored.length} 个文件未识别为支持的字体`);
  if (fonts.length) {
    notes.push(`批量字体：${fonts.length} 个${batchFontSubsetEnabled?.checked ? ` · ${batchSubsetScope?.value === 'group' ? 'Group 子集' : '逐任务子集'}` : ' · 完整字体'}`);
  }
  if (batchOutputDirectoryHandle) notes.push(`输出目录：${batchOutputDirectoryHandle.name}`);

  batchPlan.innerHTML = rows || '<div class="track-empty">没有形成可执行配对。</div>';
  if (notes.length) batchPlan.innerHTML += `<div class="track-empty">${escapeHtml(notes.join('；'))}</div>`;
  batchStartBtn.disabled =
    batchRunning ||
    isBusy() ||
    !pairing.jobs.length ||
    pairing.ambiguousPairings.length > 0 ||
    pairing.outputNameCollisions.length > 0 ||
    pairing.directoryConflicts.length > 0 ||
    Boolean(pairing.directoryCheckError) ||
    pairing.invalidSubtitles.length > 0 ||
    fontRecognition.ignored.length > 0;
  batchCancelBtn.disabled = !batchRunning;
  if (batchSubsetScope) batchSubsetScope.disabled = batchRunning || !batchFontSubsetEnabled?.checked;

  latestBatchPairing = pairing;
  return pairing;
}

function requestBatchPlanSync() {
  batchPlanPromise = syncBatchPlan();
  return batchPlanPromise;
}

function setInputFiles(input, files) {
  const transfer = new DataTransfer();
  for (const file of files || []) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function chooseBatchOutputDirectory() {
  if (!('showDirectoryPicker' in window)) {
    batchOutputDirStatus.textContent = '当前浏览器不支持目录写入；仍可逐项保存。';
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const permission = await handle.requestPermission?.({ mode: 'readwrite' });
    if (permission && permission !== 'granted') throw new Error('没有输出目录写入权限。');
    batchOutputDirectoryHandle = handle;
    batchOutputDirStatus.textContent = `已选择：${handle.name}`;
    requestBatchPlanSync();
  } catch (error) {
    if (error?.name !== 'AbortError') {
      batchOutputDirStatus.textContent = `无法使用输出目录：${error?.message || error}`;
    }
  }
}

async function collectBatchSubsetText(pairing) {
  let text = '';
  for (const job of pairing.jobs || []) {
    for (const track of job.subtitleTracks || []) {
      const format = track.format || subtitleFormatInfo(track.file.name);
      if (!format?.text) continue;
      const decoded = await readAssText(track.file);
      if (format.assLike) {
        text += analyzeAssFontUsage(decoded.text).allCharacters.join('');
      } else {
        text += visibleTextForPlainSubtitle(decoded.text, format.id);
      }
    }
  }
  return text;
}

async function buildGroupedSubsetFonts(fonts, pairing) {
  if (!fonts.length) return [];
  const subsetText = await collectBatchSubsetText(pairing);
  const deduped = await dedupeFilesBySha256(fonts);
  const identityByFile = new Map(
    Array.from(pairing?.fontRecognition?.recognized || [])
      .map((entry) => [entry.file, entry.identity])
  );
  const items = deduped.unique.map((item) => ({
    ...item,
    attachmentName: normalizedFontAttachmentName(
      item.file.name,
      identityByFile.get(item.file) || null
    ),
    fontIdentity: identityByFile.get(item.file) || null,
  }));
  const subsetted = await subsetFontItems(items, subsetText);
  return subsetted.map((item) => item.file);
}

function waitForSingleMuxCompletion(timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (batchCancelRequested) {
        clearInterval(timer);
        reject(new Error('batch-cancelled'));
        return;
      }
      if (!running && !scanning && !previewing) {
        clearInterval(timer);
        if (downloadLink.classList.contains('hidden') || !downloadLink.href) {
          reject(new Error(status.textContent || '单项封装失败'));
          return;
        }
        try {
          const response = await fetch(downloadLink.href);
          const blob = await response.blob();
          let reportBlob = null;
          let reportName = '';
          if (!reportLink.classList.contains('hidden') && reportLink.href) {
            try {
              const reportResponse = await fetch(reportLink.href);
              reportBlob = await reportResponse.blob();
              reportName = reportLink.download || `${downloadLink.download || 'output.mkv'}.mux-report.json`;
            } catch {}
          }
          resolve({
            blob,
            outputName: downloadLink.download || 'output.mkv',
            reportBlob,
            reportName,
          });
        } catch (error) {
          reject(error);
        }
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('单项封装超时'));
      }
    }, 150);
  });
}

[
  batchVideoInput,
  batchVideoFolderInput,
  batchSubtitleInput,
  batchSubtitleFolderInput,
  batchFontInput,
  batchFontFolderInput,
].forEach((input) => input?.addEventListener('change', () => {
  requestBatchPlanSync();
}));
batchFontSubsetEnabled?.addEventListener('change', () => {
  requestBatchPlanSync();
});
batchSubsetScope?.addEventListener('change', () => {
  requestBatchPlanSync();
});
batchOutputDirBtn?.addEventListener('click', chooseBatchOutputDirectory);

batchCancelBtn?.addEventListener('click', () => {
  if (!batchRunning) return;
  batchCancelRequested = true;
  if (running || scanning || previewing) cancelBtn.click();
  batchStatus.textContent = '正在取消批量任务……';
});

batchStartBtn?.addEventListener('click', async () => {
  if (isBusy()) return;
  const pairing = await requestBatchPlanSync();
  if (!pairing) {
    batchStatus.textContent = '批量计划已被新的输入选择替代，请确认更新后的配对再开始。';
    return;
  }
  if (
    !pairing.jobs.length ||
    pairing.ambiguousPairings.length ||
    pairing.outputNameCollisions.length ||
    pairing.directoryConflicts.length ||
    pairing.directoryCheckError ||
    pairing.invalidSubtitles.length ||
    pairing.fontRecognition?.ignored?.length
  ) {
    batchStatus.textContent = '批量未开始：请先解决配对歧义、重名输出或无效输入。';
    return;
  }
  if (isBusy() || batchRunning) return;
  const selectedOutputDirectory = batchOutputDirectoryHandle;
  if (selectedOutputDirectory) {
    const planGeneration = batchPlanGeneration;
    try {
      const conflicts = await findExistingBatchOutputs(selectedOutputDirectory, pairing.jobs);
      if (planGeneration !== batchPlanGeneration || isBusy() || batchRunning) {
        batchStatus.textContent = '批量输入或执行状态已改变，请重新确认计划。';
        return;
      }
      if (conflicts.length) {
        batchStatus.textContent = `批量未开始：输出目录已有 ${conflicts.join('、')}；不会覆盖。`;
        requestBatchPlanSync();
        return;
      }
    } catch (error) {
      batchStatus.textContent = `批量未开始：无法核对输出目录（${error?.message || error}）。`;
      requestBatchPlanSync();
      return;
    }
  }

  batchRunning = true;
  batchCancelRequested = false;
  // Old batch links remain valid until a replacement batch actually starts.
  // Clear them together with the old results to release large Blob references.
  batchResultUrls.releaseAll();
  batchResults.innerHTML = '';
  batchStatus.textContent = `批量任务：0 / ${pairing.jobs.length}`;
  requestBatchPlanSync();

  const originalVideoFiles = Array.from(videoInput.files || []);
  const originalAudioFiles = Array.from(audioInput.files || []);
  const originalSubtitleFiles = Array.from(subInput.files || []);
  const originalFontFiles = Array.from(fontInput.files || []);
  const originalPreserveAttachments = preserveAttachments.checked;
  const originalAppendMode = appendPreserveAll?.checked;
  const originalAppendTouched = appendPreserveAll?.dataset.userTouched || '0';
  const originalSubsetEnabled = fontSubsetEnabled?.checked;
  const requestedBatchFonts = pairing.fonts || [];
  const results = [];
  let jobFonts = requestedBatchFonts;

  setInputFiles(audioInput, []);

  try {
    if (
      batchFontSubsetEnabled?.checked &&
      batchSubsetScope?.value === 'group' &&
      requestedBatchFonts.length
    ) {
      batchStatus.textContent = '正在汇总全批次字幕字符并生成 Group 字体子集……';
      jobFonts = await buildGroupedSubsetFonts(requestedBatchFonts, pairing);
    }

    for (let index = 0; index < pairing.jobs.length; index += 1) {
      if (batchCancelRequested) break;
      const job = pairing.jobs[index];
      batchStatus.textContent = `批量任务：${index + 1} / ${pairing.jobs.length} · ${job.video.name}`;

      setInputFiles(videoInput, [job.video]);
      await videoSniffPromise;
      setInputFiles(subInput, job.subtitleInputFiles);
      await subtitleInspectPromise;
      setInputFiles(fontInput, jobFonts);
      await fontInspectPromise;
      resetTrackState();

      const preserveAll = Boolean(batchPreserveAttachments?.checked && currentVideoIsMatroska(job.video));
      if (appendPreserveAll) {
        appendPreserveAll.dataset.userTouched = '1';
        appendPreserveAll.checked = preserveAll;
      }
      preserveAttachments.checked = preserveAll;

      if (fontSubsetEnabled) {
        fontSubsetEnabled.checked = Boolean(
          batchFontSubsetEnabled?.checked &&
          batchSubsetScope?.value !== 'group'
        );
      }
      syncNewTrackState();
      updateUI();

      try {
        muxBtn.click();
        if (!running) {
          throw new Error('批量单项封装未启动；后台任务仍占用执行器或当前输入尚未就绪。');
        }
        const result = await waitForSingleMuxCompletion();
        let savedToDirectory = false;
        let directorySaveError = '';
        if (selectedOutputDirectory) {
          try {
            // Recheck at write time; files may have appeared after preflight.
            await writeNewBatchOutput(selectedOutputDirectory, result.outputName, result.blob);
            if (result.reportBlob && result.reportName) {
              await writeNewBatchOutput(selectedOutputDirectory, result.reportName, result.reportBlob);
            }
            savedToDirectory = true;
          } catch (error) {
            // A successfully muxed artifact is not a failed encode merely
            // because optional directory persistence was refused or failed.
            directorySaveError = error?.message || String(error);
          }
        }

        const url = batchResultUrls.create(result.blob);
        const reportUrl = batchResultUrls.create(result.reportBlob);
        results.push({
          job,
          ok: true,
          url,
          outputName: result.outputName,
          reportUrl,
          reportName: result.reportName,
          savedToDirectory,
          directorySaveError,
        });
      } catch (error) {
        if (String(error?.message || error) === 'batch-cancelled') break;
        results.push({ job, ok: false, error: error?.message || String(error) });
      }

      batchResults.innerHTML = results.map((item) => item.ok
        ? `<div class="new-track-row"><div class="new-track-main"><strong>${escapeHtml(item.job.video.name)}</strong><small>完成${item.savedToDirectory ? ` · 已写入 ${escapeHtml(selectedOutputDirectory?.name || '输出目录')}` : item.directorySaveError ? ` · 目录写入未完成：${escapeHtml(item.directorySaveError)}；请使用下载链接保存成品` : ''}</small></div><div class="new-track-flags"><a class="download" href="${item.url}" download="${escapeHtml(item.outputName)}">保存 MKV</a>${item.reportUrl ? `<a class="report-download" href="${item.reportUrl}" download="${escapeHtml(item.reportName)}">报告</a>` : ''}</div></div>`
        : `<div class="new-track-row"><div class="new-track-main"><strong>${escapeHtml(item.job.video.name)}</strong><small>失败 · ${escapeHtml(item.error)}</small></div></div>`
      ).join('');
    }
  } finally {
    batchRunning = false;
    const done = results.filter((item) => item.ok).length;
    const failed = results.filter((item) => !item.ok).length;
    const unsaved = results.filter((item) => item.ok && item.directorySaveError).length;
    const saveWarning = unsaved ? `其中 ${unsaved} 项未完整写入目录，可通过下载链接另存。` : '';
    batchStatus.textContent = batchCancelRequested
      ? `批量已取消：完成 ${done}，失败 ${failed}。${saveWarning}`
      : `批量完成：成功 ${done}，失败 ${failed}。${saveWarning}`;
    batchCancelRequested = false;
    setInputFiles(videoInput, originalVideoFiles);
    await videoSniffPromise;
    setInputFiles(audioInput, originalAudioFiles);
    setInputFiles(subInput, originalSubtitleFiles);
    await subtitleInspectPromise;
    setInputFiles(fontInput, originalFontFiles);
    await fontInspectPromise;
    preserveAttachments.checked = originalPreserveAttachments;
    if (appendPreserveAll) {
      appendPreserveAll.checked = originalAppendMode;
      appendPreserveAll.dataset.userTouched = originalAppendTouched;
    }
    if (fontSubsetEnabled) fontSubsetEnabled.checked = originalSubsetEnabled;
    syncNewTrackState();
    updateUI();
    requestBatchPlanSync();
  }
});

resetTrackState();
updateUI();
