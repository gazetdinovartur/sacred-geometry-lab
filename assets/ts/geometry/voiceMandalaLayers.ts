import paper from 'paper';
import type { AudioFeatures, FeatureSnapshot, GeometryParams, PitchPoint, VoiceMotifKind } from '../types';
import type { MandalaPalette } from './mandalaPalette';
import { paletteStroke } from './mandalaPalette';
import { pitchShimmerJitter } from './sessionVariety';

export const EXPORT_BANDS = 8;

type StrokeFn = (opacity: number) => paper.Color;

type MotifStroke = {
  width: number;
  opacity: number;
  dash?: number[];
};

const MOTIF_STROKES: Record<VoiceMotifKind, MotifStroke> = {
  ring: { width: 1.35, opacity: 0.72 },
  petal: { width: 0.82, opacity: 0.52 },
  ray: { width: 1.05, opacity: 0.66, dash: [2, 5] },
  arc: { width: 0.95, opacity: 0.58, dash: [4, 4] },
  wave: { width: 1.15, opacity: 0.62, dash: [1, 3] },
  dot: { width: 0.7, opacity: 0.48, dash: [0.5, 4] },
  filigree: { width: 0.88, opacity: 0.55, dash: [1, 2, 1, 6] },
  crescent: { width: 1.0, opacity: 0.6, dash: [6, 3] },
  chevron: { width: 1.2, opacity: 0.68, dash: [3, 2] },
  lattice: { width: 0.78, opacity: 0.5, dash: [2, 2] },
};

export function motifStrokeStyle(kind: VoiceMotifKind, variant = 0): MotifStroke {
  const base = MOTIF_STROKES[kind] ?? MOTIF_STROKES.petal;
  const v = 1 + variant * 0.04;
  return {
    width: base.width * v,
    opacity: Math.min(base.opacity * (0.94 + variant * 0.03), 0.85),
    dash: base.dash,
  };
}

/** RMS → масштаб и главное кольцо. */
export function drawRmsRing(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  group.addChild(new paper.Path.Circle({
    center,
    radius: R,
    strokeColor: stroke(0.55 + params.opacity * 0.38),
    strokeWidth: Math.max(0.95 + params.opacity * 0.55, 1.05),
    fillColor: null,
  }));
}

/** Гармоники → вложенные кольца (число уровней = elementCount). */
export function drawHarmonicRings(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  const levels = Math.min(Math.max(params.elementCount, 2), 6);
  for (let ring = 1; ring <= levels; ring += 1) {
    group.addChild(new paper.Path.Circle({
      center,
      radius: R * (0.22 + ring * 0.11),
      strokeColor: stroke(0.28 + params.opacity * 0.18),
      strokeWidth: 0.82,
      dashArray: ring % 2 === 0 ? [3, 6] : undefined,
      fillColor: null,
    }));
  }
}

function normalizeBandLevels(bands: number[]): number[] {
  const peak = Math.max(...bands, 0.0001);
  return bands.map((v) => {
    const t = Math.min(Math.max(v / peak, 0), 1);
    return Math.pow(t, 0.68);
  });
}

/** Спектр → 8 дуг (per-band peak + gamma). */
export function drawSpectrumArcs(
  group: paper.Group,
  center: paper.Point,
  R: number,
  bands: number[],
  energy: number,
  stroke: StrokeFn,
): void {
  const inner = R * 0.5;
  const span = (Math.PI * 2) / EXPORT_BANDS;
  const gap = span * 0.12;
  const maxDepth = R * 0.28 * energy;
  const levels = normalizeBandLevels(bands.slice(0, EXPORT_BANDS));

  for (let i = 0; i < EXPORT_BANDS; i += 1) {
    const v = levels[i] ?? 0;
    const depth = inner + maxDepth * v;
    const a0 = -Math.PI / 2 + i * span + gap / 2;
    const a1 = a0 + span - gap;
    const arc = new paper.Path.Arc({
      from: pointOn(center, a0, inner),
      through: pointOn(center, (a0 + a1) / 2, depth),
      to: pointOn(center, a1, inner),
    });
    arc.strokeColor = stroke(0.28 + v * energy * 0.52);
    arc.strokeWidth = 0.75 + v * 0.35;
    arc.fillColor = null;
    group.addChild(arc);
  }
}

