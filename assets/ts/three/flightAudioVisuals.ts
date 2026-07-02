import * as THREE from 'three';
import type { FeatureSnapshot } from '../types';

export type FlightExportPalette = {
  line: THREE.Color;
  halo: THREE.Color;
  voice: THREE.Color;
  core: THREE.Color;
  breath: THREE.Color;
  petal: THREE.Color;
  low: THREE.Color;
  mid: THREE.Color;
  high: THREE.Color;
};

export type FlightAudioVisuals = {
  energy: number;
  rms: number;
  breath: number;
  wave: number;
  flux: number;
  pitch: number;
  centroid: number;
  level: number;
  hue: number;
  active: number;
  onset: number;
  palette: FlightExportPalette;
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function hueColor(hueDeg: number, sat: number, light: number): THREE.Color {
  return new THREE.Color().setHSL(((hueDeg % 360) + 360) % 360 / 360, sat, light);
}

/** Насыщенная палитра 3D-экспорта — не зависит от светлой темы UI. */
export function flightExportPalette(hue: number): FlightExportPalette {
  const h = hue % 360;
  return {
    line: hueColor(h, 0.45, 0.88),
    halo: hueColor(h + 18, 0.68, 0.62),
    voice: hueColor(h, 0.82, 0.58),
    core: hueColor(h + 42, 0.88, 0.52),
    breath: hueColor(h - 28, 0.62, 0.5),
    petal: hueColor(h + 72, 0.76, 0.55),
    low: hueColor(h - 40, 0.78, 0.48),
    mid: hueColor(h + 8, 0.84, 0.56),
    high: hueColor(h + 55, 0.8, 0.6),
  };
}

/** Цвет EQ-зубца по положению на кольце и уровню полосы. */
export function flightBandColor(
  palette: FlightExportPalette,
  bandIndex: number,
  bandCount: number,
  level: number,
  hue: number,
): THREE.Color {
  const t = bandIndex / Math.max(bandCount - 1, 1);
  const base = palette.low.clone().lerp(palette.mid, t * 1.4).lerp(palette.high, Math.max(0, t * 1.6 - 0.35));
  const pitchTint = hueColor(hue + t * 48 - 24, 0.75, 0.52 + level * 0.18);
  return base.lerp(pitchTint, 0.35 + level * 0.4);
}

/** Живые параметры кадра из записанного звука и геометрии сессии. */
export function deriveFlightAudioVisuals(snapshot: FeatureSnapshot): FlightAudioVisuals {
  const f = snapshot.features;
  const p = snapshot.params;
  const rms = clamp01(f.rms);
  const breath = clamp01(p.breathRing);
  const wave = clamp01(p.waveAmplitude);
  const flux = clamp01(f.spectralFlux * 5.5);
  const pitch = clamp01((f.frequency - 70) / 420);
  const centroid = clamp01(f.spectralCentroid / 3800);
  const level = clamp01(snapshot.levelNorm ?? Math.max(f.spectralLevel, rms));
  const energy = clamp01(Math.max(p.opacity, level * 0.85, rms * 0.7));
  const palette = flightExportPalette(p.hue);

  return {
    energy,
    rms,
    breath,
    wave,
    flux,
    pitch,
    centroid,
    level,
    hue: p.hue,
    active: f.isActive ? 1 : clamp01(level * 0.35),
    onset: clamp01(f.recentOnsets / 7),
    palette,
  };
}

export function gateProximity(cameraZ: number, gateZ: number): number {
  const dist = cameraZ - gateZ;
  return clamp01(1 - dist / (210 * 1.35));
}
