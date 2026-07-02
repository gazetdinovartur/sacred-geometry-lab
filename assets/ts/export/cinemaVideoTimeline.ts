import type { AudioFeatures, CinemaSessionBundle, FeatureSnapshot, GeometryParams, SessionTimelineSample } from '../types';
import { easeInOutSine } from '../geometry/paramInterpolation';
import { buildSessionComposite } from './sessionComposite';
import type { VideoFramePlan } from './videoTimeline';
import {
  buildVideoMorphSnapshot,
  resolveVideoAnchorParams,
  stabilizeHoldSnapshot,
} from './videoFrameBuilder';

export type CinemaTimelineConfig = {
  fps: number;
  finalHoldMs: number;
  morphToFinalMs: number;
  /** Видео = длина аудио, без хвоста и двойного сглаживания. */
  syncToAudio?: boolean;
};

export const CINEMA_VIDEO_CONFIG: CinemaTimelineConfig = {
  fps: 30,
  finalHoldMs: 4000,
  morphToFinalMs: 4500,
};

/** 3D и «видео мандала» — строго по длине записи. */
export const SYNCED_CINEMA_VIDEO_CONFIG: CinemaTimelineConfig = {
  fps: 30,
  finalHoldMs: 0,
  morphToFinalMs: 0,
  syncToAudio: true,
};

const SILENT_SPECTRUM = [0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];

/** Тихий кадр t=0 — совпадает с началом аудиодорожки. */
export function createSilentTimelineSample(timeMs = 0, hue = 220): SessionTimelineSample {
  const params: GeometryParams = {
    radius: 100,
    rays: 6,
    rotationSpeed: 0,
    hue,
    opacity: 0.28,
    symmetry: 6,
    breathRing: 0,
    lineWidth: 1,
    waveAmplitude: 0,
    spiralTurns: 0,
    dotCount: 4,
    elementCount: 4,
    pitchAngle: 0,
  };
  const features: AudioFeatures = {
    rms: 0,
    frequency: 0,
    pitchConfidence: 0,
    spectralLevel: 0,
    isActive: false,
    spectralCentroid: 0,
    spectralFlux: 0,
    harmonicCount: 0,
    silenceRatio: 1,
    pauseMs: 0,
    recentOnsets: 0,
    rhythmSymmetry: 6,
  };
  return {
    timeMs,
    features,
    params,
    spectrum: [...SILENT_SPECTRUM],
    levelNorm: 0,
  };
}

export function buildFrameTimes(totalMs: number, fps: number): number[] {
  if (totalMs <= 0) {
    return [0];
  }
  const step = 1000 / fps;
  const times: number[] = [];
  for (let t = 0; t < totalMs - 0.001; t += step) {
    times.push(t);
  }
  times.push(totalMs);
  return times;
}

export function buildCinemaFramePlans(
  bundle: CinemaSessionBundle,
  config: CinemaTimelineConfig = CINEMA_VIDEO_CONFIG,
): VideoFramePlan[] {
  const { samples, processSnapshots, audioDurationMs } = bundle;
  if (samples.length === 0) {
    return [];
  }

  const anchorSource = processSnapshots.length > 0
    ? processSnapshots
    : samples.map((sample) => sampleToSnapshot(sample, bundle, []));
  const anchor = resolveVideoAnchorParams(anchorSource);

  const composite = processSnapshots.length > 0
    ? buildSessionComposite(processSnapshots)
    : sampleToSnapshot(samples[samples.length - 1], bundle, []);
  const stabilizedComposite = stabilizeHoldSnapshot(composite, anchor);

  const syncToAudio = Boolean(config.syncToAudio && audioDurationMs > 0);
  const contentEndMs = syncToAudio
    ? audioDurationMs
    : Math.max(audioDurationMs, samples[samples.length - 1].timeMs);
  const totalEndMs = syncToAudio
    ? audioDurationMs
    : contentEndMs + config.morphToFinalMs + config.finalHoldMs;

  const frameTimes = buildFrameTimes(totalEndMs, config.fps);
  const plans: VideoFramePlan[] = [];
  let prevSnapshot: FeatureSnapshot | null = null;

  for (const t of frameTimes) {
    if (t <= contentEndMs) {
      const sample = interpolateSample(samples, t, anchor);
      const visibleStages = stagesVisibleAt(processSnapshots, bundle.captureStartedAt, t);
      const snapshot = stabilizeHoldSnapshot(
        sampleToSnapshot(sample, bundle, visibleStages),
        anchor,
      );
      const frameSnapshot = syncToAudio
        ? snapshot
        : smoothFromPrevious(prevSnapshot, snapshot, anchor);
      plans.push({ timeMs: t, snapshot: frameSnapshot });
      prevSnapshot = snapshot;
      continue;
    }

    const afterContent = t - contentEndMs;
    if (afterContent <= config.morphToFinalMs && processSnapshots.length > 0) {
      const from = prevSnapshot ?? stabilizeHoldSnapshot(
        sampleToSnapshot(interpolateSample(samples, contentEndMs, anchor), bundle, processSnapshots),
        anchor,
      );
      const raw = afterContent / config.morphToFinalMs;
      const snapshot = buildVideoMorphSnapshot(from, stabilizedComposite, raw, anchor, {
        processSnapshots: processSnapshots,
        pitchTrail: stabilizedComposite.pitchTrail,
        label: raw > 0.82 ? 'Итог' : from.label,
      });
      plans.push({ timeMs: t, snapshot });
      prevSnapshot = snapshot;
    } else {
      plans.push({ timeMs: t, snapshot: stabilizedComposite });
      prevSnapshot = stabilizedComposite;
    }
  }

  return plans;
}

