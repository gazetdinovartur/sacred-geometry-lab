import paper from 'paper';
import type { LabRenderer } from './LabRenderer';
import type { AudioFeatures, FeatureSnapshot, GeometryParams, PitchPoint } from '../types';
import { downsampleBars, EQ_BAND_COUNT } from './EqLabRenderer';
import { blendGeometryParams } from './SymmetryResolver';
import { buildMandalaPalette, paletteStroke, type MandalaPalette } from './mandalaPalette';
import {
  drawFlowerScaffold,
  drawHarmonicRings,
  drawPitchMarker,
  drawRhythmStar,
  drawRmsRing,
  drawSpectrumArcs,
  drawTimbreCore,
  drawToneRays,
  drawVoiceTrace,
  downsampleTrail,
} from './voiceMandalaLayers';

const REF_RADIUS = 200;

/**
 * Экспорт: структурированная мандала.
 * Один акустический параметр → один слой (см. PROJECT.md).
 * Live-экран не трогаем — только PNG/SVG.
 */
export class MandalaRenderer implements LabRenderer {
  private style: import('../types').GeometryStyle = 'flower';
  private palette: MandalaPalette = buildMandalaPalette(260);
  private group: paper.Group | null = null;

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
    this.renderVoiceMandala(
      snapshot.params,
      snapshot.features,
      snapshot.pitchTrail ?? [],
      snapshot.spectrum,
    );
  }

  renderComposite(snapshots: FeatureSnapshot[]): void {
    if (snapshots.length === 0) {
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
    const svg = paper.project.exportSVG({ asString: true, bounds: 'content' }) as string;
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

  private layoutCenter(): paper.Point {
    const { width, height } = paper.view.viewSize;
    return new paper.Point(width / 2, height / 2);
  }

  private scaleFactor(): number {
    const half = Math.min(paper.view.viewSize.width, paper.view.viewSize.height) / 2;
    return (half * 0.96) / REF_RADIUS;
  }

  private scaledRadius(params: GeometryParams): number {
    return params.radius * this.scaleFactor();
  }

  private renderVoiceMandala(
    params: GeometryParams,
    features: AudioFeatures,
    pitchTrail: PitchPoint[] = [],
    spectrum?: number[],
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

    drawHarmonicRings(this.group, center, R, params, stroke);

    if (spectrum?.length) {
      const bands = Array.from(downsampleBars(new Float32Array(spectrum), EQ_BAND_COUNT));
      drawSpectrumArcs(this.group, center, R, bands, energy, stroke);
    }

    drawToneRays(this.group, center, R, params, stroke);
    drawRhythmStar(this.group, center, R, params, stroke);
    drawTimbreCore(this.group, center, R, params, stroke);

    if (this.style === 'flower' || this.style === 'seed') {
      drawFlowerScaffold(this.group, center, R, params, stroke);
    }

    drawVoiceTrace(this.group, center, R, pitchTrail, params, this.palette);
    drawRmsRing(this.group, center, R, params, stroke);
    drawPitchMarker(this.group, center, R, features, params, stroke);

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
