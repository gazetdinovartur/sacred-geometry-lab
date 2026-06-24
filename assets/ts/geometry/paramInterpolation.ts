import type { AudioFeatures, FeatureSnapshot, GeometryParams } from '../types';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return a + delta * t;
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerpGeometryParams(a: GeometryParams, b: GeometryParams, t: number): GeometryParams {
  return {
    radius: lerp(a.radius, b.radius, t),
    rays: Math.round(lerp(a.rays, b.rays, t)),
    rotationSpeed: lerp(a.rotationSpeed, b.rotationSpeed, t),
    hue: lerp(a.hue, b.hue, t),
    opacity: lerp(a.opacity, b.opacity, t),
    symmetry: Math.round(lerp(a.symmetry, b.symmetry, t)),
    breathRing: lerp(a.breathRing, b.breathRing, t),
    lineWidth: lerp(a.lineWidth, b.lineWidth, t),
    waveAmplitude: lerp(a.waveAmplitude, b.waveAmplitude, t),
    spiralTurns: lerp(a.spiralTurns, b.spiralTurns, t),
    dotCount: Math.round(lerp(a.dotCount, b.dotCount, t)),
    elementCount: Math.round(lerp(a.elementCount, b.elementCount, t)),
    pitchAngle: lerpAngle(a.pitchAngle, b.pitchAngle, t),
  };
}

export function lerpAudioFeatures(a: AudioFeatures, b: AudioFeatures, t: number): AudioFeatures {
  return {
    rms: lerp(a.rms, b.rms, t),
    frequency: lerp(a.frequency, b.frequency, t),
    pitchConfidence: lerp(a.pitchConfidence, b.pitchConfidence, t),
    spectralLevel: lerp(a.spectralLevel, b.spectralLevel, t),
    isActive: t < 0.5 ? a.isActive : b.isActive,
    spectralCentroid: lerp(a.spectralCentroid, b.spectralCentroid, t),
    spectralFlux: lerp(a.spectralFlux, b.spectralFlux, t),
    harmonicCount: Math.round(lerp(a.harmonicCount, b.harmonicCount, t)),
    silenceRatio: lerp(a.silenceRatio, b.silenceRatio, t),
    pauseMs: lerp(a.pauseMs, b.pauseMs, t),
    recentOnsets: Math.round(lerp(a.recentOnsets, b.recentOnsets, t)),
    rhythmSymmetry: Math.round(lerp(a.rhythmSymmetry, b.rhythmSymmetry, t)),
  };
}

export function lerpFeatureSnapshot(
  a: FeatureSnapshot,
  b: FeatureSnapshot,
  t: number,
  overrides: Partial<FeatureSnapshot> = {},
): FeatureSnapshot {
  return {
    ...a,
    timestamp: lerp(a.timestamp, b.timestamp, t),
    features: lerpAudioFeatures(a.features, b.features, t),
    params: lerpGeometryParams(a.params, b.params, t),
    label: t < 0.5 ? a.label : b.label,
    pitchTrail: t < 0.5 ? a.pitchTrail : b.pitchTrail,
    spectrum: t < 0.5 ? a.spectrum : b.spectrum,
    processSnapshots: overrides.processSnapshots ?? (t < 0.5 ? a.processSnapshots : b.processSnapshots),
    sessionStarted: a.sessionStarted ?? b.sessionStarted,
    profileHash: a.profileHash ?? b.profileHash,
    levelNorm: a.levelNorm !== undefined && b.levelNorm !== undefined
      ? lerp(a.levelNorm, b.levelNorm, t)
      : a.levelNorm ?? b.levelNorm,
    voiceMs: a.voiceMs ?? b.voiceMs,
    ...overrides,
  };
}
