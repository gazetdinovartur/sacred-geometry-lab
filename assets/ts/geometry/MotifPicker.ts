import type { NormalizedFeatures } from '../audio/VoiceProfile';
import type { AudioFeatures, VoiceMotifKind } from '../types';

export const MOTIF_LABELS: Record<VoiceMotifKind, string> = {
  ring: 'кольцо · громкость',
  petal: 'лепесток · тон',
  ray: 'луч · атака',
  arc: 'дуга · уровень',
  wave: 'волна · тембр',
  dot: 'точки · гармоники',
  filigree: 'виток · тембр',
  crescent: 'полумесяц · переход тона',
  chevron: 'стрела · импульс',
  lattice: 'решётка · гармоники',
};

export function pickVoiceMotif(
  norm: NormalizedFeatures,
  prev: NormalizedFeatures | null,
  features: AudioFeatures,
  prevOnsets: number,
): VoiceMotifKind {
  if (!prev) {
    return norm.centroid > 0.55 ? 'filigree' : norm.rms > 0.15 ? 'ring' : 'petal';
  }

  const scores: Record<VoiceMotifKind, number> = {
    ring: Math.abs(norm.rms - prev.rms) * 3.2,
    petal: Math.abs(norm.pitch - prev.pitch) * 4.2,
    ray: Math.max(norm.flux - prev.flux, 0) * 5.5 + (features.recentOnsets > prevOnsets ? 0.6 : 0),
    arc: Math.max(norm.rms - prev.rms, 0) * 2.5,
    wave: Math.abs(norm.centroid - prev.centroid) * 3.5,
    dot: Math.max(norm.harmonics - prev.harmonics, 0) * 1.8
      + Math.max(features.recentOnsets - prevOnsets, 0) * 0.3,
    filigree: Math.abs(norm.centroid - prev.centroid) * 2.8 + norm.centroid * 0.35,
    crescent: Math.abs(norm.pitch - prev.pitch) * 3.2 + Math.abs(norm.rms - prev.rms) * 0.8,
    chevron: Math.max(norm.flux - prev.flux, 0) * 4.2 + (features.recentOnsets > prevOnsets ? 0.9 : 0),
    lattice: norm.harmonics * 0.6 + Math.max(norm.harmonics - prev.harmonics, 0) * 2.4,
  };

  let best: VoiceMotifKind = 'petal';
  let bestScore = -1;
  (Object.keys(scores) as VoiceMotifKind[]).forEach((kind) => {
    if (scores[kind] > bestScore) {
      bestScore = scores[kind];
      best = kind;
    }
  });

  if (bestScore < 0.05) {
    const cycle: VoiceMotifKind[] = [
      'petal', 'filigree', 'arc', 'crescent', 'wave', 'lattice', 'dot', 'chevron', 'ring', 'ray',
    ];
    const idx = Math.floor(features.recentOnsets * 1.7 + norm.pitch * 11 + norm.centroid * 7);
    return cycle[idx % cycle.length];
  }

  return best;
}

export function motifLabel(kind: VoiceMotifKind): string {
  return MOTIF_LABELS[kind];
}

export function motifVariant(norm: NormalizedFeatures, kind: VoiceMotifKind): number {
  const seed = norm.pitch * 5 + norm.centroid * 3 + norm.harmonics * 2;
  const offset: Record<VoiceMotifKind, number> = {
    ring: 0,
    petal: 1,
    ray: 2,
    arc: 0,
    wave: 1,
    dot: 2,
    filigree: 3,
    crescent: 1,
    chevron: 2,
    lattice: 0,
  };
  return Math.floor(seed + offset[kind]) % 4;
}