/** Тон → число лучей и их наклон. */
export function drawToneRays(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  const rays = Math.max(params.rays, 3);
  for (let i = 0; i < rays; i += 1) {
    const angle = (Math.PI * 2 * i) / rays + params.pitchAngle;
    const dir = new paper.Point(Math.cos(angle), Math.sin(angle));
    group.addChild(new paper.Path.Line({
      from: center.add(dir.multiply(R * 0.14)),
      to: center.add(dir.multiply(R * 0.94)),
      strokeColor: stroke(0.38 + params.opacity * 0.28),
      strokeWidth: 0.85,
      strokeCap: 'round',
    }));
  }
}

/** Ритм → звезда N-лучей с микро-jitter от f₀/flux. */
export function drawRhythmStar(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  features: AudioFeatures,
  stroke: StrokeFn,
): void {
  const n = Math.max(params.symmetry, 5);
  const outer = R * 0.58;
  const inner = outer * 0.42;
  const jitter = pitchShimmerJitter(features);
  const star = new paper.Path();

  for (let i = 0; i <= n * 2; i += 1) {
    const angle = (Math.PI * i) / n + params.pitchAngle - Math.PI / 2;
    const wobble = (i % 2 === 0 ? 1 : -1) * jitter * R * 18;
    const r = (i % 2 === 0 ? outer : inner) + wobble;
    const pt = pointOn(center, angle, r);
    if (i === 0) {
      star.moveTo(pt);
    } else {
      star.lineTo(pt);
    }
  }

  star.closed = true;
  star.strokeColor = stroke(0.48 + params.opacity * 0.3);
  star.strokeWidth = 0.9;
  star.fillColor = null;
  group.addChild(star);
}

/** Тембр (centroid) → малый многоугольник в центре. */
export function drawTimbreCore(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  const sides = 3 + Math.min(Math.round(params.lineWidth), 5);
  const r = R * 0.14;
  const poly = new paper.Path();

  for (let i = 0; i <= sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides + params.pitchAngle * 0.5;
    const pt = pointOn(center, angle, r);
    if (i === 0) {
      poly.moveTo(pt);
    } else {
      poly.lineTo(pt);
    }
  }

  poly.closed = true;
  poly.strokeColor = stroke(0.4 + params.opacity * 0.22);
  poly.strokeWidth = 0.78;
  poly.fillColor = null;
  group.addChild(poly);
}

/** Цветок жизни — каркас (стиль flower). */
export function drawFlowerScaffold(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  const petalR = R * 0.11;
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    const c = pointOn(center, angle, petalR);
    group.addChild(new paper.Path.Circle({
      center: c,
      radius: petalR,
      strokeColor: stroke(0.42 + params.opacity * 0.2),
      strokeWidth: 0.82,
      fillColor: null,
    }));
  }
  group.addChild(new paper.Path.Circle({
    center,
    radius: petalR,
    strokeColor: stroke(0.5 + params.opacity * 0.22),
    strokeWidth: 0.85,
    fillColor: null,
  }));
}

