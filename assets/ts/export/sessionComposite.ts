import type { FeatureSnapshot } from '../types';
import { downsampleTrail } from '../geometry/voiceMandalaLayers';

/** Итоговый слепок Process-сессии. */
export function buildSessionComposite(snapshots: FeatureSnapshot[]): FeatureSnapshot {
  const last = snapshots[snapshots.length - 1];
  return {
    ...last,
    label: 'Итог',
    pitchTrail: downsampleTrail(
      snapshots.flatMap((s) => s.pitchTrail ?? []),
      120,
    ),
    spectrum: averageSnapshotSpectrum(snapshots),
    processSnapshots: [...snapshots],
    sessionStarted: snapshots[0]?.sessionStarted,
    profileHash: snapshots[0]?.profileHash,
    voiceMs: snapshots.reduce((sum, s) => sum + (s.voiceMs ?? 0), 0),
  };
}

export function averageSnapshotSpectrum(snapshots: FeatureSnapshot[]): number[] | undefined {
  const withSpectrum = snapshots.filter((s) => s.spectrum?.length);
  if (withSpectrum.length === 0) {
    return undefined;
  }

  const len = withSpectrum[0].spectrum!.length;
  const avg = new Array(len).fill(0);
  withSpectrum.forEach((snap) => {
    snap.spectrum!.forEach((v, i) => {
      avg[i] += v;
    });
  });
  return avg.map((v) => v / withSpectrum.length);
}

/** Слепок этапа N с накопленными кольцами и контуром. */
export function stageSnapshot(
  snapshots: FeatureSnapshot[],
  stageIndex: number,
): FeatureSnapshot {
  const clamped = Math.min(Math.max(stageIndex, 0), snapshots.length - 1);
  const partial = snapshots.slice(0, clamped + 1);
  const snap = snapshots[clamped];
  return {
    ...snap,
    pitchTrail: downsampleTrail(
      partial.flatMap((s) => s.pitchTrail ?? []),
      120,
    ),
    processSnapshots: partial,
  };
}
