import './style.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  analyzeAssFontUsage,
  checkFontCharacters,
  forceAssFontFamily,
  readFontDescriptor,
  scoreFontFaceMatch,
} from './ass-font-rewrite.js';

const $ = (id) => document.getElementById(id);

const videoInput = $('videoInput');
const subInput = $('subInput');
const fontInput = $('fontInput');
const fontMode = $('fontMode');
const fontModeHint = $('fontModeHint');
const subtitleLanguage = $('subtitleLanguage');
const newSubTitle = $('newSubTitle');
const newSubDefault = $('newSubDefault');
const newSubForced = $('newSubForced');
const preserveAttachments = $('preserveAttachments');
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
let trackState = null;

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

function fileKey(file) {
  return file ? `${file.name}|${file.size}|${file.lastModified}` : '';
}

function formatFontSelection(files) {
  if (!files.length) return '未选择';
  if (files.length === 1) return files[0].name;
  const head = files.slice(0, 3).map((file) => file.name).join('、');
  return files.length > 3 ? `${files.length} 个字体：${head}…` : `${files.length} 个字体：${head}`;
}

function isBusy() {
  return running || scanning;
}

function setInputsDisabled(disabled) {
  videoInput.disabled = disabled;
  subInput.disabled = disabled;
  fontInput.disabled = disabled;
  fontMode.disabled = disabled;
  subtitleLanguage.disabled = disabled;
  newSubTitle.disabled = disabled;
  newSubDefault.disabled = disabled;
  newSubForced.disabled = disabled;
  preserveAttachments.disabled = disabled || ext(videoInput.files[0]?.name || '') !== '.mkv';
}

function resetTrackState() {
  trackState = null;
  trackList.innerHTML = '<div class="track-empty">选择 MKV 后可扫描轨道。非 MKV 输入默认保留所有音频。</div>';
  renderMuxPlan();
}

function updateUI() {
  const video = videoInput.files[0];
  const sub = subInput.files[0];
  const fonts = selectedFonts();
  const inputIsMkv = ext(video?.name || '') === '.mkv';
  const mode = fontMode.value || 'preserve';
  const busy = isBusy();

  $('videoName').textContent = video?.name ?? '未选择';
  $('subName').textContent = sub?.name ?? '未选择';
  $('fontName').textContent = formatFontSelection(fonts);
  $('fontSummary').textContent = fonts.length ? `${fonts.length} file${fonts.length === 1 ? '' : 's'}` : '—';
  $('outputName').textContent = video ? safeOutputName(video.name) : '—';

  fontModeHint.textContent = mode === 'force'
    ? '兼容旧行为：只使用并附加第一个上传字体；ASS 的 Style Fontname 与显式内联 \\fn 会统一改写。'
    : '保留 ASS Fontname；按 Family、Weight/Bold、Italic 匹配具体字体 face，并检查实际字符覆盖。';

  if (!inputIsMkv) {
    preserveAttachments.checked = false;
    if (trackState) resetTrackState();
  }

  preserveAttachments.disabled = busy || !inputIsMkv;
  scanTracksBtn.disabled = busy || !inputIsMkv || !video;
  muxBtn.disabled = busy || !(video && sub && fonts.length);
  cancelBtn.disabled = !busy;
  setInputsDisabled(busy);
  refreshPlanBtn.disabled = busy;
  renderMuxPlan();
}

videoInput.addEventListener('change', () => {
  resetTrackState();
  preserveAttachments.checked = false;
  updateUI();
});
subInput.addEventListener('change', updateUI);
fontInput.addEventListener('change', updateUI);
fontMode.addEventListener('change', updateUI);
subtitleLanguage.addEventListener('change', renderMuxPlan);
newSubTitle.addEventListener('input', renderMuxPlan);
newSubDefault.addEventListener('change', renderMuxPlan);
newSubForced.addEventListener('change', renderMuxPlan);
preserveAttachments.addEventListener('change', renderMuxPlan);
refreshPlanBtn.addEventListener('click', renderMuxPlan);

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

