export interface AudioFeatures {
  rms: number;
  frequency: number;
  spectralCentroid: number;
  spectralFlux: number;
  harmonicCount: number;
  silenceRatio: number;
  pauseMs: number;
  recentOnsets: number;
  rhythmSymmetry: number;
}

export interface GeometryParams {
  radius: number;
  rays: number;
  rotationSpeed: number;
  hue: number;
  opacity: number;
  symmetry: number;
  breathRing: number;
  lineWidth: number;
  waveAmplitude: number;
  spiralTurns: number;
  dotCount: number;
  elementCount: number;
  pitchAngle: number;
}

export type VoiceMotifKind =
  | 'ring'
  | 'petal'
  | 'ray'
  | 'arc'
  | 'wave'
  | 'dot'
  | 'filigree'
  | 'crescent'
  | 'chevron'
  | 'lattice';

export type PitchPoint = {
  angle: number;
  radiusNorm: number;
  lineWidth: number;
  opacity: number;
  fold: number;
  width: number;
  kind: VoiceMotifKind;
  /** 0–3 — вариант прорисовки внутри типа */
  variant: number;
};

export interface FeatureSnapshot {
  timestamp: number;
  features: AudioFeatures;
  params: GeometryParams;
  label: string;
  pitchTrail?: PitchPoint[];
}

export type LabMode = 'live' | 'process' | 'dialog';

export type DialogFrame = {
  left: FeatureSnapshot;
  right: FeatureSnapshot;
  overlap: number;
};

export type GeometryStyle =
  | 'classic'
  | 'flower'
  | 'seed'
  | 'metatron'
  | 'merkaba'
  | 'yantra';

export type TimelineEntry = {
  index: number;
  label: string;
  isComposite: boolean;
};
