import paper from 'paper';
import type { FeatureSnapshot, PitchPoint } from '../types';
import type { MandalaPalette } from './mandalaPalette';
import { paletteStroke, ringBandColor, spiralChakraColor, binduChakraColor } from './mandalaPalette';
import { u } from './renderUnits';
import { downsampleBars, SPECTRUM_EXPORT_BANDS } from './EqLabRenderer';
import { downsampleTrail } from './voiceMandalaLayers';
import {
  buildDotMandalaStats,
  cymaticModeFromFeatures,
  normalizeBandLevels,
  pitchModulatedGoldenAngle,
  pickRingSnapshotsForDraw,
  resolveDotMandalaScaffold,
  resolveRingSnapshots,
  ringRadiusAt,
  type DotMandalaStats,
  type RingSpacing,
} from './dotMandalaMath';

export type DotMandalaRenderResult = {
  stats: DotMandalaStats;
};

const SPIRAL_MAX = 32;
const MAX_DRAW_RINGS = 14;
const RING_INNER = 0.14;
const RING_OUTER = 0.992;
const RAY_OUTER = 0.994;
const RIM_OUTER = 0.996;

export function drawDotMandala(
  group: paper.Group,
  center: paper.Point,
  R: number,
  snapshot: FeatureSnapshot,
  palette: MandalaPalette,
): DotMandalaRenderResult {
  const scaffold = resolveDotMandalaScaffold(snapshot);
  const N = scaffold.symmetry;
  const ringSnapshots = pickRingSnapshotsForDraw(
    resolveRingSnapshots(snapshot),
    MAX_DRAW_RINGS,
  );
  const energy = Math.min(Math.max(scaffold.opacity, 0.45), 1);

  drawScaffold(group, center, R, N, ringSnapshots.length, scaffold.pitchAngle, palette);

  const spiralDots = drawFoldedVoiceSpiral(
    group,
    center,
    R,
    N,
    ringSnapshots.length,
    scaffold.ringSpacing,
    snapshot.pitchTrail ?? [],
    scaffold.pitchAngle,
    palette,
    energy,
  );

  const ringDots = drawSymmetricRingPetals(
    group,
    center,
    R,
    N,
    ringSnapshots,
    scaffold,
    snapshot,
    palette,
    energy,
  );

  drawBindu(group, center, R, snapshot, palette, energy);

  if (snapshot.params.breathRing > 0.05) {
    drawBreathHalo(group, center, R, N, snapshot.params.breathRing, palette, energy);
  }

  const stats = buildDotMandalaStats(snapshot, scaffold, ringDots, spiralDots, 0);
  return { stats };
}

function drawScaffold(
  group: paper.Group,
  center: paper.Point,
  R: number,
  N: number,
  ringCount: number,
  pitchAngle: number,
  palette: MandalaPalette,
): void {
  const guide = paletteStroke(palette.line, 0.1);
  const ringStroke = u(R, 0.55);
  const rayStroke = u(R, 0.48);
  const rimStroke = u(R, 0.62);
  const dashUnit = u(R, 2);
  const dashGap = u(R, 7);

  for (let k = 0; k < ringCount; k += 1) {
    const ringR = ringRadiusAt(k, ringCount, R, 'linear', RING_INNER, RING_OUTER);
    group.addChild(new paper.Path.Circle({
      center,
      radius: ringR,
      strokeColor: guide,
      strokeWidth: ringStroke,
      dashArray: k % 2 === 0 ? [dashUnit, dashGap] : undefined,
      fillColor: null,
    }));
  }

  for (let i = 0; i < N; i += 1) {
    const angle = pitchAngle + (Math.PI * 2 * i) / N - Math.PI / 2;
    const dir = new paper.Point(Math.cos(angle), Math.sin(angle));
    group.addChild(new paper.Path.Line({
      from: center.add(dir.multiply(R * 0.14)),
      to: center.add(dir.multiply(R * RAY_OUTER)),
      strokeColor: guide,
      strokeWidth: rayStroke,
      strokeCap: 'round',
    }));
  }

  group.addChild(new paper.Path.Circle({
    center,
    radius: R * RIM_OUTER,
    strokeColor: paletteStroke(palette.secondary, 0.16),
    strokeWidth: rimStroke,
    fillColor: null,
  }));
}

