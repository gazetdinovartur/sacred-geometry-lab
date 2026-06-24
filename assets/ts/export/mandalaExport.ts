import { MandalaRenderer } from '../geometry/MandalaRenderer';
import { applySessionVariety } from '../geometry/sessionVariety';
import { boostParamsForExport } from '../geometry/exportParams';
import type { FeatureSnapshot, GeometryStyle } from '../types';
import type { VoiceProfileMetrics } from '../audio/VoiceProfile';
import { isValidSvgMarkup, prepareSnapshotForExport } from './exportValidation';

const EXPORT_SIZE = 960;

let exportCanvas: HTMLCanvasElement | null = null;
let exportRenderer: MandalaRenderer | null = null;

function resetExportSurface(): void {
  exportRenderer = null;
  exportCanvas = null;
}

function ensureRenderer(): MandalaRenderer {
  if (!exportCanvas) {
    exportCanvas = document.createElement('canvas');
  }

  exportCanvas.width = EXPORT_SIZE;
  exportCanvas.height = EXPORT_SIZE;

  if (!exportRenderer) {
    exportRenderer = new MandalaRenderer(exportCanvas);
  }

  exportRenderer.resizeTo(EXPORT_SIZE);
  return exportRenderer;
}

function preparedSnapshot(snapshot: FeatureSnapshot): FeatureSnapshot {
  let snap = prepareSnapshotForExport({
    ...snapshot,
    params: boostParamsForExport(snapshot.params),
  });

  if (snap.sessionStarted && snap.profileHash) {
    snap = {
      ...snap,
      params: applySessionVariety(snap.params, snap.profileHash, snap.sessionStarted),
    };
  }

  return snap;
}

export function renderMandalaSnapshot(
  snapshot: FeatureSnapshot,
  style: GeometryStyle,
): MandalaRenderer {
  const renderOnce = (): MandalaRenderer => {
    const renderer = ensureRenderer();
    renderer.setStyle(style);
    renderer.renderSnapshot(preparedSnapshot(snapshot));
    return renderer;
  };

  try {
    return renderOnce();
  } catch {
    resetExportSurface();
    return renderOnce();
  }
}

export function exportMandalaSvg(snapshot: FeatureSnapshot, style: GeometryStyle): string {
  const svg = renderMandalaSnapshot(snapshot, style).exportSvg();
  if (!isValidSvgMarkup(svg)) {
    throw new Error('SVG export is empty');
  }
  return svg;
}

export function exportMandalaPng(snapshot: FeatureSnapshot, style: GeometryStyle): string {
  const renderer = renderMandalaSnapshot(snapshot, style);
  return renderer.exportPng();
}

export function sessionReportText(
  snapshots: FeatureSnapshot[],
  profile?: VoiceProfileMetrics,
): string {
  const lines = [
    'Sacred Geometry Lab — отчёт сессии',
    `Слепков: ${snapshots.length}`,
  ];

  if (profile) {
    lines.push(
      '',
      'Профиль голоса',
      `  hash ${profile.hash}`,
      `  f₀ ${Math.round(profile.f0Min)}–${Math.round(profile.f0Max)} Hz`,
      `  RMS ${profile.rmsMin.toFixed(3)}–${profile.rmsMax.toFixed(3)}`,
      `  centroid ${Math.round(profile.centroidMin)}–${Math.round(profile.centroidMax)} Hz`,
      profile.calibratedAt
        ? `  калибровка ${new Date(profile.calibratedAt).toISOString().slice(0, 10)}`
        : '  калибровка —',
    );
  }

  lines.push('');

  snapshots.forEach((snap, i) => {
    const f = snap.features;
    lines.push(
      `${i + 1}. ${snap.label}`,
      `   RMS ${(f.rms * 100).toFixed(1)}% · f₀ ${f.frequency > 0 ? `${Math.round(f.frequency)} Hz` : '—'}`,
      `   симметрия ${snap.params.symmetry} · центроид ${Math.round(f.spectralCentroid)} Hz`,
      snap.voiceMs ? `   голос ~${Math.round(snap.voiceMs / 1000)} с` : '',
      '',
    );
  });

  return lines.join('\n');
}
