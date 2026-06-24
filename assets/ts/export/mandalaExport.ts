import { MandalaRenderer } from '../geometry/MandalaRenderer';
import { boostParamsForExport } from '../geometry/exportParams';
import type { FeatureSnapshot, GeometryStyle } from '../types';
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
  return prepareSnapshotForExport({
    ...snapshot,
    params: boostParamsForExport(snapshot.params),
  });
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

export function sessionReportText(snapshots: FeatureSnapshot[]): string {
  const lines = [
    'Sacred Geometry Lab — отчёт сессии',
    `Слепков: ${snapshots.length}`,
    '',
  ];

  snapshots.forEach((snap, i) => {
    const f = snap.features;
    lines.push(
      `${i + 1}. ${snap.label}`,
      `   RMS ${(f.rms * 100).toFixed(1)}% · f₀ ${f.frequency > 0 ? `${Math.round(f.frequency)} Hz` : '—'}`,
      `   симметрия ${snap.params.symmetry} · центроид ${Math.round(f.spectralCentroid)} Hz`,
      '',
    );
  });

  return lines.join('\n');
}
