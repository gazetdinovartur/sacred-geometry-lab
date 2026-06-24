import type { CinemaSessionBundle, FeatureSnapshot, SessionTimelineSample } from '../types';
import { lerpAudioFeatures, lerpGeometryParams, easeInOutCubic } from '../geometry/paramInterpolation';
import { buildSessionComposite } from './sessionComposite';
import type { VideoFramePlan } from './videoTimeline';

export const CINEMA_VIDEO_CONFIG = {
  fps: 30,
  finalHoldMs: 4000,
  morphToFinalMs: 2500,
};

export function buildCinemaFramePlans(bundle: CinemaSessionBundle): VideoFramePlan[] {
  const { samples, processSnapshots, audioDurationMs } = bundle;
  if (samples.length === 0) {
    return [];
  }

  const composite = processSnapshots.length > 0
    ? buildSessionComposite(processSnapshots)
    : sampleToSnapshot(samples[samples.length - 1], bundle, []);

  const contentEndMs = Math.max(audioDurationMs, samples[samples.length - 1].timeMs);
  const totalEndMs = contentEndMs + CINEMA_VIDEO_CONFIG.morphToFinalMs + CINEMA_VIDEO_CONFIG.finalHoldMs;
  const frameStep = 1000 / CINEMA_VIDEO_CONFIG.fps;
  const plans: VideoFramePlan[] = [];

  for (let t = 0; t <= totalEndMs; t += frameStep) {
    if (t <= contentEndMs) {
      const sample = interpolateSample(samples, t);
      const visibleStages = stagesVisibleAt(processSnapshots, bundle.captureStartedAt, t);
      plans.push({
        timeMs: t,
        snapshot: sampleToSnapshot(sample, bundle, visibleStages),
      });
      continue;
    }

    const afterContent = t - contentEndMs;
    if (afterContent <= CINEMA_VIDEO_CONFIG.morphToFinalMs && processSnapshots.length > 0) {
      const from = sampleToSnapshot(
        interpolateSample(samples, contentEndMs),
        bundle,
        processSnapshots,
      );
      const eased = easeInOutCubic(afterContent / CINEMA_VIDEO_CONFIG.morphToFinalMs);
      plans.push({
        timeMs: t,
        snapshot: blendToComposite(from, composite, eased),
      });
    } else {
      plans.push({ timeMs: t, snapshot: composite });
    }
  }

  return plans;
}

function stagesVisibleAt(
  stages: FeatureSnapshot[],
  captureStartedAt: number,
  timeMs: number,
): FeatureSnapshot[] {
  const absTime = captureStartedAt + timeMs;
  return stages.filter((s) => s.timestamp <= absTime);
}

function interpolateSample(samples: SessionTimelineSample[], timeMs: number): SessionTimelineSample {
  if (timeMs <= samples[0].timeMs) {
    return samples[0];
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
  const span = Math.max(hiSample.timeMs - lo.timeMs, 1);
  const t = (timeMs - lo.timeMs) / span;

  return {
    timeMs,
    features: lerpAudioFeatures(lo.features, hiSample.features, t),
    params: lerpGeometryParams(lo.params, hiSample.params, t),
    spectrum: t < 0.5 ? lo.spectrum : hiSample.spectrum,
    pitchTrail: t < 0.5 ? lo.pitchTrail : hiSample.pitchTrail,
    levelNorm: lo.levelNorm !== undefined && hiSample.levelNorm !== undefined
      ? lo.levelNorm + (hiSample.levelNorm - lo.levelNorm) * t
      : lo.levelNorm ?? hiSample.levelNorm,
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

function blendToComposite(
  from: FeatureSnapshot,
  composite: FeatureSnapshot,
  t: number,
): FeatureSnapshot {
  return {
    ...from,
    features: lerpAudioFeatures(from.features, composite.features, t),
    params: lerpGeometryParams(from.params, composite.params, t),
    pitchTrail: t > 0.5 ? composite.pitchTrail : from.pitchTrail,
    spectrum: t > 0.5 ? composite.spectrum : from.spectrum,
    processSnapshots: composite.processSnapshots,
    label: t > 0.65 ? 'Итог' : from.label,
  };
}
