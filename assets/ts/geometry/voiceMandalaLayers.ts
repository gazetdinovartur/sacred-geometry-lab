import paper from 'paper';
import type { AudioFeatures, FeatureSnapshot, GeometryParams, PitchPoint, VoiceMotifKind } from '../types';
import type { MandalaPalette } from './mandalaPalette';
import { paletteStroke, chakraHueFromT, chakraHueFromHz, chakraPaperColor, ringBandColor } from './mandalaPalette';
import { u } from './renderUnits';

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
    strokeWidth: u(R, Math.max(0.95 + params.opacity * 0.55, 1.05)),
    fillColor: null,
  }));
}

/** Гармоники → вложенные кольца с чакровым оттенком по полосе. */
export function drawHarmonicRings(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  features: AudioFeatures,
  palette: MandalaPalette,
): void {
  const levels = Math.min(Math.max(params.elementCount, 2), 7);
  for (let ring = 1; ring <= levels; ring += 1) {
    const bandT = (ring - 1) / Math.max(levels - 1, 1);
    const color = ringBandColor(
      palette,
      ring - 1,
      levels,
      bandT,
      features.spectralCentroid,
      ring - 1,
      levels,
      params.opacity,
    );
    group.addChild(new paper.Path.Circle({
      center,
      radius: R * (0.2 + ring * 0.1),
      strokeColor: paletteStroke(color, 0.32 + params.opacity * 0.22),
      strokeWidth: u(R, 0.72 + features.harmonicCount * 0.06),
      dashArray: ring % 2 === 0 ? [u(R, 2.5), u(R, 5.5)] : undefined,
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

/** Спектр → маркеры на общем кольце (без «висящих» дуг). */
export function drawSpectrumRingMarkers(
  group: paper.Group,
  center: paper.Point,
  R: number,
  bands: number[],
  energy: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  const ringR = R * 0.68;
  const levels = normalizeBandLevels(bands.slice(0, EXPORT_BANDS));
  const base = params.pitchAngle - Math.PI / 2;

  group.addChild(new paper.Path.Circle({
    center,
    radius: ringR,
    strokeColor: stroke(0.2 + energy * 0.14),
    strokeWidth: u(R, 0.62),
    fillColor: null,
  }));

  for (let i = 0; i < EXPORT_BANDS; i += 1) {
    const v = levels[i] ?? 0;
    const angle = base + (Math.PI * 2 * i) / EXPORT_BANDS;
    const pt = pointOn(center, angle, ringR);
    const chakra = chakraPaperColor(chakraHueFromT(i / (EXPORT_BANDS - 1)), 0.58 + v * 0.28, 0.76 + v * 0.14);

    group.addChild(new paper.Path.Circle({
      center: pt,
      radius: u(R, 1.1 + v * 2.2),
      fillColor: paletteStroke(chakra, 0.38 + v * energy * 0.48),
      strokeColor: paletteStroke(chakra, 0.22 + v * 0.24),
      strokeWidth: u(R, 0.35),
    }));

    if (v > 0.2) {
      const tickIn = u(R, 2 + v * 10);
      group.addChild(new paper.Path.Line({
        from: pt,
        to: pointOn(center, angle, ringR - tickIn),
        strokeColor: stroke(0.18 + v * 0.32),
        strokeWidth: u(R, 0.5 + v * 0.25),
        strokeCap: 'round',
      }));
    }
  }
}

/** Тон → лучи с чакровой шкалой по углу. */
export function drawToneRays(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  features: AudioFeatures,
  palette: MandalaPalette,
): void {
  const rays = Math.max(params.symmetry, params.rays, 3);
  for (let i = 0; i < rays; i += 1) {
    const bandT = i / Math.max(rays - 1, 1);
    const color = ringBandColor(
      palette,
      i % EXPORT_BANDS,
      EXPORT_BANDS,
      bandT * 0.6,
      features.spectralCentroid,
      i,
      rays,
      params.opacity,
    );
    const angle = (Math.PI * 2 * i) / rays + params.pitchAngle;
    const dir = new paper.Point(Math.cos(angle), Math.sin(angle));
    const inner = R * (0.12 + params.opacity * 0.04);
    group.addChild(new paper.Path.Line({
      from: center.add(dir.multiply(inner)),
      to: center.add(dir.multiply(R * 0.94)),
      strokeColor: paletteStroke(color, 0.38 + params.opacity * 0.32),
      strokeWidth: u(R, 0.75 + bandT * 0.35),
      strokeCap: 'round',
    }));
  }
}

/** Ритм → звезда; вершины от спектра, цвет от центроида. */
export function drawRhythmStar(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  features: AudioFeatures,
  palette: MandalaPalette,
  spectrum?: number[],
): void {
  const n = Math.max(params.symmetry, 5);
  const centroidNorm = Math.min(features.spectralCentroid / 4500, 1);
  const outer = R * (0.46 + centroidNorm * 0.16);
  const inner = outer * (0.36 + Math.min(features.harmonicCount, 6) * 0.035);
  const bands = spectrum?.length
    ? normalizeBandLevels(spectrum.slice(0, EXPORT_BANDS))
    : null;
  const star = new paper.Path();

  for (let i = 0; i <= n * 2; i += 1) {
    const angle = (Math.PI * i) / n + params.pitchAngle - Math.PI / 2;
    const bandV = bands ? (bands[Math.floor((i / (n * 2)) * EXPORT_BANDS) % EXPORT_BANDS] ?? 0.4) : 0.5;
    const rMod = bands ? 0.82 + bandV * 0.36 : 1;
    const r = (i % 2 === 0 ? outer : inner) * rMod;
    const pt = pointOn(center, angle, r);
    if (i === 0) {
      star.moveTo(pt);
    } else {
      star.lineTo(pt);
    }
  }

  star.closed = true;
  const starColor = chakraPaperColor(
    chakraHueFromHz(features.spectralCentroid, 0.45),
    0.52,
    0.76,
  );
  star.strokeColor = paletteStroke(starColor, 0.5 + params.opacity * 0.32);
  star.strokeWidth = u(R, 0.85 + features.harmonicCount * 0.04);
  star.fillColor = paletteStroke(starColor, 0.06 + params.opacity * 0.08);
  group.addChild(star);
}

/** Тембр → ядро bindu по центроиду. */
export function drawTimbreCore(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  features: AudioFeatures,
  palette: MandalaPalette,
): void {
  const sides = 3 + Math.min(Math.round(params.lineWidth), 5);
  const r = R * (0.11 + params.opacity * 0.05);
  const coreColor = ringBandColor(
    palette,
    3,
    7,
    0.45,
    features.spectralCentroid,
    0,
    1,
    features.rms * 8 + 0.35,
  );
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
  poly.strokeColor = paletteStroke(coreColor, 0.55 + params.opacity * 0.25);
  poly.strokeWidth = u(R, 0.72);
  poly.fillColor = paletteStroke(coreColor, 0.12 + params.opacity * 0.1);
  group.addChild(poly);
}

/** Цветок — N лепестков на лучах симметрии, привязан к центру. */
export function drawFlowerScaffold(
  group: paper.Group,
  center: paper.Point,
  R: number,
  params: GeometryParams,
  stroke: StrokeFn,
): void {
  const n = Math.max(6, params.symmetry);
  const petalR = R * 0.09;
  const orbitR = petalR * 1.12;
  const base = params.pitchAngle - Math.PI / 2;

  group.addChild(new paper.Path.Circle({
    center,
    radius: petalR,
    strokeColor: stroke(0.48 + params.opacity * 0.22),
    strokeWidth: u(R, 0.82),
    fillColor: null,
  }));

  for (let i = 0; i < n; i += 1) {
    const angle = base + (Math.PI * 2 * i) / n;
    const c = pointOn(center, angle, orbitR);
    group.addChild(new paper.Path.Circle({
      center: c,
      radius: petalR,
      strokeColor: stroke(0.4 + params.opacity * 0.2),
      strokeWidth: u(R, 0.78),
      fillColor: null,
    }));
    group.addChild(new paper.Path.Line({
      from: center,
      to: c,
      strokeColor: stroke(0.16 + params.opacity * 0.12),
      strokeWidth: u(R, 0.42),
    }));
  }
}

/** Process — каждый этап = спектральное кольцо (чакры, реальный EQ этапа). */
export function drawProcessSpectrumLayers(
  group: paper.Group,
  center: paper.Point,
  R: number,
  snapshots: FeatureSnapshot[],
  params: GeometryParams,
  palette: MandalaPalette,
): void {
  if (snapshots.length === 0) {
    return;
  }

  const base = params.pitchAngle - Math.PI / 2;

  snapshots.forEach((snap, stageIndex) => {
    const depth = snapshots.length <= 1 ? 0.5 : stageIndex / (snapshots.length - 1);
    const ringR = R * (0.34 + depth * 0.56);
    const rawBands = snap.spectrum?.length
      ? snap.spectrum.slice(0, EXPORT_BANDS)
      : new Array(EXPORT_BANDS).fill(0.35);
    const levels = normalizeBandLevels(rawBands);
    const energy = Math.min(Math.max(snap.params.opacity, 0.35), 1);
    const centroid = snap.features.spectralCentroid;
    const ringHue = chakraPaperColor(chakraHueFromHz(centroid, depth), 0.38, 0.68);

    group.addChild(new paper.Path.Circle({
      center,
      radius: ringR,
      strokeColor: paletteStroke(ringHue, 0.2 + energy * 0.14),
      strokeWidth: u(R, 0.48 + energy * 0.18),
      fillColor: null,
    }));

    for (let i = 0; i < EXPORT_BANDS; i += 1) {
      const v = levels[i] ?? 0;
      const angle = base + (Math.PI * 2 * i) / EXPORT_BANDS;
      const pt = pointOn(center, angle, ringR);
      const color = ringBandColor(
        palette,
        i,
        EXPORT_BANDS,
        depth,
        centroid,
        stageIndex,
        snapshots.length,
        v,
      );

      group.addChild(new paper.Path.Circle({
        center: pt,
        radius: u(R, 1.0 + v * 2.5),
        fillColor: paletteStroke(color, 0.34 + v * energy * 0.52),
        strokeColor: paletteStroke(color, 0.18 + v * 0.3),
        strokeWidth: u(R, 0.32),
      }));

      if (v > 0.12) {
        group.addChild(new paper.Path.Line({
          from: pt,
          to: pointOn(center, angle, ringR - u(R, 2 + v * 9)),
          strokeColor: paletteStroke(color, 0.14 + v * 0.38),
          strokeWidth: u(R, 0.42 + v * 0.28),
          strokeCap: 'round',
        }));
      }
    }
  });
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
    strokeWidth: u(R, 0.65),
    dashArray: [u(R, 2), u(R, 8)],
    fillColor: null,
  });
  group.addChild(orbit);

  snapshots.forEach((snap, index) => {
    const t = snapshots.length === 1 ? 0 : index / snapshots.length;
    const angle = -Math.PI / 2 + t * Math.PI * 2 + params.pitchAngle * 0.12;
    const pt = pointOn(center, angle, orbitR);
    const nodeColor = ringBandColor(
      palette,
      index % EXPORT_BANDS,
      EXPORT_BANDS,
      t,
      snap.features.spectralCentroid,
      index,
      snapshots.length,
      snap.params.opacity,
    );
    group.addChild(new paper.Path.Circle({
      center: pt,
      radius: u(R, 2.2 + snap.params.opacity * 1.4),
      fillColor: paletteStroke(nodeColor, 0.58 + snap.params.opacity * 0.28),
      strokeColor: paletteStroke(nodeColor, 0.42),
      strokeWidth: u(R, 0.5),
    }));
  });
}

/** Контур голоса — в первом секторе симметрии, затем N-кратно. */
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

  const N = Math.max(3, params.symmetry);
  const sector = (Math.PI * 2) / N;
  const base = params.pitchAngle - Math.PI / 2;
  const trackR = R * 0.62;
  const sampled = downsampleTrail(segments, 64);

  const foldAngle = (angle: number): number => {
    let local = angle - base;
    local = ((local % sector) + sector) % sector;
    return base + local;
  };

  for (let w = 0; w < N; w += 1) {
    const rot = w * sector;

    for (let i = 1; i < sampled.length; i += 1) {
      const prev = sampled[i - 1];
      const seg = sampled[i];
      const style = motifStrokeStyle(seg.kind, seg.variant);
      const pitchNorm = clamp01((seg.radiusNorm - 0.28) / 0.55);
      const segColor = ringBandColor(
        palette,
        Math.floor(pitchNorm * 6) % 7,
        7,
        pitchNorm,
        params.hue * 12,
        i,
        sampled.length,
        seg.opacity,
      );
      const r0 = trackR * (0.78 + prev.radiusNorm * 0.22);
      const r1 = trackR * (0.78 + seg.radiusNorm * 0.22);
      const a0 = foldAngle(prev.angle + params.pitchAngle * 0.05) + rot;
      const a1 = foldAngle(seg.angle + params.pitchAngle * 0.05) + rot;

      const segment = new paper.Path.Line({
        from: pointOn(center, a0, r0),
        to: pointOn(center, a1, r1),
        strokeColor: paletteStroke(segColor, style.opacity + params.opacity * 0.2),
        strokeWidth: u(R, Math.max(style.width + seg.lineWidth * 0.25, 0.65)),
        strokeCap: 'round',
      });
      if (style.dash) {
        segment.dashArray = style.dash.map((d) => u(R, d));
      }
      group.addChild(segment);
    }

    const last = sampled[sampled.length - 1];
    const tip = pointOn(
      center,
      foldAngle(last.angle + params.pitchAngle * 0.05) + rot,
      trackR * (0.78 + last.radiusNorm * 0.22),
    );
    group.addChild(new paper.Path.Circle({
      center: tip,
      radius: u(R, 1.4 + params.opacity * 1.0),
      fillColor: paletteStroke(palette.primary, 0.68),
      strokeColor: null,
    }));
  }
}

/** f₀ / центроид → метка на внешнем кольце. */
export function drawPitchMarker(
  group: paper.Group,
  center: paper.Point,
  R: number,
  features: AudioFeatures,
  params: GeometryParams,
  palette: MandalaPalette,
): void {
  const hz = features.frequency > 0 ? features.frequency : features.spectralCentroid;
  if (hz < 55) {
    return;
  }

  const minHz = 80;
  const maxHz = 2400;
  const t = (Math.log(Math.max(hz, minHz)) - Math.log(minHz))
    / (Math.log(maxHz) - Math.log(minHz));
  const angle = -Math.PI / 2 + Math.min(Math.max(t, 0), 1) * Math.PI * 2 + params.pitchAngle * 0.05;
  const pr = R * 0.97;
  const px = pointOn(center, angle, pr);
  const markColor = ringBandColor(
    palette,
    Math.round(t * 6),
    7,
    t,
    hz,
    0,
    1,
    params.opacity,
  );

  group.addChild(new paper.Path.Line({
    from: pointOn(center, angle, R * 0.72),
    to: px,
    strokeColor: paletteStroke(markColor, 0.42 + params.opacity * 0.28),
    strokeWidth: u(R, 0.75),
    strokeCap: 'round',
  }));

  group.addChild(new paper.Path.Circle({
    center: px,
    radius: u(R, 2.2),
    fillColor: paletteStroke(markColor, 0.82),
    strokeColor: null,
  }));
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
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
