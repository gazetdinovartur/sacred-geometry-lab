import type { FeatureSnapshot, GeometryParams, PitchPoint } from '../types';
import { blendGeometryParams } from '../geometry/SymmetryResolver';
import { easeInOutSine, lerpGeometryParams } from '../geometry/paramInterpolation';

/** Каркас мандалы фиксирован на всё видео — без вращения и скачков симметрии. */
export function resolveVideoAnchorParams(snapshots: FeatureSnapshot[]): GeometryParams {
  const blended = blendGeometryParams(snapshots);
  return {
    ...blended,
    pitchAngle: 0,
    rotationSpeed: 0,
    spiralTurns: 0,
    symmetry: Math.max(4, blended.symmetry),
    rays: Math.max(4, blended.rays),
  };
}

/** Только «дыхание»: размер, цвет, прозрачность — каркас из anchor. */
export function applyBreathingToAnchor(anchor: GeometryParams, source: GeometryParams): GeometryParams {
  return {
    ...anchor,
    radius: source.radius,
    opacity: source.opacity,
    hue: source.hue,
    breathRing: source.breathRing,
    lineWidth: source.lineWidth,
    waveAmplitude: source.waveAmplitude,
    dotCount: source.dotCount,
    elementCount: source.elementCount,
  };
}

export function lerpBreathingParams(
  a: GeometryParams,
  b: GeometryParams,
  t: number,
  anchor: GeometryParams,
): GeometryParams {
  const from = applyBreathingToAnchor(anchor, a);
  const to = applyBreathingToAnchor(anchor, b);
  const mixed = lerpGeometryParams(from, to, t);
  return {
    ...mixed,
    pitchAngle: anchor.pitchAngle,
    symmetry: anchor.symmetry,
    rays: anchor.rays,
    rotationSpeed: 0,
    spiralTurns: 0,
  };
}

export function lerpSpectrumArrays(
  a?: number[],
  b?: number[],
  t: number,
): number[] | undefined {
  if (!a?.length && !b?.length) {
    return undefined;
  }
  if (!a?.length) {
    return b;
  }
  if (!b?.length) {
    return a;
  }
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => {
    const av = a[i] ?? a[a.length - 1] ?? 0;
    const bv = b[i] ?? b[b.length - 1] ?? 0;
    return av + (bv - av) * t;
  });
}

/** Плавное наращивание следа голоса без скачка. */
export function growPitchTrail(
  from: PitchPoint[] | undefined,
  to: PitchPoint[] | undefined,
  t: number,
): PitchPoint[] | undefined {
  const target = to?.length ? to : from;
  if (!target?.length) {
    return undefined;
  }
  const count = Math.max(1, Math.round(target.length * easeInOutSine(t)));
  return target.slice(0, count);
}

export function buildVideoMorphSnapshot(
  from: FeatureSnapshot,
  to: FeatureSnapshot,
  t: number,
  anchor: GeometryParams,
  overrides: Partial<FeatureSnapshot> = {},
): FeatureSnapshot {
  const eased = easeInOutSine(t);
  return {
    ...from,
    timestamp: from.timestamp + (to.timestamp - from.timestamp) * eased,
    features: {
      ...from.features,
      rms: from.features.rms + (to.features.rms - from.features.rms) * eased,
      frequency: from.features.frequency + (to.features.frequency - from.features.frequency) * eased,
      pitchConfidence: from.features.pitchConfidence
        + (to.features.pitchConfidence - from.features.pitchConfidence) * eased,
      spectralLevel: from.features.spectralLevel
        + (to.features.spectralLevel - from.features.spectralLevel) * eased,
      spectralCentroid: from.features.spectralCentroid
        + (to.features.spectralCentroid - from.features.spectralCentroid) * eased,
      spectralFlux: from.features.spectralFlux
        + (to.features.spectralFlux - from.features.spectralFlux) * eased,
      harmonicCount: Math.round(from.features.harmonicCount
        + (to.features.harmonicCount - from.features.harmonicCount) * eased),
      silenceRatio: from.features.silenceRatio
        + (to.features.silenceRatio - from.features.silenceRatio) * eased,
      pauseMs: from.features.pauseMs + (to.features.pauseMs - from.features.pauseMs) * eased,
      isActive: eased < 0.5 ? from.features.isActive : to.features.isActive,
      recentOnsets: from.features.recentOnsets,
      rhythmSymmetry: anchor.symmetry,
    },
    params: lerpBreathingParams(from.params, to.params, eased, anchor),
    label: eased < 0.5 ? from.label : to.label,
    pitchTrail: growPitchTrail(from.pitchTrail, to.pitchTrail, eased),
    spectrum: lerpSpectrumArrays(from.spectrum, to.spectrum, eased),
    levelNorm: from.levelNorm !== undefined && to.levelNorm !== undefined
      ? from.levelNorm + (to.levelNorm - from.levelNorm) * eased
      : from.levelNorm ?? to.levelNorm,
    sessionStarted: from.sessionStarted ?? to.sessionStarted,
    profileHash: from.profileHash ?? to.profileHash,
    voiceMs: from.voiceMs ?? to.voiceMs,
    ...overrides,
  };
}

export function stabilizeHoldSnapshot(
  snapshot: FeatureSnapshot,
  anchor: GeometryParams,
): FeatureSnapshot {
  return {
    ...snapshot,
    params: applyBreathingToAnchor(anchor, snapshot.params),
    features: {
      ...snapshot.features,
      rhythmSymmetry: anchor.symmetry,
    },
  };
}
