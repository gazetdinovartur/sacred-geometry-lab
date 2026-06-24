import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import type { ExportSize, ExportStyle } from './exportOptions';
import type { FeatureSnapshot } from '../types';
import { renderMandalaSnapshot } from './mandalaExport';
import { triggerDownloadBlob } from './exportFiles';
import { sessionVideoFilename } from './exportNames';
import { buildVideoFramePlans, DEFAULT_VIDEO_CONFIG } from './videoTimeline';

export function canExportSessionVideo(): boolean {
  return typeof VideoEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof createImageBitmap !== 'undefined';
}

export type VideoExportProgress = {
  phase: 'plan' | 'render' | 'encode' | 'done';
  progress: number;
  frame: number;
  totalFrames: number;
};

/** Process-сессия → WebM (VP9), offscreen vector render без мыла. */
export async function exportSessionVideo(
  snapshots: FeatureSnapshot[],
  style: ExportStyle,
  size: ExportSize,
  onProgress?: (state: VideoExportProgress) => void,
): Promise<string> {
  if (snapshots.length < 2) {
    throw new Error('Video export needs at least 2 process stages');
  }
  if (!canExportSessionVideo()) {
    throw new Error('VideoEncoder is not supported in this browser');
  }

  onProgress?.({ phase: 'plan', progress: 0, frame: 0, totalFrames: 0 });
  const plans = buildVideoFramePlans(snapshots, DEFAULT_VIDEO_CONFIG);
  const totalFrames = plans.length;
  if (totalFrames === 0) {
    throw new Error('Video timeline is empty');
  }

  const codec = await pickVp9Codec(size);
  const fps = DEFAULT_VIDEO_CONFIG.fps;
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
      phase: i === plans.length - 1 ? 'encode' : 'render',
      progress: (i + 1) / totalFrames,
      frame: i + 1,
      totalFrames,
    });

    // Yield to UI thread between heavy renders.
    if (i % 3 === 2) {
      await yieldToUi();
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: 'video/webm' });
  const filename = sessionVideoFilename();
  triggerDownloadBlob(blob, filename);

  onProgress?.({ phase: 'done', progress: 1, frame: totalFrames, totalFrames });
  return filename;
}

async function snapshotToBitmap(
  snapshot: FeatureSnapshot,
  style: ExportStyle,
  size: ExportSize,
): Promise<ImageBitmap> {
  const renderer = renderMandalaSnapshot(snapshot, style, size);
  renderer.flushToCanvas();
  const canvas = renderer.getCanvas();
  return createImageBitmap(canvas);
}

async function pickVp9Codec(size: ExportSize): Promise<string> {
  const candidates = [
    'vp09.00.10.08',
    'vp9',
    'vp8',
  ];

  for (const codec of candidates) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: size,
      height: size,
      bitrate: size >= 3200 ? 22_000_000 : 12_000_000,
      framerate: DEFAULT_VIDEO_CONFIG.fps,
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
