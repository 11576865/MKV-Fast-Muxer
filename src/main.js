import './style.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  analyzeAssFontUsage,
  checkFontCharacters,
  fontNameMatches,
  forceAssFontFamily,
  readFontDescriptor,
} from './ass-font-rewrite.js';

const $ = (id) => document.getElementById(id);

const videoInput = $('videoInput');
const subInput = $('subInput');
const fontInput = $('fontInput');
const fontMode = $('fontMode');
const fontModeHint = $('fontModeHint');
const subtitleLanguage = $('subtitleLanguage');
const preserveOriginal = $('preserveOriginal');
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
let cancelRequested = false;
let outputURL = null;

ffmpeg.on('log', ({ message }) => {
  logEl.textContent += message + '\n';
  logEl.scrollTop = logEl.scrollHeight;
});

ffmpeg.on('progress', ({ progress }) => {
  if (running && Number.isFinite(progress) && progress >= 0) {
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

function formatFontSelection(files) {
  if (!files.length) return '未选择';
  if (files.length === 1) return files[0].name;
  const head = files.slice(0, 3).map((file) => file.name).join('、');
  return files.length > 3 ? `${files.length} 个字体：${head}…` : `${files.length} 个字体：${head}`;
}

function setInputsDisabled(disabled) {
  videoInput.disabled = disabled;
  subInput.disabled = disabled;
  fontInput.disabled = disabled;
  fontMode.disabled = disabled;
  subtitleLanguage.disabled = disabled;
  preserveOriginal.disabled = disabled || ext(videoInput.files[0]?.name || '') !== '.mkv';
}

function updateUI() {
  const video = videoInput.files[0];
  const sub = subInput.files[0];
  const fonts = selectedFonts();
  const inputIsMkv = ext(video?.name || '') === '.mkv';
  const mode = fontMode.value || 'preserve';

  $('videoName').textContent = video?.name ?? '未选择';
  $('subName').textContent = sub?.name ?? '未选择';
  $('fontName').textContent = formatFontSelection(fonts);
  $('fontSummary').textContent = fonts.length ? `${fonts.length} file${fonts.length === 1 ? '' : 's'}` : '—';
  $('outputName').textContent = video ? safeOutputName(video.name) : '—';

  fontModeHint.textContent = mode === 'force'
    ? '兼容旧行为：只使用并附加第一个上传字体；ASS 的 Style Fontname 与内联 \\fn 会统一改写。'
    : '保留 ASS 原有 Fontname；解析实际使用的 Style、内联 \\fn 与 \\r，并检查上传字体是否满足依赖。';

  if (!inputIsMkv) preserveOriginal.checked = false;
  preserveOriginal.disabled = running || !inputIsMkv;

  muxBtn.disabled = running || !(video && sub && fonts.length);
  cancelBtn.disabled = !running;
  setInputsDisabled(running);
}

videoInput.addEventListener('change', updateUI);
subInput.addEventListener('change', updateUI);
fontInput.addEventListener('change', updateUI);
fontMode.addEventListener('change', updateUI);
updateUI();

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
    subtitleCount: streams.filter((stream) => stream.codec_type === 'subtitle').length,
    attachmentCount: streams.filter((stream) => stream.codec_type === 'attachment').length,
  };
}

function mimeForFont(file) {
  return ext(file.name) === '.otf' ? 'font/otf' : 'font/ttf';
}

function charPreview(chars, limit = 24) {
  const values = chars.slice(0, limit).map((char) => (
    `${char}(U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`
  ));
  return values.join(' ') + (chars.length > limit ? ' …' : '');
}

async function analyzePreservedFonts(analysis, uploadedFonts) {
  const usedUploaded = new Set();
  const missingFamilies = [];
  const missingGlyphGroups = [];

  logEl.textContent += `ASS 实际使用字体：${analysis.usedFonts.length}；样式声明字体：${analysis.declaredFonts.length}\n`;

  for (const required of analysis.usedFonts) {
    const matches = uploadedFonts.filter((item) => fontNameMatches(required.name, item.descriptor));

    if (!matches.length) {
      missingFamilies.push(required.name);
      logEl.textContent += `WARNING: ASS 字体依赖未满足：“${required.name}”（来源：${required.sources.join(', ') || 'Dialogue'}）\n`;
      continue;
    }

    for (const match of matches) usedUploaded.add(match.index);

    logEl.textContent += `字体映射：“${required.name}” -> ${matches.map((item) => item.file.name).join('、')}\n`;

    if (!required.characters.length) continue;

    let remaining = [...required.characters];
    let successfulChecks = 0;

    for (const match of matches) {
      if (!remaining.length) break;
      try {
        const result = await checkFontCharacters(match.file, remaining);
        const missing = new Set(result.missing);
        remaining = remaining.filter((char) => missing.has(char));
        successfulChecks += 1;
      } catch (error) {
        logEl.textContent += `WARNING: 无法检查“${match.file.name}”的字形覆盖：${error?.message || error}\n`;
      }
    }

    if (successfulChecks > 0 && remaining.length) {
      missingGlyphGroups.push({ font: required.name, characters: remaining });
      logEl.textContent += `WARNING: “${required.name}”对应的上传字体仍缺少 ${remaining.length} 个实际字幕字符：${charPreview(remaining)}\n`;
    } else if (successfulChecks > 0) {
      logEl.textContent += `字形覆盖通过：“${required.name}”的 ${required.characters.length} 个实际字幕字符均有至少一个匹配字体覆盖。\n`;
    }
  }

  const unused = uploadedFonts.filter((item) => !usedUploaded.has(item.index));
  if (unused.length) {
    logEl.textContent += `INFO: ${unused.length} 个上传字体未匹配到当前 ASS 的实际字体依赖，但仍会作为附件封装：${unused.map((item) => item.file.name).join('、')}\n`;
  }

  return { missingFamilies, missingGlyphGroups };
}

cancelBtn.addEventListener('click', () => {
  if (!running) return;
  cancelRequested = true;
  status.textContent = '正在取消任务……';
  logEl.textContent += 'CANCEL: 用户请求终止当前任务。\n';
  ffmpeg.terminate();
  loaded = false;
});

muxBtn.addEventListener('click', async () => {
  if (running) return;

  const video = videoInput.files[0];
  const sub = subInput.files[0];
  const fontFiles = selectedFonts();
  if (!video || !sub || !fontFiles.length) return;

  const videoExt = ext(video.name);
  const subExt = ext(sub.name);
  const invalidFont = fontFiles.find((file) => !['.ttf', '.otf'].includes(ext(file.name)));
  const mode = fontMode.value || 'preserve';
  const keepOriginalTracks = preserveOriginal.checked && videoExt === '.mkv';
  const language = subtitleLanguage.value || 'und';

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
    status.textContent = '正在解析 ASS 与字体内部名称……';
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
      logEl.textContent += `上传字体：${item.file.name} -> Family “${item.descriptor.family}”${item.descriptor.subfamily ? ` / ${item.descriptor.subfamily}` : ''}\n`;
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
        dependencyResult.missingGlyphGroups.length;

      const parts = [];
      if (dependencyResult.missingFamilies.length) {
        parts.push(`缺 ${dependencyResult.missingFamilies.length} 个字体依赖`);
      }
      if (dependencyResult.missingGlyphGroups.length) {
        parts.push(`${dependencyResult.missingGlyphGroups.length} 个字体存在缺字`);
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

    let originalAttachmentCount = 0;
    if (keepOriginalTracks) {
      status.textContent = '正在读取原 MKV 轨道信息……';
      const probe = await probeInput(videoPath, probePath);
      originalAttachmentCount = probe.attachmentCount;
      logEl.textContent += `保留原 MKV 字幕轨：${probe.subtitleCount}；附件：${probe.attachmentCount}\n`;
    } else if (videoExt === '.mkv') {
      logEl.textContent += '原 MKV 字幕与附件不会写入输出。\n';
    }

    status.textContent = '正在无损封装 MKV……';
    bar.style.width = '40%';

    const args = [
      '-i', videoPath,
      '-i', subPath,
      '-map', '0:v?',
      '-map', '0:a?',
      '-map', '1:0',
    ];

    if (keepOriginalTracks) {
      args.push('-map', '0:s?', '-map', '0:t?');
    }

    args.push(
      '-map_metadata', '0',
      '-map_chapters', '0',
      '-c', 'copy',
      '-metadata:s:s:0', `language=${language}`,
      '-metadata:s:s:0', `title=${languageTitles[language] || 'ASS 字幕'}`,
      '-disposition:s:0', 'default',
    );

    attachments.forEach((item, index) => {
      const attachmentIndex = originalAttachmentCount + index;
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
      logEl.textContent += `完成，但存在 ${dependencyWarningCount} 组字体依赖/字形覆盖警告。请在发布前检查日志。\n`;
    }

    videoInput.value = '';
    subInput.value = '';
  } catch (err) {
    console.error(err);
    if (cancelRequested || String(err?.message || err).includes('terminate')) {
      status.textContent = '任务已取消。下次封装会重新加载 ffmpeg.wasm 核心。';
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
