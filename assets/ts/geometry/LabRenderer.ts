import type { FeatureSnapshot, GeometryParams, GeometryStyle, PitchPoint } from '../types';

/** Общий контракт 2D (Paper) и 3D (Three.js) рендереров лаборатории. */
export interface LabRenderer {
  setStyle(style: GeometryStyle): void;
  resize(): void;
  render(params: GeometryParams, pitchTrail?: PitchPoint[], frozenRotation?: number): void;
  renderSnapshot(snapshot: FeatureSnapshot): void;
  renderComposite(snapshots: FeatureSnapshot[]): void;
  renderDual(left: GeometryParams, right: GeometryParams, overlap: number): void;
  clear(): void;
  exportSvg(): string;
  exportPng(): string;
  getCanvas(): HTMLCanvasElement;
  /** FFT-полоски для живого спектрального кольца (Three.js). */
  setSpectrum?(bars: Float32Array): void;
  /** Пересчитать цвета материалов после смены темы. */
  refreshTheme?(): void;
  dispose?(): void;
}
