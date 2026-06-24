import type { FeatureSnapshot, GeometryParams } from '../types';

const DEFAULT_PARAMS: GeometryParams = {
  radius: 128,
  rays: 6,
  rotationSpeed: 0,
  hue: 260,
  opacity: 0.65,
  symmetry: 6,
  breathRing: 0,
  lineWidth: 1,
  waveAmplitude: 0,
  spiralTurns: 0,
  dotCount: 4,
  elementCount: 4,
  pitchAngle: 0,
};

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Экспорт не должен падать на NaN/Infinity из тишины или слепка. */
export function sanitizeGeometryParams(params: GeometryParams | undefined): GeometryParams {
  if (!params) {
    return { ...DEFAULT_PARAMS };
  }

  return {
    radius: Math.max(finite(params.radius, DEFAULT_PARAMS.radius), 48),
    rays: Math.max(Math.round(finite(params.rays, DEFAULT_PARAMS.rays)), 3),
    rotationSpeed: finite(params.rotationSpeed, 0),
    hue: finite(params.hue, DEFAULT_PARAMS.hue) % 360,
    opacity: Math.min(Math.max(finite(params.opacity, DEFAULT_PARAMS.opacity), 0.35), 1),
    symmetry: Math.max(Math.round(finite(params.symmetry, DEFAULT_PARAMS.symmetry)), 3),
    breathRing: Math.min(Math.max(finite(params.breathRing, 0), 0), 1),
    lineWidth: Math.max(finite(params.lineWidth, DEFAULT_PARAMS.lineWidth), 0.5),
    waveAmplitude: Math.max(finite(params.waveAmplitude, 0), 0),
    spiralTurns: Math.max(finite(params.spiralTurns, 0), 0),
    dotCount: Math.max(Math.round(finite(params.dotCount, DEFAULT_PARAMS.dotCount)), 3),
    elementCount: Math.max(Math.round(finite(params.elementCount, DEFAULT_PARAMS.elementCount)), 2),
    pitchAngle: finite(params.pitchAngle, 0),
  };
}

export function prepareSnapshotForExport(snapshot: FeatureSnapshot): FeatureSnapshot {
  return {
    ...snapshot,
    params: sanitizeGeometryParams(snapshot.params),
  };
}

export function isValidPngDataUrl(dataUrl: string): boolean {
  if (!dataUrl || !dataUrl.startsWith('data:image/png')) {
    return false;
  }
  const base64 = dataUrl.split(',')[1];
  return Boolean(base64 && base64.length > 32);
}

export function isValidSvgMarkup(svg: string): boolean {
  return Boolean(svg && svg.includes('<svg') && svg.length > 80);
}

export function pngBytesFromDataUrl(dataUrl: string): Uint8Array {
  if (!isValidPngDataUrl(dataUrl)) {
    throw new Error('PNG export is empty or invalid');
  }
  const base64 = dataUrl.split(',')[1]!;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.length < 32) {
    throw new Error('PNG export is empty or invalid');
  }
  return bytes;
}
