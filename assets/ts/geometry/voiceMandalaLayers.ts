import paper from 'paper';
import type { AudioFeatures, GeometryParams, PitchPoint } from '../types';
import type { MandalaPalette } from './mandalaPalette';
import { paletteStroke } from './mandalaPalette';

export const EXPORT_BANDS = 8;

type StrokeFn = (opacity: number) => paper.Color;

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

/** Спектр → 8 дуг (только контур, без заливки). */
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

  for (let i = 0; i < EXPORT_BANDS; i += 1) {
    const v = Math.min(Math.max(bands[i] ?? 0, 0), 1);
    const depth = inner + maxDepth * Math.pow(v, 0.55);
    const a0 = -Math.PI / 2 + i * span + gap / 2;
    const a1 = a0 + span - gap;
    const arc = new paper.Path.Arc({
      from: pointOn(center, a0, inner),
      through: pointOn(center, (a0 + a1) / 2, depth),
      to: pointOn(center, a1, inner),
    });
    arc.strokeColor = stroke(0.32 + v * energy * 0.42);
    arc.strokeWidth = 0.85;
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

/** Ритм → звезда N-лучей. */
export function drawRhythmStar(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  const n = Math.max(params.symmetry, 5);
  const outer = R * 0.58;
  const inner = outer * 0.42;
  const star = new paper.Path();

  for (let i = 0; i <= n * 2; i += 1) {
    const angle = (Math.PI * i) / n + params.pitchAngle - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
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

/** Контур голоса — одна линия по pitchTrail (без леса мотивов). */
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
  const path = new paper.Path();
  const sampled = downsampleTrail(segments, 96);

  sampled.forEach((seg, index) => {
    const r = trackR * (0.78 + seg.radiusNorm * 0.22);
    const pt = pointOn(center, seg.angle + params.pitchAngle * 0.08, r);
    if (index === 0) {
      path.moveTo(pt);
    } else {
      path.lineTo(pt);
    }
  });

  path.strokeColor = paletteStroke(palette.secondary, 0.52 + params.opacity * 0.32);
  path.strokeWidth = Math.max(0.75 + params.lineWidth * 0.35, 0.85);
  path.strokeCap = 'round';
  path.strokeJoin = 'round';
  group.addChild(path);

  const last = sampled[sampled.length - 1];
  const tip = pointOn(center, last.angle + params.pitchAngle * 0.08, trackR * (0.78 + last.radiusNorm * 0.22));
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
