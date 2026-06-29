import paper from 'paper';
import type { LabRenderer } from './LabRenderer';
import type { AudioFeatures, FeatureSnapshot, GeometryParams, PitchPoint } from '../types';
import { downsampleBars, SPECTRUM_EXPORT_BANDS } from './EqLabRenderer';
import { blendGeometryParams } from './SymmetryResolver';
import { buildMandalaPalette, paletteStroke, type MandalaPalette } from './mandalaPalette';
import {
  drawFlowerScaffold,
  drawHarmonicRings,
  drawPitchMarker,
  drawProcessOrbit,
  drawProcessSpectrumLayers,
  drawRhythmStar,
  drawRmsRing,
  drawSpectrumRingMarkers,
  drawTimbreCore,
  drawToneRays,
  drawVoiceTrace,
  downsampleTrail,
} from './voiceMandalaLayers';
import { drawDotMandala } from './dotMandalaLayers';

const REF_RADIUS = 200;
/** Доля холста под радиус R — небольшие поля по краям. */
const EXPORT_RADIUS_FILL = 0.995;

/**
 * Экспорт: структурированная мандала.
 * Один акустический параметр → один слой (см. PROJECT.md).
 * Live-экран не трогаем — только PNG/SVG.
 */
export class MandalaRenderer implements LabRenderer {
  private style: import('../types').GeometryStyle = 'dots';
  private palette: MandalaPalette = buildMandalaPalette(260);
  private group: paper.Group | null = null;
  private lastDotStats: import('./dotMandalaMath').DotMandalaStats | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    paper.setup(canvas);
  }

  setStyle(style: import('../types').GeometryStyle): void {
    this.style = style;
  }

  resize(): void {
    const wrap = this.canvas.parentElement;
    if (wrap) {
      const parentSize = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
      if (parentSize > 0) {
        this.resizeTo(parentSize);
        return;
      }
    }

    const fromCanvas = Math.floor(Math.min(this.canvas.width, this.canvas.height));
    if (fromCanvas > 0) {
      this.resizeTo(fromCanvas);
      return;
    }

    this.resizeTo(REF_RADIUS * 2);
  }

  resizeTo(size: number): void {
    const px = Math.max(1, Math.floor(size));
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    paper.view.viewSize = new paper.Size(px, px);
    paper.view.center = new paper.Point(px / 2, px / 2);
    paper.view.zoom = 1;
    paper.view.rotation = 0;
  }

  flushToCanvas(): void {
    paper.view.update();
  }

  render(params: GeometryParams, pitchTrail: PitchPoint[] = []): void {
    this.renderVoiceMandala(params, defaultFeatures(params), pitchTrail);
  }

  renderSnapshot(snapshot: FeatureSnapshot): void {
    if (this.style === 'dots') {
      this.renderDotMandalaSnapshot(snapshot);
      return;
    }

    this.renderVoiceMandala(
      snapshot.params,
      snapshot.features,
      snapshot.pitchTrail ?? [],
      snapshot.spectrum,
      snapshot.processSnapshots,
    );
  }

  renderComposite(snapshots: FeatureSnapshot[]): void {
    if (snapshots.length === 0) {
      return;
    }

    if (this.style === 'dots') {
      const composite: FeatureSnapshot = {
        ...snapshots[snapshots.length - 1],
        label: 'Итог',
        pitchTrail: downsampleTrail(
          snapshots.flatMap((s) => s.pitchTrail ?? []),
          120,
        ),
        spectrum: averageSpectrum(snapshots),
        processSnapshots: [...snapshots],
        sessionStarted: snapshots[0]?.sessionStarted,
        profileHash: snapshots[0]?.profileHash,
        voiceMs: snapshots.reduce((sum, s) => sum + (s.voiceMs ?? 0), 0),
      };
      this.renderDotMandalaSnapshot(composite);
      return;
    }

    const params = blendGeometryParams(snapshots);
    const mergedTrail = downsampleTrail(
      snapshots.flatMap((s) => s.pitchTrail ?? []),
      120,
    );
    this.renderVoiceMandala(
      params,
      snapshots[snapshots.length - 1].features,
      mergedTrail,
      averageSpectrum(snapshots),
      snapshots,
    );
  }

  renderDual(leftParams: GeometryParams, _right: GeometryParams, _overlap: number): void {
    this.renderVoiceMandala(leftParams, defaultFeatures(leftParams));
  }

  clear(): void {
    paper.project.clear();
    this.group = null;
    paper.view.update();
  }

  exportSvg(): string {
    this.flushToCanvas();
    const svg = paper.project.exportSVG({
      asString: true,
      bounds: paper.view.bounds,
    }) as string;
    if (!svg || svg.length < 64) {
      throw new Error('SVG export is empty');
    }
    return svg;
  }

  exportPng(): string {
    this.flushToCanvas();
    if (this.canvas.width < 1 || this.canvas.height < 1) {
      throw new Error('Export canvas has zero size');
    }
    const dataUrl = this.canvas.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png') || dataUrl.endsWith('base64,')) {
      throw new Error('PNG export is empty');
    }
    return dataUrl;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getDotMandalaStats(): import('./dotMandalaMath').DotMandalaStats | null {
    return this.lastDotStats;
  }

  private renderDotMandalaSnapshot(snapshot: FeatureSnapshot): void {
    paper.project.clear();
    const center = this.layoutCenter();
    this.palette = buildMandalaPalette(snapshot.params.hue);
    this.group = new paper.Group();

    const backdrop = new paper.Path.Rectangle(paper.view.bounds);
    backdrop.fillColor = this.palette.bg;
    paper.project.activeLayer.addChild(backdrop);

    const R = this.scaledRadius(snapshot.params);
    const result = drawDotMandala(this.group, center, R, snapshot, this.palette);
    this.lastDotStats = result.stats;

    paper.project.activeLayer.addChild(this.group);
    paper.view.update();
    this.flushToCanvas();
  }

  private layoutCenter(): paper.Point {
    const { width, height } = paper.view.viewSize;
    return new paper.Point(width / 2, height / 2);
  }

  /** Экспорт: R фиксирован — на всю картинку, без зависимости от громкости. */
  private scaledRadius(_params: GeometryParams): number {
    const half = Math.min(paper.view.viewSize.width, paper.view.viewSize.height) / 2;
    return half * EXPORT_RADIUS_FILL;
  }

  private renderVoiceMandala(
    params: GeometryParams,
    features: AudioFeatures,
    pitchTrail: PitchPoint[] = [],
    spectrum?: number[],
    processSnapshots?: FeatureSnapshot[],
  ): void {
    paper.project.clear();
    const center = this.layoutCenter();
    this.palette = buildMandalaPalette(params.hue);
    const stroke = (op: number) => paletteStroke(this.palette.primary, op);

    const backdrop = new paper.Path.Rectangle(paper.view.bounds);
    backdrop.fillColor = this.palette.bg;
    paper.project.activeLayer.addChild(backdrop);

    this.group = new paper.Group();
    const R = this.scaledRadius(params);
    const energy = Math.min(Math.max(params.opacity, 0.3), 1);

    drawHarmonicRings(this.group, center, R, params, features, this.palette);

    if (processSnapshots?.length) {
      drawProcessSpectrumLayers(this.group, center, R, processSnapshots, params, this.palette);
    } else if (spectrum?.length) {
      const bands = Array.from(downsampleBars(new Float32Array(spectrum), SPECTRUM_EXPORT_BANDS));
      drawSpectrumRingMarkers(this.group, center, R, bands, energy, params, stroke);
    }

    drawToneRays(this.group, center, R, params, features, this.palette);
    drawRhythmStar(this.group, center, R, params, features, this.palette, spectrum);
    drawTimbreCore(this.group, center, R, params, features, this.palette);

    if (this.style === 'flower' || this.style === 'seed') {
      drawFlowerScaffold(this.group, center, R, params, stroke);
    }

    drawVoiceTrace(this.group, center, R, pitchTrail, params, this.palette);
    if (processSnapshots?.length && processSnapshots.length >= 2) {
      drawProcessOrbit(this.group, center, R, processSnapshots, params, this.palette);
    }
    drawRmsRing(this.group, center, R, params, stroke);
    drawPitchMarker(this.group, center, R, features, params, this.palette);

    if (params.breathRing > 0.05) {
      this.group.addChild(new paper.Path.Circle({
        center,
        radius: R * (1.04 + params.breathRing * 0.12),
        strokeColor: stroke(0.28 + params.breathRing * 0.22),
        strokeWidth: 0.78,
        dashArray: [3, 7],
        fillColor: null,
      }));
    }

    paper.project.activeLayer.addChild(this.group);
    paper.view.update();
    this.flushToCanvas();
  }
}

function defaultFeatures(params: GeometryParams): AudioFeatures {
  return {
    rms: params.opacity,
    frequency: 0,
    pitchConfidence: 0,
    spectralLevel: params.opacity * 0.4,
    isActive: params.opacity > 0.05,
    spectralCentroid: params.hue * 8,
    spectralFlux: params.rotationSpeed * 40,
    harmonicCount: params.elementCount,
    silenceRatio: params.breathRing,
    pauseMs: 0,
    recentOnsets: params.symmetry,
    rhythmSymmetry: params.symmetry,
  };
}

function averageSpectrum(snapshots: FeatureSnapshot[]): number[] | undefined {
  const withSpectrum = snapshots.filter((s) => s.spectrum?.length);
  if (withSpectrum.length === 0) {
    return undefined;
  }

  const len = withSpectrum[0].spectrum!.length;
  const avg = new Array(len).fill(0);
  withSpectrum.forEach((snap) => {
    snap.spectrum!.forEach((v, i) => {
      avg[i] += v;
    });
  });
  return avg.map((v) => v / withSpectrum.length);
}
