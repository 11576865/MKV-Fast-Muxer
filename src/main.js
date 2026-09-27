import './style.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { checkFontCoverage, forceAssFontFamily, readFontFamily } from './ass-font-rewrite.js';

const $ = (id) => document.getElementById(id);

const videoInput = $('videoInput');
const subInput = $('subInput');
const fontInput = $('fontInput');
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
  const m = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

function safeOutputName(videoName) {
  return videoName.replace(/\.[^.]+$/, '') + '.mkv';
}

function setInputsDisabled(disabled) {
  videoInput.disabled = disabled;
  subInput.disabled = disabled;
  fontInput.disabled = disabled;
  subtitleLanguage.disabled = disabled;
  preserveOriginal.disabled = disabled || ext(videoInput.files[0]?.name || '') !== '.mkv';
}

function updateUI() {
  const video = videoInput.files[0];
  const sub = subInput.files[0];
  const font = fontInput.files[0];
  const inputIsMkv = ext(video?.name || '') === '.mkv';

  $('videoName').textContent = video?.name ?? '未选择';
  $('subName').textContent = sub?.name ?? '未选择';
  $('fontName').textContent = font?.name ?? '未选择';
  $('outputName').textContent = video ? safeOutputName(video.name) : '—';

  if (!inputIsMkv) {
    preserveOriginal.checked = false;
  }
  preserveOriginal.disabled = running || !inputIsMkv;

  muxBtn.disabled = running || !(video && sub && font);
  cancelBtn.disabled = !running;
  setInputsDisabled(running);
}

videoInput.addEventListener('change', updateUI);
subInput.addEventListener('change', updateUI);
fontInput.addEventListener('change', updateUI);
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
  const random = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
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
  const font = fontInput.files[0];
  if (!video || !sub || !font) return;

  const videoExt = ext(video.name);
  const subExt = ext(sub.name);
  const fontExt = ext(font.name);
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
  if (!['.ttf', '.otf'].includes(fontExt)) {
    status.textContent = '字体必须是 .ttf 或 .otf 文件。';
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
  const fontPath = `${prefix}-font${fontExt}`;
  const outputPath = `${prefix}-output.mkv`;
  const probePath = `${prefix}-probe.json`;
  const outputName = safeOutputName(video.name);
  const fontMime = fontExt === '.otf' ? 'font/otf' : 'font/ttf';

  try {
    await loadFFmpeg();
    if (cancelRequested) return;

    status.textContent = '正在读取字幕编码与字体内部名称……';
    bar.style.width = '16%';

    const [{ text: sourceAss, encoding: assEncoding }, fontFamily] = await Promise.all([
      readAssText(sub),
      readFontFamily(font),
    ]);
    const rewrittenAss = forceAssFontFamily(sourceAss, fontFamily);
    logEl.textContent += `ASS 编码：${assEncoding}\n`;
    logEl.textContent += `ASS 字体已强制改为上传字体的内部名称：${fontFamily}\n`;

    let glyphWarning = '';
    try {
      const coverage = await checkFontCoverage(font, sourceAss);
      if (coverage.missing.length) {
        const preview = coverage.missing.slice(0, 24)
          .map((char) => `${char}(U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
          .join(' ');
        glyphWarning = `；字体缺少 ${coverage.missing.length} 个字幕字符`;
        logEl.textContent += `WARNING: 字体 cmap 缺少 ${coverage.missing.length}/${coverage.checkedCount} 个唯一字幕字符：${preview}${coverage.missing.length > 24 ? ' …' : ''}\n`;
      } else {
        logEl.textContent += `字体缺字检查通过：${coverage.checkedCount} 个唯一字幕字符均可在 cmap 中找到。\n`;
      }
    } catch (coverageError) {
      logEl.textContent += `WARNING: 无法完成字体缺字检查：${coverageError?.message || coverageError}\n`;
    }

    status.textContent = '正在把文件载入浏览器内存……';
    bar.style.width = '20%';

    await ffmpeg.writeFile(videoPath, await fetchFile(video));
    await ffmpeg.writeFile(subPath, new TextEncoder().encode(rewrittenAss));
    await ffmpeg.writeFile(fontPath, await fetchFile(font));
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
      '-attach', fontPath,
      `-metadata:s:t:${originalAttachmentCount}`, `mimetype=${fontMime}`,
      `-metadata:s:t:${originalAttachmentCount}`, `filename=${font.name}`,
      outputPath,
    );

    const code = await ffmpeg.exec(args);
    if (cancelRequested) return;
    if (code !== 0) {
      throw new Error(`FFmpeg 返回错误代码 ${code}`);
    }

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
    status.textContent = `完成。ASS 已按 ${assEncoding} 正确读取并改用字体“${fontFamily}”${glyphWarning}；视频/音频未重新编码。`;

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
      await removeQuietly(fontPath);
      await removeQuietly(outputPath);
      await removeQuietly(probePath);
    }
    running = false;
    cancelRequested = false;
    updateUI();
  }
});
