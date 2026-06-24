import type { AudioFeatures, FeatureSnapshot, PitchPoint } from '../types';

/** Золотой угол ≈ 137,508° — филлотаксис природы. */
export const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
export const PITCH_ANGLE_MOD = 0.18;

export type RingSpacing = 'linear' | 'golden';
export type DotMandalaMode = 'breath' | 'process';

export type DotMandalaScaffold = {
  symmetry: number;
  ringCount: number;
  ringSpacing: RingSpacing;
  pitchAngle: number;
  hue: number;
  opacity: number;
  mode: DotMandalaMode;
};

export type CymaticMode = { m: number; n: number };

export type DotMandalaStats = {
  mode: DotMandalaMode;
  symmetry: number;
  ringCount: number;
  dotCount: number;
  spiralPoints: number;
  cymaticMode: CymaticMode;
  ringSpacing: RingSpacing;
  frequencyHz: number;
  voiceMs: number;
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function medianRound(values: number[]): number {
  return Math.round(median(values));
}

export function meanRound(values: number[]): number {
  if (values.length === 0) {
    return 6;
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / values.length);
}

function paramSources(snapshot: FeatureSnapshot): FeatureSnapshot[] {
  const process = snapshot.processSnapshots ?? [];
  return process.length > 0 ? process : [snapshot];
}

export function dotMandalaMode(snapshot: FeatureSnapshot): DotMandalaMode {
  return (snapshot.processSnapshots?.length ?? 0) >= 2 ? 'process' : 'breath';
}

/** Кольца Process или синтетические «дыхания» для короткой Live-сессии. */
export function pickRingSnapshotsForDraw(
  snapshots: FeatureSnapshot[],
  maxRings = 14,
): FeatureSnapshot[] {
  if (snapshots.length <= maxRings) {
    return snapshots;
  }

  const picked: FeatureSnapshot[] = [];
  for (let i = 0; i < maxRings; i += 1) {
    const idx = Math.round((i / (maxRings - 1)) * (snapshots.length - 1));
    picked.push(snapshots[idx]);
  }
  return picked;
}

export function resolveRingSnapshots(snapshot: FeatureSnapshot): FeatureSnapshot[] {
  if (snapshot.processSnapshots && snapshot.processSnapshots.length > 0) {
    return snapshot.processSnapshots;
  }
  return synthesizeBreathRings(snapshot);
}

function synthesizeBreathRings(snapshot: FeatureSnapshot): FeatureSnapshot[] {
  const trail = snapshot.pitchTrail ?? [];
  const targetRings = clamp(
    Math.round(median([
      snapshot.params.elementCount,
      3 + Math.floor(trail.length / 10),
    ])),
    1,
    8,
  );

  if (trail.length < targetRings * 2) {
    return [{ ...snapshot, label: 'Момент' }];
  }

  const chunkSize = Math.ceil(trail.length / targetRings);
  const rings: FeatureSnapshot[] = [];

  for (let k = 0; k < targetRings; k += 1) {
    const chunk = trail.slice(k * chunkSize, (k + 1) * chunkSize);
    if (chunk.length === 0) {
      continue;
    }
    rings.push(snapshotFromTrailChunk(snapshot, chunk, k + 1));
  }

  return rings.length > 0 ? rings : [{ ...snapshot, label: 'Момент' }];
}

function snapshotFromTrailChunk(
  base: FeatureSnapshot,
  chunk: PitchPoint[],
  index: number,
): FeatureSnapshot {
  const avgRadiusNorm = chunk.reduce((sum, p) => sum + p.radiusNorm, 0) / chunk.length;
  const avgOpacity = chunk.reduce((sum, p) => sum + p.opacity, 0) / chunk.length;
  const last = chunk[chunk.length - 1];

  return {
    ...base,
    label: `Дыхание ${index}`,
    params: {
      ...base.params,
      opacity: avgOpacity,
      pitchAngle: last?.angle ?? base.params.pitchAngle,
      radius: base.params.radius * (0.82 + avgRadiusNorm * 0.28),
    },
  };
}

export function resolveDotMandalaScaffold(snapshot: FeatureSnapshot): DotMandalaScaffold {
  const sources = paramSources(snapshot);
  const ringSnapshots = resolveRingSnapshots(snapshot);

  const symmetries = sources.map((s) => s.params.symmetry);
  const hues = sources.map((s) => s.params.hue);
  const opacities = sources.map((s) => s.params.opacity);
  const fluxes = sources.map((s) => s.features.spectralFlux);

  return {
    symmetry: Math.max(4, meanRound(symmetries)),
    ringCount: clamp(ringSnapshots.length, 1, 16),
    ringSpacing: meanRound(fluxes.map((f) => f * 100)) / 100 > 0.055 ? 'golden' : 'linear',
    pitchAngle: snapshot.params.pitchAngle,
    hue: meanRound(hues),
    opacity: Math.min((opacities.reduce((a, b) => a + b, 0) / Math.max(opacities.length, 1)) * 1.04, 1),
    mode: dotMandalaMode(snapshot),
  };
}

export function pitchModulatedGoldenAngle(pitchNorm: number): number {
  const t = clamp(pitchNorm, 0, 1);
  return GOLDEN_ANGLE_RAD * (1 + PITCH_ANGLE_MOD * (t - 0.5) * 2);
}

/** Микро-асимметрия только из сигнала — без hash сессии. */
export function signalPitchJitter(features: AudioFeatures): number {
  if (features.frequency <= 0) {
    return features.spectralFlux * 0.012;
  }
  const micro = (features.frequency % 13) / 13000;
  return micro + features.spectralFlux * 0.01;
}

export function cymaticModeFromFeatures(features: AudioFeatures): CymaticMode {
  const h = Math.max(1, Math.round(features.harmonicCount));
  return {
    m: 1 + (h % 4),
    n: 1 + Math.floor(h / 2) % 4,
  };
}

export function ringRadiusAt(
  index: number,
  total: number,
  R: number,
  spacing: RingSpacing,
  innerFrac = 0.22,
  outerFrac = 0.9,
): number {
  const t = (index + 1) / (total + 1);
  const inner = R * innerFrac;
  const outer = R * outerFrac;

  if (spacing === 'golden') {
    const lo = 1 / GOLDEN_RATIO;
    const hi = GOLDEN_RATIO;
    const scale = Math.pow(GOLDEN_RATIO, t * 2 - 1);
    const normalized = (scale - lo) / (hi - lo);
    return inner + clamp(normalized, 0, 1) * (outer - inner);
  }

  return inner + t * (outer - inner);
}

export function normalizeBandLevels(bands: number[]): number[] {
  const peak = Math.max(...bands, 0.0001);
  return bands.map((v) => {
    const t = clamp(v / peak, 0, 1);
    return Math.pow(t, 0.68);
  });
}

export function cymaticAmplitude(
  mode: CymaticMode,
  theta: number,
  r: number,
  R: number,
): number {
  const rn = clamp(r / R, 0.02, 1);
  return Math.cos(mode.m * theta) * Math.sin(mode.n * Math.PI * rn);
}

export function buildDotMandalaStats(
  snapshot: FeatureSnapshot,
  scaffold: DotMandalaScaffold,
  ringDots: number,
  spiralDots: number,
  coreDots: number,
): DotMandalaStats {
  return {
    mode: scaffold.mode,
    symmetry: scaffold.symmetry,
    ringCount: scaffold.ringCount,
    dotCount: ringDots + spiralDots + coreDots,
    spiralPoints: spiralDots,
    cymaticMode: cymaticModeFromFeatures(snapshot.features),
    ringSpacing: scaffold.ringSpacing,
    frequencyHz: snapshot.features.frequency,
    voiceMs: snapshot.voiceMs ?? 0,
  };
}

export function dotMandalaReportLines(stats: DotMandalaStats): string[] {
  return [
    '',
    'Точечная мандала момента',
    `  режим ${stats.mode === 'process' ? 'Process (этапы)' : 'Breath (вдох/момент)'}`,
    `  симметрия N=${stats.symmetry} · колец ${stats.ringCount} · шаг ${stats.ringSpacing}`,
    `  точек ${stats.dotCount} (кольца + спираль + ядро)`,
    `  спираль ${stats.spiralPoints} · циматика m=${stats.cymaticMode.m} n=${stats.cymaticMode.n}`,
    stats.frequencyHz > 0 ? `  f₀ ${Math.round(stats.frequencyHz)} Hz` : '  f₀ —',
    stats.voiceMs > 0 ? `  голос ~${Math.round(stats.voiceMs / 1000)} с` : '',
  ].filter(Boolean);
}
