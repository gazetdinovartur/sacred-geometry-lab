import type { AudioFeatures } from '../types';
import { symmetryFromRhythm } from '../geometry/SymmetryResolver';

const SILENCE_THRESHOLD = 0.015;
const ONSET_WINDOW_MS = 4000;
const ONSET_RMS_FACTOR = 1.35;

export class FeatureExtractor {
  private timeData: Float32Array;
  private freqData: Uint8Array;
  private lastRms = 0;
  private smoothedF0 = 0;
  private silenceSince = 0;
  private lastFrame = performance.now();
  private onsetTimestamps: number[] = [];
  private prevFreqData: Uint8Array;

  constructor(private readonly analyser: AnalyserNode) {
    this.timeData = new Float32Array(analyser.fftSize);
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.prevFreqData = new Uint8Array(analyser.frequencyBinCount);
  }

  extract(): AudioFeatures {
    this.analyser.getFloatTimeDomainData(this.timeData as Float32Array<ArrayBuffer>);
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);

    const now = performance.now();
    const delta = now - this.lastFrame;
    this.lastFrame = now;

    const rms = this.computeRms(this.timeData);
    const rawFrequency = rms > SILENCE_THRESHOLD
      ? this.estimatePitch(this.timeData, this.analyser.context.sampleRate)
      : 0;

    let frequency = 0;
    if (rawFrequency > 0) {
      this.smoothedF0 = this.smoothedF0 <= 0
        ? rawFrequency
        : this.smoothedF0 * 0.82 + rawFrequency * 0.18;
      frequency = this.smoothedF0;
    } else if (rms <= SILENCE_THRESHOLD) {
      this.smoothedF0 = 0;
    }
    const spectralCentroid = this.computeSpectralCentroid(this.freqData, this.analyser.context.sampleRate);
    const spectralFlux = this.computeSpectralFlux(this.freqData);
    const harmonicCount = this.countHarmonics(this.freqData);
    const isSilent = rms < SILENCE_THRESHOLD;

    if (isSilent) {
      this.silenceSince += delta;
    } else {
      this.silenceSince = 0;
    }

    if (this.lastRms > SILENCE_THRESHOLD && rms > this.lastRms * ONSET_RMS_FACTOR) {
      this.onsetTimestamps.push(now);
    }

    this.onsetTimestamps = this.onsetTimestamps.filter((t) => now - t < ONSET_WINDOW_MS);
    this.lastRms = rms;

    const silenceRatio = isSilent ? Math.min(this.silenceSince / 3000, 1) : 0;
    const recentOnsets = this.onsetTimestamps.length;
    const rhythmSymmetry = symmetryFromRhythm(recentOnsets);

    return {
      rms,
      frequency,
      spectralCentroid,
      spectralFlux,
      harmonicCount,
      silenceRatio,
      pauseMs: this.silenceSince,
      recentOnsets,
      rhythmSymmetry,
    };
  }

  reset(): void {
    this.lastRms = 0;
    this.smoothedF0 = 0;
    this.silenceSince = 0;
    this.lastFrame = performance.now();
    this.onsetTimestamps = [];
    this.prevFreqData.fill(0);
  }

  private computeSpectralFlux(freqData: Uint8Array): number {
    let flux = 0;
    for (let i = 0; i < freqData.length; i += 1) {
      const diff = freqData[i] - this.prevFreqData[i];
      if (diff > 0) {
        flux += diff;
      }
      this.prevFreqData[i] = freqData[i];
    }
    return flux / (freqData.length * 255);
  }

  private computeRms(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  private estimatePitch(buffer: Float32Array, sampleRate: number): number {
    const minLag = Math.floor(sampleRate / 800);
    const maxLag = Math.floor(sampleRate / 70);
    let bestLag = 0;
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let corr = 0;
      for (let i = 0; i < buffer.length - lag; i += 1) {
        corr += buffer[i] * buffer[i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    return bestLag > 0 ? sampleRate / bestLag : 0;
  }

  private computeSpectralCentroid(freqData: Uint8Array, sampleRate: number): number {
    let weighted = 0;
    let total = 0;
    const binWidth = sampleRate / (freqData.length * 2);

    for (let i = 0; i < freqData.length; i += 1) {
      const mag = freqData[i];
      weighted += i * binWidth * mag;
      total += mag;
    }

    return total > 0 ? weighted / total : 0;
  }

  private countHarmonics(freqData: Uint8Array): number {
    let peaks = 0;
    for (let i = 2; i < freqData.length - 2; i += 1) {
      if (freqData[i] > 40 && freqData[i] > freqData[i - 1] && freqData[i] > freqData[i + 1]) {
        peaks += 1;
      }
    }
    return Math.min(peaks, 8);
  }

  /** Нормализованные полоски спектра для 3D-кольца (0…1). */
  getSpectrumBars(barCount: number): Float32Array {
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    const bars = new Float32Array(barCount);
    const binSize = this.freqData.length / barCount;
    for (let i = 0; i < barCount; i += 1) {
      let sum = 0;
      const start = Math.floor(i * binSize);
      const end = Math.floor((i + 1) * binSize);
      for (let j = start; j < end; j += 1) {
        sum += this.freqData[j];
      }
      const span = Math.max(end - start, 1);
      bars[i] = sum / (span * 255);
    }
    return bars;
  }
}