function smoothFromPrevious(
  prev: FeatureSnapshot | null,
  next: FeatureSnapshot,
  anchor: ReturnType<typeof resolveVideoAnchorParams>,
): FeatureSnapshot {
  if (!prev) {
    return next;
  }
  return buildVideoMorphSnapshot(prev, next, 0.35, anchor, {
    processSnapshots: next.processSnapshots,
    pitchTrail: next.pitchTrail,
    spectrum: next.spectrum,
    label: next.label,
  });
}

function stagesVisibleAt(
  stages: FeatureSnapshot[],
  captureStartedAt: number,
  timeMs: number,
): FeatureSnapshot[] {
  const absTime = captureStartedAt + timeMs;
  return stages.filter((s) => s.timestamp <= absTime);
}

function interpolateSample(
  samples: SessionTimelineSample[],
  timeMs: number,
  anchor: ReturnType<typeof resolveVideoAnchorParams>,
): SessionTimelineSample {
  const first = samples[0];
  if (timeMs <= first.timeMs) {
    return first;
  }

  const last = samples[samples.length - 1];
  if (timeMs >= last.timeMs) {
    return last;
  }

  let hi = 1;
  while (hi < samples.length && samples[hi].timeMs < timeMs) {
    hi += 1;
  }

  const lo = samples[hi - 1];
  const hiSample = samples[hi];
  return morphTimelineSamples(lo, hiSample, timeMs, anchor);
}

function morphTimelineSamples(
  lo: SessionTimelineSample,
  hiSample: SessionTimelineSample,
  timeMs: number,
  anchor: ReturnType<typeof resolveVideoAnchorParams>,
): SessionTimelineSample {
  const span = Math.max(hiSample.timeMs - lo.timeMs, 1);
  const raw = (timeMs - lo.timeMs) / span;
  const t = easeInOutSine(raw);

  const fromSnap: FeatureSnapshot = {
    timestamp: 0,
    features: lo.features,
    params: lo.params,
    label: 'Live',
    pitchTrail: lo.pitchTrail,
    spectrum: lo.spectrum,
    levelNorm: lo.levelNorm,
  };
  const toSnap: FeatureSnapshot = {
    timestamp: 1,
    features: hiSample.features,
    params: hiSample.params,
    label: 'Live',
    pitchTrail: hiSample.pitchTrail,
    spectrum: hiSample.spectrum,
    levelNorm: hiSample.levelNorm,
  };

  const morphed = buildVideoMorphSnapshot(fromSnap, toSnap, t, anchor);

  return {
    timeMs,
    features: morphed.features,
    params: morphed.params,
    spectrum: morphed.spectrum,
    pitchTrail: morphed.pitchTrail,
    levelNorm: morphed.levelNorm,
  };
}

function sampleToSnapshot(
  sample: SessionTimelineSample,
  bundle: CinemaSessionBundle,
  processSnapshots: FeatureSnapshot[],
): FeatureSnapshot {
  return {
    timestamp: bundle.captureStartedAt + sample.timeMs,
    features: sample.features,
    params: sample.params,
    label: 'Live',
    pitchTrail: sample.pitchTrail,
    spectrum: sample.spectrum,
    processSnapshots: processSnapshots.length > 0 ? processSnapshots : undefined,
    sessionStarted: bundle.captureStartedAt,
    profileHash: bundle.profileHash,
    levelNorm: sample.levelNorm,
  };
}
