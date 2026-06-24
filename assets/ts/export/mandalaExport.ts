import { MandalaRenderer } from '../geometry/MandalaRenderer';
import { boostParamsForExport } from '../geometry/exportParams';
import { cymaticModeFromFeatures, dotMandalaReportLines, resolveDotMandalaScaffold } from '../geometry/dotMandalaMath';
import { DEFAULT_EXPORT_SIZE, resolveRenderStyle, type ExportSize, type ExportStyle } from './exportOptions';
import type { FeatureSnapshot, GeometryStyle } from '../types';
import type { VoiceProfileMetrics } from '../audio/VoiceProfile';
import { isValidSvgMarkup, prepareSnapshotForExport } from './exportValidation';

let exportCanvas: HTMLCanvasElement | null = null;
let exportRenderer: MandalaRenderer | null = null;
let exportRenderSize = DEFAULT_EXPORT_SIZE;

function resetExportSurface(): void {
  exportRenderer = null;
  exportCanvas = null;
}

function ensureRenderer(size: ExportSize): MandalaRenderer {
  if (exportRenderSize !== size || !exportCanvas || !exportRenderer) {
    exportRenderSize = size;
    resetExportSurface();
    exportCanvas = document.createElement('canvas');
  }

  exportCanvas.width = size;
  exportCanvas.height = size;

  if (!exportRenderer) {
    exportRenderer = new MandalaRenderer(exportCanvas);
  }

  exportRenderer.resizeTo(size);
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
  style: ExportStyle | GeometryStyle,
  size: ExportSize = DEFAULT_EXPORT_SIZE,
): MandalaRenderer {
  const renderStyle = style === 'dots' || style === 'layers'
    ? resolveRenderStyle(style)
    : style;

  const renderOnce = (): MandalaRenderer => {
    const renderer = ensureRenderer(size);
    renderer.setStyle(renderStyle);
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

export function exportMandalaSvg(
  snapshot: FeatureSnapshot,
  style: ExportStyle | GeometryStyle,
  size: ExportSize = DEFAULT_EXPORT_SIZE,
): string {
  const svg = renderMandalaSnapshot(snapshot, style, size).exportSvg();
  if (!isValidSvgMarkup(svg)) {
    throw new Error('SVG export is empty');
  }
  return svg;
}

export function exportMandalaPng(
  snapshot: FeatureSnapshot,
  style: ExportStyle | GeometryStyle,
  size: ExportSize = DEFAULT_EXPORT_SIZE,
): string {
  const renderer = renderMandalaSnapshot(snapshot, style, size);
  return renderer.exportPng();
}

export function sessionReportText(
  snapshots: FeatureSnapshot[],
  profile?: VoiceProfileMetrics,
  style: ExportStyle | GeometryStyle = 'dots',
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

  if (style === 'dots' && snapshots.length > 0) {
    const composite = snapshots[snapshots.length - 1];
    const scaffold = resolveDotMandalaScaffold({
      ...composite,
      processSnapshots: composite.processSnapshots ?? snapshots,
    });
    lines.push(
      ...dotMandalaReportLines({
        mode: scaffold.mode,
        symmetry: scaffold.symmetry,
        ringCount: scaffold.ringCount,
        dotCount: 0,
        spiralPoints: composite.pitchTrail?.length ?? 0,
        cymaticMode: cymaticModeFromFeatures(composite.features),
        ringSpacing: scaffold.ringSpacing,
        frequencyHz: composite.features.frequency,
        voiceMs: composite.voiceMs ?? snapshots.reduce((sum, s) => sum + (s.voiceMs ?? 0), 0),
      }),
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
