import test from 'node:test';
import assert from 'node:assert/strict';
import { describeOperationError, formatOperationError } from '../src/error-feedback.js';

test('keeps specific external-audio validation readable', () => {
  const feedback = describeOperationError(
    new Error('外部音频“voice.txt”没有可用音频轨。'),
    { phase: 'mux' }
  );
  assert.equal(feedback.category, 'external-audio-no-stream');
  assert.match(feedback.cause, /外部音频/);
  assert.match(feedback.action, /移除|换用/);
});

test('classifies browser or wasm memory exhaustion', () => {
  const text = formatOperationError(
    new Error('RuntimeError: memory access out of bounds'),
    { phase: 'mux' }
  );
  assert.match(text, /内存不足/);
  assert.match(text, /更小的输入文件/);
});

test('classifies temporary storage exhaustion', () => {
  const feedback = describeOperationError(
    new Error('FS error: ENOSPC: no space left on device'),
    { phase: 'mux' }
  );
  assert.equal(feedback.category, 'storage');
  assert.match(feedback.action, /释放设备存储空间/);
});

test('uses recent ffmpeg log evidence to identify damaged input', () => {
  const feedback = describeOperationError(
    new Error('FFmpeg 返回错误代码 1'),
    {
      phase: 'mux',
      logText: '[mov,mp4,m4a,3gp,3g2,mj2] moov atom not found\nInvalid data found when processing input',
    }
  );
  assert.equal(feedback.category, 'invalid-media');
  assert.match(feedback.cause, /无法被 FFmpeg 正常解析/);
});

test('explains stream-copy container incompatibility without promising transcoding', () => {
  const feedback = describeOperationError(
    new Error('FFmpeg 返回错误代码 1'),
    {
      phase: 'mux',
      logText: 'Could not write header for output file #0: Invalid argument\ncodec not currently supported in container',
    }
  );
  assert.equal(feedback.category, 'container-incompatible');
  assert.match(feedback.action, /不会自动转码/);
});

test('scan probe failures point to media structure and logs', () => {
  const text = formatOperationError(
    new Error('ffprobe 未生成结果（返回 1，结构探测）'),
    { phase: 'scan' }
  );
  assert.match(text, /轨道扫描失败/);
  assert.match(text, /运行日志/);
});

test('unknown mux errors still state whether an output exists', () => {
  const text = formatOperationError(new Error('unexpected failure'), { phase: 'mux' });
  assert.match(text, /没有生成可保存的成品/);
  assert.match(text, /unexpected failure/);
});
