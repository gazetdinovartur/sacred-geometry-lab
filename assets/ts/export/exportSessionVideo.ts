import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import type { ExportSize } from './exportOptions';
import type { CinemaSessionBundle, FeatureSnapshot } from '../types';
import { FlightVideoRenderer } from '../three/FlightVideoRenderer';
import { triggerDownloadBlob } from './exportFiles';
import { sessionVideoFilename } from './exportNames';
import { buildFlightVideoPlan } from './flightVideoPlan';
import { encodeAudioBlobToMuxer } from './audioMuxer';
import { videoFrameTiming } from './videoFrameTiming';

export function canExportSessionVideo(): boolean {
  return typeof VideoEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof createImageBitmap !== 'undefined';
}

function canMuxAudio(): boolean {
  return typeof AudioEncoder !== 'undefined';
}

export type VideoExportProgress = {
  phase: 'plan' | 'render' | 'encode' | 'done';
  progress: number;
  frame: number;
  totalFrames: number;
};

export type FlightVideoInput = {
  cinemaBundle: CinemaSessionBundle | null;
  processSnapshots: FeatureSnapshot[];
};

/** Сессия → WebM: 3D-тunnel + голос (если записан). */
export async function exportSessionVideo(
  input: FlightVideoInput,
  size: ExportSize,
  onProgress?: (state: VideoExportProgress) => void,
): Promise<string> {
  if (!canExportSessionVideo()) {
    throw new Error('VideoEncoder is not supported in this browser');
  }

  onProgress?.({ phase: 'plan', progress: 0, frame: 0, totalFrames: 0 });
  const { plans, fps, audioBlob } = buildFlightVideoPlan(input);
  const totalFrames = plans.length;
  if (totalFrames === 0) {
    throw new Error('Video timeline is empty');
  }

  const includeAudio = Boolean(audioBlob && audioBlob.size > 0 && canMuxAudio());
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
    ...(includeAudio
      ? {
          audio: {
            codec: 'A_OPUS' as const,
            sampleRate: 48000,
            numberOfChannels: 1,
          },
        }
      : {}),
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

  const flight = new FlightVideoRenderer(size);
  let cameraZ = 920;

  onProgress?.({ phase: 'render', progress: 0, frame: 0, totalFrames });

  try {
    for (let i = 0; i < plans.length; i += 1) {
      const plan = plans[i];
      const snap = plan.snapshot;
      const energy = snap.params.opacity;
      const rms = snap.features.rms;
      const flux = snap.features.spectralFlux;
      const level = snap.levelNorm ?? snap.features.spectralLevel;
      cameraZ -= 5 + energy * 6 + rms * 30 + flux * 14 + level * 8;

      flight.renderFrame(snap, cameraZ, plan.timeMs / 1000);
      const bitmap = await flight.toImageBitmap();
      const { timestamp, duration } = videoFrameTiming(plans, i, fps);
      const frame = new VideoFrame(bitmap, { timestamp, duration });
      bitmap.close();

      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      onProgress?.({
        phase: includeAudio && i === plans.length - 1 ? 'encode' : 'render',
        progress: (i + 1) / (totalFrames + (includeAudio ? 1 : 0)),
        frame: i + 1,
        totalFrames,
      });

      if (i % 2 === 1) {
        await yieldToUi();
      }
    }

    await encoder.flush();
    encoder.close();

    if (includeAudio && audioBlob) {
      onProgress?.({ phase: 'encode', progress: 0.92, frame: totalFrames, totalFrames });
      await encodeAudioBlobToMuxer(muxer, audioBlob);
    }

    muxer.finalize();
  } finally {
    flight.dispose();
  }

  const blob = new Blob([target.buffer], { type: 'video/webm' });
  const filename = sessionVideoFilename();
  triggerDownloadBlob(blob, filename);

  onProgress?.({ phase: 'done', progress: 1, frame: totalFrames, totalFrames });
  return filename;
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