/** Process — слепки как узлы на второй орбите. */
export function drawProcessOrbit(
  group: paper.Group,
  center: paper.Point,
  R: number,
  snapshots: FeatureSnapshot[],
  params: GeometryParams,
  palette: MandalaPalette,
): void {
  if (snapshots.length < 2) {
    return;
  }

  const orbitR = R * 0.78;
  const orbit = new paper.Path.Circle({
    center,
    radius: orbitR,
    strokeColor: paletteStroke(palette.secondary, 0.28),
    strokeWidth: 0.65,
    dashArray: [2, 8],
    fillColor: null,
  });
  group.addChild(orbit);

  snapshots.forEach((snap, index) => {
    const t = snapshots.length === 1 ? 0 : index / snapshots.length;
    const angle = -Math.PI / 2 + t * Math.PI * 2 + params.pitchAngle * 0.12;
    const pt = pointOn(center, angle, orbitR);
    group.addChild(new paper.Path.Circle({
      center: pt,
      radius: 2.2 + snap.params.opacity * 1.4,
      fillColor: paletteStroke(palette.primary, 0.55 + snap.params.opacity * 0.25),
      strokeColor: paletteStroke(palette.secondary, 0.4),
      strokeWidth: 0.5,
    }));
  });
}

/** Контур голоса — сегменты с толщиной/штрихом от VoiceMotifKind. */
export function drawVoiceTrace(
  group: paper.Group,
  center: paper.Point,
  R: number,
  segments: PitchPoint[],
  params: GeometryParams,
  palette: MandalaPalette,
): void {
  if (segments.length === 0) {
    return;
  }

  const trackR = R * 0.62;
  const sampled = downsampleTrail(segments, 96);

  for (let i = 1; i < sampled.length; i += 1) {
    const prev = sampled[i - 1];
    const seg = sampled[i];
    const style = motifStrokeStyle(seg.kind, seg.variant);
    const r0 = trackR * (0.78 + prev.radiusNorm * 0.22);
    const r1 = trackR * (0.78 + seg.radiusNorm * 0.22);
    const a0 = prev.angle + params.pitchAngle * 0.08;
    const a1 = seg.angle + params.pitchAngle * 0.08;

    const segment = new paper.Path.Line({
      from: pointOn(center, a0, r0),
      to: pointOn(center, a1, r1),
      strokeColor: paletteStroke(palette.secondary, style.opacity + params.opacity * 0.18),
      strokeWidth: Math.max(style.width + seg.lineWidth * 0.25, 0.65),
      strokeCap: 'round',
    });
    if (style.dash) {
      segment.dashArray = style.dash;
    }
    group.addChild(segment);
  }

  const last = sampled[sampled.length - 1];
  const tip = pointOn(
    center,
    last.angle + params.pitchAngle * 0.08,
    trackR * (0.78 + last.radiusNorm * 0.22),
  );
  group.addChild(new paper.Path.Circle({
    center: tip,
    radius: 1.6 + params.opacity * 1.2,
    fillColor: paletteStroke(palette.primary, 0.75),
    strokeColor: null,
  }));
}

/** f₀ → метка на внешнем кольце. */
export function drawPitchMarker(
  group: paper.Group,
  center: paper.Point,
  R: number,
  features: AudioFeatures,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  if (features.frequency <= 0) {
    return;
  }

  const minHz = 80;
  const maxHz = 2400;
  const t = (Math.log(features.frequency) - Math.log(minHz))
    / (Math.log(maxHz) - Math.log(minHz));
  const angle = -Math.PI / 2 + Math.min(Math.max(t, 0), 1) * Math.PI * 2 + params.pitchAngle * 0.05;
  const pr = R * 0.97;
  const px = pointOn(center, angle, pr);

  group.addChild(new paper.Path.Line({
    from: pointOn(center, angle, R * 0.72),
    to: px,
    strokeColor: stroke(0.35 + params.opacity * 0.25),
    strokeWidth: 0.75,
    strokeCap: 'round',
  }));

  group.addChild(new paper.Path.Circle({
    center: px,
    radius: 2.2,
    fillColor: stroke(0.8),
    strokeColor: null,
  }));
}

export function downsampleTrail(points: PitchPoint[], max: number): PitchPoint[] {
  if (points.length <= max) {
    return points;
  }
  const out: PitchPoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

function pointOn(center: paper.Point, angle: number, radius: number): paper.Point {
  return center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(radius));
}
