import type { FeatureSnapshot } from '../types';
import { buildSessionComposite, stageSnapshot } from './sessionComposite';
import {
  buildVideoMorphSnapshot,
  resolveVideoAnchorParams,
  stabilizeHoldSnapshot,
} from './videoFrameBuilder';

export type VideoTimelineConfig = {
  fps: number;
  morphMs: number;
  finalHoldMs: number;
  minHoldMs: number;
  morphToFinalMs: number;
};

export const DEFAULT_VIDEO_CONFIG: VideoTimelineConfig = {
  fps: 24,
  morphMs: 5000,
  finalHoldMs: 4000,
  minHoldMs: 2000,
  morphToFinalMs: 5500,
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

  const anchor = resolveVideoAnchorParams(snapshots);
  const composite = buildSessionComposite(snapshots);
  const stabilizedComposite = stabilizeHoldSnapshot(composite, anchor);
  const sessionStart = snapshots[0].sessionStarted ?? snapshots[0].timestamp;
  const frameStep = 1000 / config.fps;
  const keyTimes = snapshots.map((s) => Math.max(0, s.timestamp - sessionStart));
  const plans: VideoFramePlan[] = [];

  const pushHold = (fromMs: number, toMs: number, stageIndex: number): void => {
    const snap = stabilizeHoldSnapshot(stageSnapshot(snapshots, stageIndex), anchor);
    for (let t = fromMs; t < toMs - 0.5; t += frameStep) {
      plans.push({ timeMs: t, snapshot: snap });
    }
  };

  const pushMorph = (
    fromMs: number,
    toMs: number,
    fromStage: number,
    toStage: number,
  ): void => {
    const span = Math.max(toMs - fromMs, frameStep);
    const fromSnap = stabilizeHoldSnapshot(stageSnapshot(snapshots, fromStage), anchor);
    const toSnap = stabilizeHoldSnapshot(stageSnapshot(snapshots, toStage), anchor);

    for (let t = fromMs; t < toMs - 0.5; t += frameStep) {
      const raw = (t - fromMs) / span;
      const ringBlend = Math.min(Math.max((raw - 0.88) / 0.12, 0), 1);
      const visibleStages = ringBlend > 0
        ? snapshots.slice(0, toStage + 1)
        : snapshots.slice(0, fromStage + 1);

      plans.push({
        timeMs: t,
        snapshot: buildVideoMorphSnapshot(fromSnap, toSnap, raw, anchor, {
          processSnapshots: visibleStages,
          pitchTrail: visibleStages.flatMap((s) => s.pitchTrail ?? []),
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
  const fromFinal = stabilizeHoldSnapshot(stageSnapshot(snapshots, snapshots.length - 1), anchor);

  for (let t = finalMorphStart; t < finalMorphEnd - 0.5; t += frameStep) {
    const raw = (t - finalMorphStart) / config.morphToFinalMs;
    plans.push({
      timeMs: t,
      snapshot: buildVideoMorphSnapshot(fromFinal, stabilizedComposite, raw, anchor, {
        processSnapshots: snapshots,
        pitchTrail: stabilizedComposite.pitchTrail,
        label: raw > 0.82 ? 'Итог' : fromFinal.label,
      }),
    });
  }

  for (let t = finalMorphEnd; t <= finalMorphEnd + config.finalHoldMs; t += frameStep) {
    plans.push({
      timeMs: t,
      snapshot: stabilizedComposite,
    });
  }

  return plans;
}
