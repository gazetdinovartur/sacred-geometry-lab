import type { LabRenderer } from './LabRenderer';
import type { FeatureSnapshot, GeometryParams, GeometryStyle, PitchPoint } from '../types';
import { readEqTheme } from './eqTheme';

/** Восемь зон спектра — не «лес палок», а структура диапазонов. */
export const EQ_BAND_COUNT = 8;

const BAND_LABELS = ['суб', 'низ', 'н-ср', 'серед', 'в-ср', 'верх', 'ярк', 'возд'];
const LERP = 0.28;
const BAND_DEPTH = 0.54;

function defaultParams(): GeometryParams {
  return {
    radius: 128,
    rays: 6,
    rotationSpeed: 0,
    hue: 210,
    opacity: 0,
    symmetry: 6,
    breathRing: 0,
    lineWidth: 0.75,
    waveAmplitude: 0,
    spiralTurns: 0,
    dotCount: 0,
    elementCount: 7,
    pitchAngle: 0,
  };
}

/** Живой вид: круг, 8 зон спектра, уровень и тон в центре. */
export class EqLabRenderer implements LabRenderer {
  private readonly spectrumTarget = new Float32Array(EQ_BAND_COUNT);
  private readonly spectrumDisplay = new Float32Array(EQ_BAND_COUNT);
  private displayParams = defaultParams();
  private frequencyHz = 0;
  private rmsNorm = 0;
  private live = false;
  private spectrumGain = 1;
  private calibrating = false;
  private calibrationProgress = 0;
  private calibrationPrompt = '';
  private rafId = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.startLoop();
  }

  setStyle(_style: GeometryStyle): void {}

  setSpectrum(bars: Float32Array): void {
    const bands = downsampleBars(bars, EQ_BAND_COUNT);
    for (let i = 0; i < EQ_BAND_COUNT; i += 1) {
      this.spectrumTarget[i] = Math.min((bands[i] ?? 0) * 1.35, 1);
    }
  }

  setLiveMetrics(frequencyHz: number, rmsNorm: number, live: boolean): void {
    if (live) {
      if (frequencyHz > 0) {
        this.frequencyHz = frequencyHz;
      }
      if (rmsNorm > 0) {
        this.rmsNorm = this.rmsNorm > 0
          ? this.rmsNorm * 0.42 + rmsNorm * 0.58
          : rmsNorm;
      } else if (this.rmsNorm > 0.04) {
        this.rmsNorm *= 0.88;
      } else {
        this.rmsNorm *= 0.82;
      }
    } else {
      this.frequencyHz = frequencyHz;
      this.rmsNorm = rmsNorm;
    }
    this.live = live;
  }

  setSpectrumGain(gain: number): void {
    this.spectrumGain = Math.max(gain, 0.1);
  }

  setCalibrationState(active: boolean, progress: number, prompt: string): void {
    this.calibrating = active;
    this.calibrationProgress = Math.min(Math.max(progress, 0), 1);
    this.calibrationPrompt = prompt;
  }

  resize(): void {
    const wrap = this.canvas.parentElement;
    if (!wrap) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = Math.max(Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)), 280);

    this.canvas.width = Math.floor(size * dpr);
    this.canvas.height = Math.floor(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  render(params: GeometryParams, _pitchTrail: PitchPoint[] = [], _frozenRotation?: number): void {
    this.displayParams = params;
  }

  renderSnapshot(snapshot: FeatureSnapshot): void {
    this.displayParams = snapshot.params;
    this.applyStoredSpectrum(snapshot.spectrum);
    this.frequencyHz = snapshot.features.frequency;
    this.rmsNorm = snapshot.levelNorm ?? 0;
    this.live = false;
  }

  renderComposite(snapshots: FeatureSnapshot[]): void {
    if (snapshots.length === 0) {
      return;
    }
    const last = snapshots[snapshots.length - 1];
    this.render(last.params, snapshots.flatMap((s) => s.pitchTrail ?? []));

    const avg = new Float32Array(EQ_BAND_COUNT);
    let count = 0;
    snapshots.forEach((snap) => {
      if (!snap.spectrum?.length) {
        return;
      }
      const bands = downsampleStored(snap.spectrum, EQ_BAND_COUNT);
      count += 1;
      for (let i = 0; i < EQ_BAND_COUNT; i += 1) {
        avg[i] += bands[i] ?? 0;
      }
    });
    if (count > 0) {
      for (let i = 0; i < EQ_BAND_COUNT; i += 1) {
        avg[i] /= count;
      }
      this.applyStoredSpectrum(Array.from(avg));
    }
  }

  renderDual(_left: GeometryParams, _right: GeometryParams, _overlap: number): void {}

  clear(): void {
    this.displayParams = defaultParams();
    this.spectrumTarget.fill(0);
    this.spectrumDisplay.fill(0);
    this.frequencyHz = 0;
    this.rmsNorm = 0;
    this.live = false;
    this.spectrumGain = 1;
    this.calibrating = false;
    this.calibrationProgress = 0;
    this.calibrationPrompt = '';
    this.drawFrame();
  }

  exportSvg(): string {
    const png = this.exportPng();
    const size = this.canvas.width / Math.min(window.devicePixelRatio, 2);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
      `<image href="${png}" width="${size}" height="${size}"/>`,
      '</svg>',
    ].join('');
  }

  exportPng(): string {
    this.drawFrame();
    return this.canvas.toDataURL('image/png');
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  refreshTheme(): void {
    this.drawFrame();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
  }

  private applyStoredSpectrum(spectrum?: number[]): void {
    if (!spectrum?.length) {
      return;
    }
    const bands = downsampleStored(spectrum, EQ_BAND_COUNT);
    for (let i = 0; i < EQ_BAND_COUNT; i += 1) {
      const v = bands[i] ?? 0;
      this.spectrumTarget[i] = v;
      this.spectrumDisplay[i] = v;
    }
  }

  private startLoop(): void {
    const tick = (): void => {
      for (let i = 0; i < EQ_BAND_COUNT; i += 1) {
        this.spectrumDisplay[i] += (this.spectrumTarget[i] - this.spectrumDisplay[i]) * LERP;
      }
      this.drawFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private drawFrame(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = this.canvas.width / dpr;
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.46;
    const theme = readEqTheme();

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 2, 0, Math.PI * 2);
    ctx.clip();

    this.drawGuideRings(ctx, cx, cy, R, theme);
    this.drawBandRing(ctx, cx, cy, R, theme);
    this.drawLevelRing(ctx, cx, cy, R * 0.34, theme);
    if (this.calibrating) {
      this.drawCalibrationRing(ctx, cx, cy, R, theme);
    } else {
      this.drawPitchMarker(ctx, cx, cy, R, theme);
    }
    this.drawCenterReadout(ctx, cx, cy, theme);

    ctx.restore();

    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawGuideRings(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    R: number,
    theme: ReturnType<typeof readEqTheme>,
  ): void {
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    [0.52, 0.88].forEach((k) => {
      ctx.beginPath();
      ctx.arc(cx, cy, R * k, 0, Math.PI * 2);
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  private drawBandRing(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    R: number,
    theme: ReturnType<typeof readEqTheme>,
  ): void {
    const inner = R * 0.52;
    const span = (Math.PI * 2) / EQ_BAND_COUNT;
    const gap = span * 0.1;
    const energy = Math.min(Math.max(this.live ? this.rmsNorm : this.displayParams.opacity, 0), 1);
    const peak = this.spectrumPeak();

    for (let i = 0; i < EQ_BAND_COUNT; i += 1) {
      const display = this.bandDisplayLevel(i, peak, energy);
      const idle = this.live ? 0.05 : 0.04;
      const amp = idle + display * 1.12;
      const depth = amp * R * BAND_DEPTH;
      const a0 = -Math.PI / 2 + i * span + gap / 2;
      const a1 = a0 + span - gap;

      ctx.fillStyle = bandFill(theme.accent, i, amp);
      fillArcBand(ctx, cx, cy, inner, inner + depth, a0, a1);
    }
  }

  /** Сегменты: относительный спектр + связь с «Уровень», без двойного гашения. */
  private spectrumPeak(): number {
    let peak = 0.0001;
    for (let i = 0; i < EQ_BAND_COUNT; i += 1) {
      peak = Math.max(peak, this.spectrumDisplay[i]);
    }
    return peak;
  }

  private bandDisplayLevel(index: number, peak: number, energy: number): number {
    const v = this.spectrumDisplay[index];
    const relative = v / peak;
    const absolute = Math.min(v * 4.2, 1);
    const mix = relative * 0.62 + absolute * 0.38;
    const shaped = Math.pow(Math.min(Math.max(mix, 0), 1), 0.5);
    const envelope = 0.32 + energy * 0.68;
    return Math.min(shaped * envelope * this.spectrumGain * 1.35, 1);
  }

  private drawLevelRing(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    theme: ReturnType<typeof readEqTheme>,
  ): void {
    const level = Math.min(Math.max(this.live ? this.rmsNorm : this.displayParams.opacity, 0), 1);

    ctx.strokeStyle = theme.accentSoft;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (level <= 0.01) {
      return;
    }

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * level);
    ctx.stroke();
  }

  private drawCalibrationRing(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    R: number,
    theme: ReturnType<typeof readEqTheme>,
  ): void {
    const pulse = 0.35 + this.rmsNorm * 0.65;

    ctx.strokeStyle = theme.accentSoft;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.98, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.calibrationProgress);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (this.rmsNorm > 0.06) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.12 + pulse * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawPitchMarker(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    R: number,
    theme: ReturnType<typeof readEqTheme>,
  ): void {
    if (this.frequencyHz <= 0) {
      return;
    }

    const minHz = 80;
    const maxHz = 2400;
    const t = (Math.log(this.frequencyHz) - Math.log(minHz))
      / (Math.log(maxHz) - Math.log(minHz));
    const angle = -Math.PI / 2 + Math.min(Math.max(t, 0), 1) * Math.PI * 2;
    const pr = R * 0.93;
    const px = cx + Math.cos(angle) * pr;
    const py = cy + Math.sin(angle) * pr;

    ctx.fillStyle = theme.text;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * R * 0.5, cy + Math.sin(angle) * R * 0.5);
    ctx.lineTo(px, py);
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawCenterReadout(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    theme: ReturnType<typeof readEqTheme>,
  ): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.calibrating) {
      const pct = Math.round(this.calibrationProgress * 100);
      ctx.fillStyle = theme.textMuted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('калибровка', cx, cy - 10);

      ctx.fillStyle = theme.accent;
      ctx.font = '600 28px system-ui, sans-serif';
      ctx.fillText(`${pct}%`, cx, cy + 12);

      if (this.rmsNorm > 0.05) {
        ctx.fillStyle = theme.accent;
        ctx.font = '10px system-ui, sans-serif';
        ctx.globalAlpha = 0.75;
        ctx.fillText('●', cx, cy + 32);
        ctx.globalAlpha = 1;
      }
      return;
    }

    const level = Math.min(Math.max(this.live ? this.rmsNorm : this.displayParams.opacity, 0), 1);
    ctx.fillStyle = theme.text;
    ctx.font = '600 22px system-ui, sans-serif';
    const hz = this.frequencyHz > 0 ? `${Math.round(this.frequencyHz)} Hz` : '— Hz';
    ctx.fillText(hz, cx, cy - 8);

    ctx.fillStyle = theme.textMuted;
    ctx.font = '12px system-ui, sans-serif';
    const pct = Math.round(level * 100);
    ctx.fillText(`${pct}% · Уровень`, cx, cy + 14);
  }
}

export function downsampleBars(bars: Float32Array, bands: number): Float32Array {
  const out = new Float32Array(bands);
  if (bars.length === 0) {
    return out;
  }
  for (let i = 0; i < bands; i += 1) {
    const start = Math.floor((i / bands) * bars.length);
    const end = Math.floor(((i + 1) / bands) * bars.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += bars[j] ?? 0;
      count += 1;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function downsampleStored(values: number[], bands: number): number[] {
  return Array.from(downsampleBars(new Float32Array(values), bands));
}

function fillArcBand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
  ctx.fill();
}

function bandFill(accentCss: string, index: number, amp: number): string {
  const base = parseAccent(accentCss);
  const hue = (base.h + index * 14) % 360;
  const light = base.l + amp * 12;
  const alpha = 0.42 + amp * 0.48;
  return `hsla(${hue}, ${base.s}%, ${Math.min(light, 78)}%, ${alpha})`;
}

function parseAccent(css: string): { h: number; s: number; l: number } {
  if (css.startsWith('#') && css.length >= 7) {
    const r = parseInt(css.slice(1, 3), 16) / 255;
    const g = parseInt(css.slice(3, 5), 16) / 255;
    const b = parseInt(css.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2 * 100;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 50 ? d / (2 - max - min) : d / (max + min);
      s *= 100;
      if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      } else if (max === g) {
        h = ((b - r) / d + 2) * 60;
      } else {
        h = ((r - g) / d + 4) * 60;
      }
    }
    return { h, s, l };
  }
  return { h: 265, s: 42, l: 62 };
}

export { BAND_LABELS };
