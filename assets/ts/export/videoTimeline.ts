import type { FeatureSnapshot } from '../types';
import { easeInOutCubic, lerpFeatureSnapshot } from '../geometry/paramInterpolation';
import { buildSessionComposite, stageSnapshot } from './sessionComposite';

export type VideoTimelineConfig = {
  fps: number;
  morphMs: number;
  finalHoldMs: number;
  minHoldMs: number;
  morphToFinalMs: number;
};

export const DEFAULT_VIDEO_CONFIG: VideoTimelineConfig = {
  fps: 24,
  morphMs: 3000,
  finalHoldMs: 4000,
  minHoldMs: 1200,
  morphToFinalMs: 3500,
};

export type VideoFramePlan = {
  timeMs: number;
  snapshot: FeatureSnapshot;
};

export function buildVideoFramePlans(
  snapshots: FeatureSnapshot[],
  config: VideoTimelineConfig = DEFAULT_VIDEO_CONFIG,
): VideoFramePlan[] {
  if (snapshots.length === 0) {
    return [];
  }

  const composite = buildSessionComposite(snapshots);
  const sessionStart = snapshots[0].sessionStarted ?? snapshots[0].timestamp;
  const frameStep = 1000 / config.fps;
  const keyTimes = snapshots.map((s) => Math.max(0, s.timestamp - sessionStart));
  const plans: VideoFramePlan[] = [];

  const pushHold = (fromMs: number, toMs: number, stageIndex: number): void => {
    for (let t = fromMs; t < toMs - 0.5; t += frameStep) {
      plans.push({
        timeMs: t,
        snapshot: stageSnapshot(snapshots, stageIndex),
      });
    }
  };

  const pushMorph = (
    fromMs: number,
    toMs: number,
    fromStage: number,
    toStage: number,
  ): void => {
    const span = Math.max(toMs - fromMs, frameStep);
    for (let t = fromMs; t < toMs - 0.5; t += frameStep) {
      const raw = (t - fromMs) / span;
      const eased = easeInOutCubic(raw);
      const fromSnap = stageSnapshot(snapshots, fromStage);
      const toSnap = stageSnapshot(snapshots, toStage);
      const revealNext = eased > 0.82;
      const visibleStages = revealNext
        ? snapshots.slice(0, toStage + 1)
        : snapshots.slice(0, fromStage + 1);

      plans.push({
        timeMs: t,
        snapshot: lerpFeatureSnapshot(fromSnap, toSnap, eased, {
          processSnapshots: visibleStages,
          pitchTrail: visibleStages.flatMap((s) => s.pitchTrail ?? []),
          spectrum: eased < 0.5 ? fromSnap.spectrum : toSnap.spectrum,
        }),
      });
    }
  };

  for (let i = 0; i < snapshots.length; i += 1) {
    const holdStart = keyTimes[i];
    const holdEnd = i < snapshots.length - 1
      ? Math.max(holdStart + config.minHoldMs, keyTimes[i + 1] - config.morphMs)
      : holdStart + config.minHoldMs;

    pushHold(holdStart, holdEnd, i);

    if (i < snapshots.length - 1) {
      pushMorph(holdEnd, keyTimes[i + 1], i, i + 1);
    }
  }

  const lastKeyTime = keyTimes[keyTimes.length - 1];
  const finalMorphStart = lastKeyTime + config.minHoldMs;
  const finalMorphEnd = finalMorphStart + config.morphToFinalMs;
  const fromFinal = stageSnapshot(snapshots, snapshots.length - 1);

  for (let t = finalMorphStart; t < finalMorphEnd - 0.5; t += frameStep) {
    const raw = (t - finalMorphStart) / config.morphToFinalMs;
    const eased = easeInOutCubic(raw);
    plans.push({
      timeMs: t,
      snapshot: lerpFeatureSnapshot(fromFinal, composite, eased, {
        processSnapshots: snapshots,
        pitchTrail: composite.pitchTrail,
        spectrum: composite.spectrum,
        label: eased > 0.7 ? 'Итог' : fromFinal.label,
      }),
    });
  }

  for (let t = finalMorphEnd; t <= finalMorphEnd + config.finalHoldMs; t += frameStep) {
    plans.push({
      timeMs: t,
      snapshot: composite,
    });
  }

  return plans;
}
