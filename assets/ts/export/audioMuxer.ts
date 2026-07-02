import type { Muxer } from 'webm-muxer';

const TARGET_SAMPLE_RATE = 48000;
const FRAME_DURATION_MS = 20;

export async function encodeAudioBlobToMuxer(muxer: Muxer, audioBlob: Blob): Promise<number> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    throw new Error('AudioEncoder is not supported');
  }

  const pcm = await decodeToMonoPcm(audioBlob, TARGET_SAMPLE_RATE);
  const durationMs = (pcm.length / TARGET_SAMPLE_RATE) * 1000;
  const codec = await pickOpusCodec();

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      if (meta) {
        muxer.addAudioChunk(chunk, meta);
      }
    },
    error: (err) => {
      throw err;
    },
  });

  encoder.configure({
    codec,
    sampleRate: TARGET_SAMPLE_RATE,
    numberOfChannels: 1,
    bitrate: 128_000,
  });

  const samplesPerFrame = Math.floor(TARGET_SAMPLE_RATE * FRAME_DURATION_MS / 1000);

  for (let offset = 0; offset < pcm.length; offset += samplesPerFrame) {
    const frameLength = Math.min(samplesPerFrame, pcm.length - offset);
    const slice = pcm.subarray(offset, offset + frameLength);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfFrames: frameLength,
      numberOfChannels: 1,
      timestamp: Math.round((offset / TARGET_SAMPLE_RATE) * 1_000_000),
      duration: Math.round((frameLength / TARGET_SAMPLE_RATE) * 1_000_000),
      data: slice,
    });

    encoder.encode(audioData);
    audioData.close();
  }

  await encoder.flush();
  encoder.close();

  return durationMs;
}

async function decodeToMonoPcm(blob: Blob, targetRate: number): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    await ctx.close();
  }
}

async function pickOpusCodec(): Promise<string> {
  const candidates = ['opus', 'mp4a.40.2'];
  for (const codec of candidates) {
    const support = await AudioEncoder.isConfigSupported({
      codec,
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: 128_000,
    });
    if (support.supported) {
      return codec;
    }
  }
  throw new Error('No supported audio codec');
}