function drawSymmetricRingPetals(
  group: paper.Group,
  center: paper.Point,
  R: number,
  N: number,
  ringSnapshots: FeatureSnapshot[],
  scaffold: ReturnType<typeof resolveDotMandalaScaffold>,
  composite: FeatureSnapshot,
  palette: MandalaPalette,
  energy: number,
): number {
  const total = ringSnapshots.length;
  let count = 0;

  ringSnapshots.forEach((snap, ringIndex) => {
    const ringR = ringRadiusAt(ringIndex, total, R, scaffold.ringSpacing, RING_INNER, RING_OUTER);
    const nextRingR = ringIndex < total - 1
      ? ringRadiusAt(ringIndex + 1, total, R, scaffold.ringSpacing, RING_INNER, RING_OUTER)
      : null;
    const prevRingR = ringIndex > 0
      ? ringRadiusAt(ringIndex - 1, total, R, scaffold.ringSpacing, RING_INNER, RING_OUTER)
      : null;
    const bands = stretchLevels(spectrumBands(snap));
    const rmsBoost = clamp01(snap.features.rms * 8 + 0.25);
    const depth = total <= 1 ? 1 : ringIndex / (total - 1);
    const ringScale = 0.86 + depth * 0.38;
    const mode = cymaticModeFromFeatures(snap.features);
    const centroid = snap.features.spectralCentroid;
    const ringPattern = ringIndex % 3;

    for (let j = 0; j < N; j += 1) {
      const bandIndex = Math.floor((j * bands.length) / N) % bands.length;
      const level = bands[bandIndex] ?? 0.35;
      const theta = scaffold.pitchAngle + (Math.PI * 2 * j) / N - Math.PI / 2;
      const cymatic = Math.abs(
        Math.cos(mode.m * theta) * Math.sin(mode.n * Math.PI * (ringR / R)),
      );
      const weight = clamp01(level * 0.64 + cymatic * 0.36);
      const mainSize = dotSize(R, (0.013 + weight * 0.032 + rmsBoost * 0.01) * ringScale);
      const mainOpacity = 0.68 + weight * energy * 0.3;
      const dotColor = ringBandColor(
        palette,
        bandIndex,
        bands.length,
        depth,
        centroid,
        ringIndex,
        total,
        level,
      );

      addStyledDot(
        group,
        pointOn(center, theta, ringR),
        mainSize,
        dotColor,
        mainOpacity,
        weight > 0.35 ? paletteStroke(palette.line, 0.42) : null,
        R,
      );
      count += 1;

      const petalSpread = (Math.PI / N) * (0.22 + (ringPattern * 0.04));
      const satelliteCount = weight > 0.72 ? 3 : weight > 0.42 ? 2 : weight > 0.16 ? 1 : 0;
      for (let s = 0; s < satelliteCount; s += 1) {
        const sign = s === 0 ? -1 : s === 1 ? 1 : 0;
        const angleOff = sign === 0 ? petalSpread * 0.55 : sign * petalSpread;
        const radialOff = sign === 0 ? R * 0.014 : sign * R * 0.011;
        addStyledDot(
          group,
          pointOn(center, theta + angleOff, ringR + radialOff),
          mainSize * (0.4 + s * 0.06),
          ringBandColor(palette, (bandIndex + s + 1) % bands.length, bands.length, depth, centroid, ringIndex, total, level),
          0.42 + weight * energy * 0.46,
          null,
          R,
        );
        count += 1;
      }

      if (prevRingR !== null && weight > 0.14) {
        count += drawRadialChain(group, center, theta, prevRingR, ringR, mainSize, dotColor, weight, energy, R, 3);
      }

      addStyledDot(
        group,
        pointOn(center, theta, ringR * 0.71),
        mainSize * 0.38,
        ringBandColor(palette, bandIndex, bands.length, Math.max(depth - 0.12, 0), centroid, ringIndex, total, level),
        0.38 + weight * 0.42,
        null,
        R,
      );
      count += 1;

      const midTheta = scaffold.pitchAngle + (Math.PI * 2 * (j + 0.5)) / N - Math.PI / 2;
      const midWeight = clamp01(weight * 0.82 + cymatic * 0.18);
      addStyledDot(
        group,
        pointOn(center, midTheta, ringR),
        mainSize * 0.62,
        ringBandColor(palette, (bandIndex + 1) % bands.length, bands.length, depth + 0.05, centroid, ringIndex, total, midWeight),
        0.44 + midWeight * energy * 0.4,
        null,
        R,
      );
      count += 1;

      for (const frac of [1 / 3, 2 / 3]) {
        const triTheta = scaffold.pitchAngle + (Math.PI * 2 * (j + frac)) / N - Math.PI / 2;
        const triWeight = clamp01(weight * 0.7 + cymatic * 0.2);
        if (triWeight > 0.2 || ringPattern !== 1) {
          addStyledDot(
            group,
            pointOn(center, triTheta, ringR),
            mainSize * 0.48,
            ringBandColor(palette, (bandIndex + 2) % bands.length, bands.length, depth + 0.08, centroid, ringIndex, total, triWeight),
            0.36 + triWeight * energy * 0.38,
            null,
            R,
          );
          count += 1;
        }
      }

      if (nextRingR !== null) {
        const bridgeR = (ringR + nextRingR) / 2;
        addStyledDot(
          group,
          pointOn(center, theta + (Math.PI / N) * 0.07 * (j % 2 === 0 ? 1 : -1), bridgeR),
          mainSize * 0.44,
          ringBandColor(palette, bandIndex, bands.length, depth + 0.1, centroid, ringIndex, total, weight),
          0.38 + weight * energy * 0.34,
          null,
          R,
        );
        addStyledDot(
          group,
          pointOn(center, midTheta, bridgeR),
          mainSize * 0.36,
          ringBandColor(palette, (bandIndex + 1) % bands.length, bands.length, depth + 0.1, centroid, ringIndex, total, weight),
          0.34 + weight * energy * 0.3,
          null,
          R,
        );
        count += 2;
      }
    }
  });

  return count;
}