async function probeInput(path, probePath) {
  const code = await ffmpeg.ffprobe([
    '-v', 'error',
    '-show_streams',
    '-of', 'json',
    path,
    '-o', probePath,
  ]);
  if (code !== 0) throw new Error(`ffprobe 返回错误代码 ${code}`);

  const raw = await ffmpeg.readFile(probePath);
  const json = JSON.parse(new TextDecoder().decode(raw));
  const streams = Array.isArray(json.streams) ? json.streams : [];

  return {
    streams,
    attachmentCount: streams.filter((stream) => stream.codec_type === 'attachment').length,
  };
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

function normalizeTrackLanguage(value) {
  const trimmed = String(value || '').trim().toLowerCase();
  return trimmed || 'und';
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

function defaultConflictWarnings() {
  const warnings = [];
  const audioDefaults = selectedTracks('audio').filter((track) => track.default);
  const originalSubtitleDefaults = selectedTracks('subtitle').filter((track) => track.default);
  const subtitleDefaultCount = originalSubtitleDefaults.length + (newSubDefault.checked ? 1 : 0);

  if (audioDefaults.length > 1) {
    warnings.push(`存在 ${audioDefaults.length} 条 Default 音频轨；播放器行为可能不一致。`);
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

  if (trackState) {
    selectedTracks('audio').forEach((track, index) => {
      entries.push({
        kind: `音频 ${index + 1}`,
        title: track.title || `Audio #${track.index}`,
        meta: `${track.stream.codec_name || 'unknown'} · ${normalizeTrackLanguage(track.language)} · source #${track.index}`,
        flags: dispositionValue(track.default, false),
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

  if (subInput.files[0]) {
    entries.push({
      kind: '字幕 1',
      title: newSubTitle.value.trim() || languageTitles[subtitleLanguage.value] || 'ASS 字幕',
      meta: `ASS · ${normalizeTrackLanguage(subtitleLanguage.value)} · 新增`,
      flags: dispositionValue(newSubDefault.checked, newSubForced.checked),
    });
  }

  selectedTracks('subtitle').forEach((track, index) => {
    entries.push({
      kind: `字幕 ${index + 2}`,
      title: track.title || `Subtitle #${track.index}`,
      meta: `${track.stream.codec_name || 'unknown'} · ${normalizeTrackLanguage(track.language)} · source #${track.index}`,
      flags: dispositionValue(track.default, track.forced),
    });
  });

  if (preserveAttachments.checked) {
    entries.push({
      kind: '附件',
      title: trackState
        ? `${trackState.attachmentCount} 个原 MKV 附件`
        : '原 MKV 附件',
      meta: trackState ? '按源顺序保留' : '未扫描 · 数量将在封装时探测',
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

  if (!entries.length) {
    return { entries, warnings };
  }

  if (trackState && selectedTracks('audio').length === 0) {
    warnings.push('扫描后没有选择任何音频轨；输出将没有音频。');
  }

  return { entries, warnings };
}

function renderMuxPlan() {
  if (!muxPlan || !planWarnings) return;
  const { entries, warnings } = buildMuxPlan();

  muxPlan.innerHTML = entries.length
    ? entries.map((entry) => `
      <div class="plan-row">
        <span class="plan-kind">${escapeHtml(entry.kind)}</span>
        <span class="plan-main">
          <strong>${escapeHtml(entry.title)}</strong>
          <small>${escapeHtml(entry.meta)}</small>
        </span>
        <span class="plan-flags">${escapeHtml(entry.flags === '0' ? '—' : entry.flags)}</span>
      </div>`).join('')
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
      <div class="track-row">
        <div class="track-title">
          <strong>${escapeHtml(streamLabel(track.stream))}</strong>
          <span class="track-meta">原始 Default=${track.originalDefault ? '1' : '0'}${track.type === 'subtitle' ? ` · Forced=${track.originalForced ? '1' : '0'}` : ''}</span>
          <div class="track-edit-grid">
            <label>语言
              <input type="text" data-track-field="language" data-track-index="${track.index}" value="${escapeHtml(track.language)}" maxlength="16" ${track.include ? '' : 'disabled'}>
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
        </div>
      </div>`;
  }).join('');
  renderMuxPlan();
}

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
    }
  } else if (fieldInput) {
    track[fieldInput.dataset.trackField] = fieldInput.value;
  }

  renderTrackList();
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
        originalDefault: Boolean(stream.disposition?.default),
        originalForced: Boolean(stream.disposition?.forced),
      }));

    trackState = {
      fileKey: fileKey(video),
      tracks,
      attachmentCount: probe.attachmentCount,
    };

    renderTrackList();
    bar.style.width = '0%';
    status.textContent = `轨道扫描完成：${tracks.filter((x) => x.type === 'audio').length} 条音频，${tracks.filter((x) => x.type === 'subtitle').length} 条字幕。`;
  } catch (err) {
    if (cancelRequested || String(err?.message || err).includes('terminate')) {
      status.textContent = '轨道扫描已取消。';
    } else {
      logEl.textContent += `ERROR: ${err?.stack || err}\n`;
      status.textContent = `轨道扫描失败：${err?.message || err}`;
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
  return ext(file.name) === '.otf' ? 'font/otf' : 'font/ttf';
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
        const result = await checkFontCharacters(entry.item.file, remaining);
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

function dispositionValue(isDefault, isForced = false) {
  const values = [];
  if (isDefault) values.push('default');
  if (isForced) values.push('forced');
  return values.length ? values.join('+') : '0';
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

  const video = videoInput.files[0];
  const sub = subInput.files[0];
  const fontFiles = selectedFonts();
  if (!video || !sub || !fontFiles.length) return;

  const videoExt = ext(video.name);
  const subExt = ext(sub.name);
  const invalidFont = fontFiles.find((file) => !['.ttf', '.otf'].includes(ext(file.name)));
  const mode = fontMode.value || 'preserve';
  const language = subtitleLanguage.value || 'und';
  const scanned = getScannedSelection(video);
  const keepOriginalAttachments = preserveAttachments.checked && videoExt === '.mkv';

  if (!['.mp4', '.mkv', '.webm', '.mov', '.m4v'].includes(videoExt)) {
    status.textContent = '请选择 MP4 / MKV / WebM / MOV / M4V 视频文件。';
    return;
  }
  if (subExt !== '.ass') {
    status.textContent = '字幕必须是 .ass 文件。';
    return;
  }
  if (invalidFont) {
    status.textContent = `字体“${invalidFont.name}”不是 .ttf 或 .otf 文件。`;
    return;
  }

  running = true;
  cancelRequested = false;
  updateUI();
  downloadLink.classList.add('hidden');
  logEl.textContent = '';
  bar.style.width = '4%';

  if (outputURL) {
    URL.revokeObjectURL(outputURL);
    outputURL = null;
  }

  const prefix = taskPrefix();
  const videoPath = `${prefix}-input${videoExt}`;
  const subPath = `${prefix}-subtitle.ass`;
  const outputPath = `${prefix}-output.mkv`;
  const probePath = `${prefix}-probe.json`;
  const outputName = safeOutputName(video.name);
  const fontPaths = [];

  try {
    status.textContent = '正在解析 ASS 与字体 face……';
    bar.style.width = '10%';

    const [{ text: sourceAss, encoding: assEncoding }, descriptors] = await Promise.all([
      readAssText(sub),
      Promise.all(fontFiles.map(async (file, index) => ({
        index,
        file,
        descriptor: await readFontDescriptor(file),
      }))),
    ]);
    if (cancelRequested) return;

    logEl.textContent += `ASS 编码：${assEncoding}\n`;
    for (const item of descriptors) {
      logEl.textContent += `上传字体：${item.file.name} -> Family “${item.descriptor.family}” / ${item.descriptor.subfamily || 'Regular'} / weight ${item.descriptor.weight}${item.descriptor.italic ? ' / italic' : ''}\n`;
    }

    const analysis = analyzeAssFontUsage(sourceAss);
    let outputAss = sourceAss;
    let attachments = descriptors;
    let completionNote = '';
    let dependencyWarningCount = 0;

    if (mode === 'force') {
      const primary = descriptors[0];
      outputAss = forceAssFontFamily(sourceAss, primary.descriptor.family);
      attachments = [primary];

      if (descriptors.length > 1) {
        logEl.textContent += `INFO: 强制字体模式只使用第一个字体；其余 ${descriptors.length - 1} 个上传字体不会附加。\n`;
      }

      logEl.textContent += `ASS 字体已强制统一为：${primary.descriptor.family}\n`;

      try {
        const coverage = await checkFontCharacters(primary.file, analysis.allCharacters);
        if (coverage.missing.length) {
          dependencyWarningCount += 1;
          completionNote = `；强制字体缺少 ${coverage.missing.length} 个字幕字符`;
          logEl.textContent += `WARNING: 强制字体缺少 ${coverage.missing.length}/${coverage.checkedCount} 个唯一字幕字符：${charPreview(coverage.missing)}\n`;
        } else {
          logEl.textContent += `字体缺字检查通过：${coverage.checkedCount} 个唯一字幕字符均可在“${primary.descriptor.family}”中找到。\n`;
        }
      } catch (coverageError) {
        logEl.textContent += `WARNING: 无法完成字体缺字检查：${coverageError?.message || coverageError}\n`;
      }
    } else {
      const dependencyResult = await analyzePreservedFonts(analysis, descriptors);
      dependencyWarningCount =
        dependencyResult.missingFamilies.length +
        dependencyResult.faceFallbacks.length +
        dependencyResult.missingGlyphGroups.length;

      const parts = [];
      if (dependencyResult.missingFamilies.length) {
        parts.push(`缺 ${dependencyResult.missingFamilies.length} 个字体依赖`);
      }
      if (dependencyResult.faceFallbacks.length) {
        parts.push(`${dependencyResult.faceFallbacks.length} 个 face 仅近似匹配`);
      }
      if (dependencyResult.missingGlyphGroups.length) {
        parts.push(`${dependencyResult.missingGlyphGroups.length} 个 face 存在缺字`);
      }
      if (parts.length) completionNote = `；警告：${parts.join('，')}`;
    }

    await loadFFmpeg();
    if (cancelRequested) return;

    status.textContent = '正在把文件载入浏览器内存……';
    bar.style.width = '20%';

    await ffmpeg.writeFile(videoPath, await fetchFile(video));
    await ffmpeg.writeFile(subPath, new TextEncoder().encode(outputAss));

    for (let i = 0; i < attachments.length; i++) {
      const item = attachments[i];
      const path = `${prefix}-font-${i}${ext(item.file.name)}`;
      fontPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(item.file));
    }
    if (cancelRequested) return;

    let originalAttachmentCount = scanned?.attachmentCount ?? 0;
    if (keepOriginalAttachments && !scanned) {
      status.textContent = '正在读取原 MKV 附件信息……';
      originalAttachmentCount = (await probeInput(videoPath, probePath)).attachmentCount;
    }

    const selectedAudio = scanned ? selectedTracks('audio') : null;
    const selectedSubtitles = scanned ? selectedTracks('subtitle') : [];

    if (scanned) {
      logEl.textContent += `轨道方案：音频 ${selectedAudio.length}/${scanned.tracks.filter((x) => x.type === 'audio').length}，原字幕 ${selectedSubtitles.length}/${scanned.tracks.filter((x) => x.type === 'subtitle').length}，原附件 ${keepOriginalAttachments ? scanned.attachmentCount : 0}。\n`;
    } else if (videoExt === '.mkv') {
      logEl.textContent += 'INFO: 未扫描轨道，按兼容模式保留所有音频、不保留原字幕。\n';
    }

    status.textContent = '正在无损封装 MKV……';
    bar.style.width = '40%';

    const args = [
      '-i', videoPath,
      '-i', subPath,
      '-map', '0:v?',
    ];

    if (selectedAudio) {
      for (const track of selectedAudio) args.push('-map', `0:${track.index}`);
    } else {
      args.push('-map', '0:a?');
    }

    args.push('-map', '1:0');

    for (const track of selectedSubtitles) {
      args.push('-map', `0:${track.index}`);
    }

    if (keepOriginalAttachments) {
      args.push('-map', '0:t?');
    }

    args.push(
      '-map_metadata', '0',
      '-map_chapters', '0',
      '-c', 'copy',
      '-metadata:s:s:0', `language=${language}`,
      '-metadata:s:s:0', `title=${newSubTitle.value.trim() || languageTitles[language] || 'ASS 字幕'}`,
      '-disposition:s:0', dispositionValue(newSubDefault.checked, newSubForced.checked),
    );

    if (selectedAudio) {
      selectedAudio.forEach((track, index) => {
        args.push(
          `-metadata:s:a:${index}`, `language=${normalizeTrackLanguage(track.language)}`,
          `-metadata:s:a:${index}`, `title=${track.title || ''}`,
          `-disposition:a:${index}`, dispositionValue(track.default, false),
        );
      });
    }

    selectedSubtitles.forEach((track, index) => {
      args.push(
        `-metadata:s:s:${index + 1}`, `language=${normalizeTrackLanguage(track.language)}`,
        `-metadata:s:s:${index + 1}`, `title=${track.title || ''}`,
        `-disposition:s:${index + 1}`, dispositionValue(track.default, track.forced),
      );
    });

    attachments.forEach((item, index) => {
      const attachmentIndex = (keepOriginalAttachments ? originalAttachmentCount : 0) + index;
      args.push(
        '-attach', fontPaths[index],
        `-metadata:s:t:${attachmentIndex}`, `mimetype=${mimeForFont(item.file)}`,
        `-metadata:s:t:${attachmentIndex}`, `filename=${item.file.name}`,
      );
    });

    args.push(outputPath);

    const code = await ffmpeg.exec(args);
    if (cancelRequested) return;
    if (code !== 0) throw new Error(`FFmpeg 返回错误代码 ${code}`);

    status.textContent = '正在准备保存……';
    bar.style.width = '96%';

    const data = await ffmpeg.readFile(outputPath);
    outputURL = URL.createObjectURL(
      new Blob([data.buffer], { type: 'video/x-matroska' })
    );

    downloadLink.href = outputURL;
    downloadLink.download = outputName;
    downloadLink.textContent = `保存 ${outputName}`;
    downloadLink.classList.remove('hidden');

    bar.style.width = '100%';
    const modeText = mode === 'force'
      ? `已强制统一字体并附加 ${attachments.length} 个字体文件`
      : `已保留 ASS 字体并附加 ${attachments.length} 个字体文件`;
    status.textContent = `完成。ASS 已按 ${assEncoding} 正确读取；${modeText}${completionNote}；视频/音频未重新编码。`;

    if (dependencyWarningCount) {
      logEl.textContent += `完成，但存在 ${dependencyWarningCount} 组字体 face / 字形覆盖警告。请在发布前检查日志。\n`;
    }

    videoInput.value = '';
    subInput.value = '';
    resetTrackState();
  } catch (err) {
    console.error(err);
    if (cancelRequested || String(err?.message || err).includes('terminate')) {
      status.textContent = '任务已取消。下次操作会重新加载 ffmpeg.wasm 核心。';
      bar.style.width = '0%';
    } else {
      logEl.textContent += `ERROR: ${err?.stack || err}\n`;
      status.textContent = `失败：${err?.message || err}`;
      bar.style.width = '0%';
    }
  } finally {
    if (loaded) {
      await removeQuietly(videoPath);
      await removeQuietly(subPath);
      for (const path of fontPaths) await removeQuietly(path);
      await removeQuietly(outputPath);
      await removeQuietly(probePath);
    }
    running = false;
    cancelRequested = false;
    updateUI();
  }
});

resetTrackState();
updateUI();
