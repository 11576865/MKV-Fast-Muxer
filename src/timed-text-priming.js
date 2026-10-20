/**
 * Bounded FFmpeg AAC priming correction for newly imported timed-text inputs.
 *
 * A raw ISO-BMFF AAC packet may start with a negative PTS due to encoder
 * priming (Skip Samples). On the bundled FFmpeg Matroska stream-copy path a
 * first AAC packet at -1024/48000s yields a systematic +21 ms offset for a
 * new SRT/ASS stream, even with -copyts and -avoid_negative_ts disabled.
 *
 * Correct only on independently observed *exact source bytes* and matching
 * skip-samples evidence. Never guess an offset from a codec label or use this
 * to modify original stream times or disable the output-timestamp audit.
 */
export function inspectTimedTextAacPriming(sourceProbe, packetProbe, container) {
  const unsupported = reason => Object.freeze({
    correctionSeconds: 0, applied: false, reason,
  });
  if (!['iso-bmff','mov'].includes(container)) return unsupported('NOT_ISOBMFF');
  const audios = (sourceProbe?.streams || []).filter(s=>s.codec_type==='audio');
  if (audios.length !== 1 || String(audios[0].codec_name||'').toLowerCase() !== 'aac')
    return unsupported('NOT_SINGLE_AAC');
  const packet = packetProbe?.packets?.[0];
  if (!packet || packetProbe.packets.length !== 1) return unsupported('NO_FIRST_AUDIO_PACKET');
  const pts = Number(packet.pts_time);
  if (!Number.isFinite(pts) || pts >= 0 || pts < -0.25)
    return unsupported('NO_BOUNDED_NEGATIVE_PTS');
  const skip = (packet.side_data_list || []).find(s =>
    s.side_data_type === 'Skip Samples' && Number.isSafeInteger(Number(s.skip_samples)) &&
    Number(s.skip_samples) > 0);
  // The general source probe deliberately omits sample_rate. Require an
  // independent, richer first-packet probe identifying the SAME AAC stream,
  // rather than accidentally interpreting an omitted field as no priming.
  const probedAudio = packetProbe?.streams?.[0];
  if (!probedAudio || packetProbe.streams.length !== 1 ||
      Number(probedAudio.index) !== Number(audios[0].index) ||
      String(probedAudio.codec_name || '').toLowerCase() !== 'aac') {
    return unsupported('AUDIO_STREAM_PROOF_MISMATCH');
  }
  const rate = Number(probedAudio.sample_rate);
  if (!skip || !Number.isSafeInteger(rate) || rate < 8000 || rate > 384000)
    return unsupported('NO_VALIDATED_SKIP_SAMPLES');
  const expectedSeconds = Number(skip.skip_samples)/rate;
  if (!Number.isFinite(expectedSeconds) || Math.abs(expectedSeconds + pts) > 0.002)
    return unsupported('AAC_PRIMING_PTS_MISMATCH');
  const ms = Math.round(-pts * 1000);
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 250)
    return unsupported('INVALID_MILLISECOND_SHIFT');
  return Object.freeze({correctionSeconds: -ms / 1000, applied:true,
    reason:'AAC_PRIMING_PACKET_PROVEN', observedNegativePtsSeconds:pts,
    skipSamples:Number(skip.skip_samples), sampleRate:rate});
}