function drawFoldedVoiceSpiral(
  group: paper.Group,
  center: paper.Point,
  R: number,
  N: number,
  _ringCount: number,
  _ringSpacing: RingSpacing,
  trail: PitchPoint[],
  pitchAngle: number,
  palette: MandalaPalette,
  energy: number,
): number {
  if (trail.length === 0) {
    return 0;
  }

  const sampled = downsampleTrail(trail, SPIRAL_MAX);
  const sector = (Math.PI * 2) / N;
  const base = pitchAngle - Math.PI / 2;
  const nMax = Math.max(sampled.length, 1);
  let thetaLocal = sector * 0.1;
  let count = 0;

  sampled.forEach((point, index) => {
    const pitchNorm = clamp01((point.radiusNorm - 0.28) / 0.55);
    thetaLocal = (thetaLocal + pitchModulatedGoldenAngle(pitchNorm) * 0.24) % sector;

    const radialT = Math.sqrt((index + 1) / nMax);
    const r = R * (0.28 + radialT * 0.52 * (0.7 + point.radiusNorm * 0.32));
    const size = dotSize(R, 0.005 + point.opacity * 0.006);
    const opacity = 0.2 + point.opacity * energy * 0.34;
    const spiralColor = spiralChakraColor(palette, pitchNorm, point.opacity);

    for (let w = 0; w < N; w += 1) {
      const theta = base + w * sector + thetaLocal;
      addStyledDot(group, pointOn(center, theta, r), size, spiralColor, opacity, null, R);
      count += 1;

      addStyledDot(
        group,
        pointOn(center, theta + sector * 0.13, r + R * 0.013),
        size * 0.72,
        spiralChakraColor(palette, clamp01(pitchNorm + 0.12), point.opacity),
        0.32 + point.opacity * energy * 0.38,
        null,
        R,
      );
      count += 1;

      addStyledDot(
        group,
        pointOn(center, theta - sector * 0.09, r - R * 0.007),
        size * 0.55,
        spiralChakraColor(palette, clamp01(pitchNorm - 0.1), point.opacity),
        0.26 + point.opacity * energy * 0.3,
        null,
        R,
      );
      count += 1;
    }
  });

  return count;
}

