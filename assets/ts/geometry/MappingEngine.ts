import type { AudioFeatures, GeometryParams } from '../types';
import type { NormalizedFeatures } from '../audio/VoiceProfile';
import { symmetryFromRhythm } from './SymmetryResolver';

/** Каждый параметр геометрии — прямая функция одной акустической величины. */
export function mapFeaturesToGeometry(
  features: AudioFeatures,
  norm: NormalizedFeatures,
): GeometryParams {
  const symmetry = symmetryFromRhythm(features.recentOnsets);
  const rmsBoost = Math.pow(norm.rms, 0.72);

  return {
    radius: 62 + rmsBoost * 168,
    rays: raysFromPitch(norm.pitch),
    rotationSpeed: 0.001 + norm.flux * 0.022,
    hue: 185 + norm.centroid * 120,
    opacity: 0.58 + rmsBoost * 0.42,
    symmetry,
    breathRing: 0,
    lineWidth: 0.42 + norm.centroid * 1.1,
    waveAmplitude: 6 + norm.flux * 28,
    spiralTurns: 0,
    dotCount: Math.max(3, Math.round(norm.harmonics * 10)),
    elementCount: 1 + Math.round(norm.harmonics * 6),
    pitchAngle: norm.pitch * Math.PI * 2,
  };
}

function raysFromPitch(pitchNorm: number): number {
  if (pitchNorm < 0.12) {
    return 3;
  }
  if (pitchNorm < 0.25) {
    return 4;
  }
  if (pitchNorm < 0.4) {
    return 5;
  }
  if (pitchNorm < 0.55) {
    return 6;
  }
  if (pitchNorm < 0.7) {
    return 8;
  }
  if (pitchNorm < 0.85) {
    return 10;
  }
  return 12;
}
