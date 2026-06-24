import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import type { ExportSize, ExportStyle } from './exportOptions';
import type { CinemaSessionBundle } from '../types';
import { renderMandalaSnapshot } from './mandalaExport';
import { triggerDownloadBlob } from './exportFiles';
import { sessionCinemaVideoFilename } from './exportNames';
import { buildCinemaFramePlans, CINEMA_VIDEO_CONFIG } from './cinemaVideoTimeline';
import { encodeAudioBlobToMuxer } from './audioMuxer';
import type { VideoExportProgress } from './exportSessionVideo';

export function canExportSessionCinemaVideo(): boolean {
  return typeof VideoEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof AudioEncoder !== 'undefined'
    && typeof createImageBitmap !== 'undefined';
}

/** Кино: 30 fps, живой таймлайн + голос в одном WebM. */
export async function exportSessionCinemaVideo(
  bundle: CinemaSessionBundle,
  style: ExportStyle,
  size: ExportSize,
  onProgress?: (state: VideoExportProgress) => void,
): Promise<string> {
  if (bundle.samples.length < 12) {
    throw new Error('Cinema export needs more session frames');
  }
  if (!canExportSessionCinemaVideo()) {
    throw new Error('Cinema export is not supported in this browser');
  }

  onProgress?.({ phase: 'plan', progress: 0, frame: 0, totalFrames: 0 });
  const plans = buildCinemaFramePlans(bundle);
  const totalFrames = plans.length;
  if (totalFrames === 0) {
    throw new Error('Cinema timeline is empty');
  }

  const fps = CINEMA_VIDEO_CONFIG.fps;
  const codec = await pickVp9Codec(size, fps);
  const bitrate = size >= 3200 ? 22_000_000 : 12_000_000;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'V_VP9',
      width: size,
      height: size,
      frameRate: fps,
    },
    audio: {
      codec: 'A_OPUS',
      sampleRate: 48000,
      numberOfChannels: 1,
    },
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      throw err;
    },
  });

  encoder.configure({
    codec,
    width: size,
    height: size,
    bitrate,
    framerate: fps,
  });

  onProgress?.({ phase: 'render', progress: 0, frame: 0, totalFrames });

  for (let i = 0; i < plans.length; i += 1) {
    const bitmap = await snapshotToBitmap(plans[i].snapshot, style, size);
    const frame = new VideoFrame(bitmap, {
      timestamp: Math.round(i * 1_000_000 / fps),
      duration: Math.round(1_000_000 / fps),
    });
    bitmap.close();
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    onProgress?.({
      phase: 'render',
      progress: (i + 1) / (totalFrames + 1),
      frame: i + 1,
      totalFrames,
    });

    if (i % 2 === 1) {
      await yieldToUi();
    }
  }

  await encoder.flush();
  encoder.close();

  onProgress?.({ phase: 'encode', progress: 0.92, frame: totalFrames, totalFrames });
  await encodeAudioBlobToMuxer(muxer, bundle.audioBlob);

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/webm' });
  const filename = sessionCinemaVideoFilename();
  triggerDownloadBlob(blob, filename);

  onProgress?.({ phase: 'done', progress: 1, frame: totalFrames, totalFrames });
  return filename;
}

async function snapshotToBitmap(
  snapshot: import('../types').FeatureSnapshot,
  style: ExportStyle,
  size: ExportSize,
): Promise<ImageBitmap> {
  const renderer = renderMandalaSnapshot(snapshot, style, size);
  renderer.flushToCanvas();
  return createImageBitmap(renderer.getCanvas());
}

async function pickVp9Codec(size: ExportSize, fps: number): Promise<string> {
  const candidates = ['vp09.00.10.08', 'vp9', 'vp8'];
  for (const codec of candidates) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: size,
      height: size,
      bitrate: size >= 3200 ? 22_000_000 : 12_000_000,
      framerate: fps,
    });
    if (support.supported) {
      return codec;
    }
  }
  throw new Error('VP9/VP8 encoder is not supported');
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