function drawRadialChain(
  group: paper.Group,
  center: paper.Point,
  theta: number,
  rInner: number,
  rOuter: number,
  refSize: number,
  color: paper.Color,
  weight: number,
  energy: number,
  R: number,
  steps: number,
): number {
  let added = 0;
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    addStyledDot(
      group,
      pointOn(center, theta, rInner + (rOuter - rInner) * t),
      refSize * 0.38,
      color,
      0.28 + weight * energy * 0.3,
      null,
      R,
    );
    added += 1;
  }
  return added;
}

function drawBindu(
  group: paper.Group,
  center: paper.Point,
  R: number,
  snapshot: FeatureSnapshot,
  palette: MandalaPalette,
  energy: number,
): void {
  const rmsBoost = clamp01(snapshot.features.rms * 6 + 0.35);
  const coreR = dotSize(R, 0.028 + rmsBoost * 0.016);
  const coreColor = binduChakraColor(palette, snapshot.features.spectralCentroid, snapshot.features.rms);

  group.addChild(new paper.Path.Circle({
    center,
    radius: coreR * 2.35,
    fillColor: paletteStroke(coreColor, 0.16 + energy * 0.1),
    strokeColor: null,
  }));

  addStyledDot(
    group,
    center,
    coreR,
    coreColor,
    0.94,
    paletteStroke(palette.line, 0.55),
    R,
  );

  const innerPetals = Math.max(4, Math.min(Math.round(snapshot.params.symmetry), 10));
  for (let i = 0; i < innerPetals; i += 1) {
    const angle = snapshot.params.pitchAngle + (Math.PI * 2 * i) / innerPetals - Math.PI / 2;
    const petalColor = ringBandColor(
      palette,
      i % 7,
      7,
      0.2,
      snapshot.features.spectralCentroid,
      i,
      innerPetals,
      0.55,
    );
    addStyledDot(
      group,
      pointOn(center, angle, coreR * 2.5),
      coreR * 0.38,
      petalColor,
      0.58 + energy * 0.3,
      null,
      R,
    );
  }
}

function drawBreathHalo(
  group: paper.Group,
  center: paper.Point,
  R: number,
  N: number,
  breathRing: number,
  palette: MandalaPalette,
  energy: number,
): void {
  const haloR = R * (1.008 + breathRing * 0.07);
  const dots = N * 2;

  for (let i = 0; i < dots; i += 1) {
    const theta = (Math.PI * 2 * i) / dots - Math.PI / 2;
    addStyledDot(
      group,
      pointOn(center, theta, haloR),
      dotSize(R, 0.0045 + breathRing * 0.0035),
      palette.muted,
      0.24 + breathRing * energy * 0.32,
      null,
      R,
    );
  }
}

function stretchLevels(levels: number[]): number[] {
  if (levels.length === 0) {
    return [0.4];
  }
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = Math.max(max - min, 0.08);

  return levels.map((v) => {
    const t = clamp01((v - min) / span);
    return 0.28 + Math.pow(t, 0.48) * 0.72;
  });
}

function spectrumBands(snapshot: FeatureSnapshot): number[] {
  if (!snapshot.spectrum?.length) {
    return new Array(SPECTRUM_EXPORT_BANDS).fill(0.32);
  }
  return normalizeBandLevels(
    Array.from(downsampleBars(new Float32Array(snapshot.spectrum), SPECTRUM_EXPORT_BANDS)),
  );
}

function addStyledDot(
  group: paper.Group,
  center: paper.Point,
  radius: number,
  fillBase: paper.Color,
  opacity: number,
  stroke: paper.Color | null,
  R: number,
): void {
  const fill = paletteStroke(fillBase, opacity);
  const r = Math.max(radius, u(R, 2.4));

  group.addChild(new paper.Path.Circle({
    center,
    radius: r,
    fillColor: fill,
    strokeColor: stroke,
    strokeWidth: stroke ? u(R, Math.max(r * 0.12, 0.45)) : 0,
  }));
}

function dotSize(R: number, fraction: number): number {
  return Math.max(R * fraction, u(R, 2.4));
}

function pointOn(center: paper.Point, angle: number, radius: number): paper.Point {
  return center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(radius));
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
