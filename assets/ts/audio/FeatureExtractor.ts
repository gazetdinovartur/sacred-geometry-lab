import type { AudioFeatures } from '../types';
import { symmetryFromRhythm } from '../geometry/SymmetryResolver';

const SILENCE_ENTER = 0.008;
const SILENCE_EXIT = 0.012;
const SPECTRAL_ENTER = 0.016;
const SPECTRAL_EXIT = 0.011;
const ONSET_WINDOW_MS = 4000;
const ONSET_RMS_FACTOR = 1.35;
const RMS_ATTACK = 0.46;
const RMS_RELEASE = 0.24;
const F0_SMOOTH = 0.22;
const F0_HOLD_DECAY = 0.965;
const PITCH_CORR_MIN = 0.2;
const PEAK_MAG_MIN = 22;

export class FeatureExtractor {
  private timeData: Float32Array;
  private freqData: Uint8Array;
  private lastRms = 0;
  private smoothedRms = 0;
  private smoothedF0 = 0;
  private smoothedPitchConfidence = 0;
  private voiceActive = false;
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

    const rmsRaw = this.computeRms(this.timeData);
    const rmsSmooth = rmsRaw > this.smoothedRms ? RMS_ATTACK : RMS_RELEASE;
    this.smoothedRms = this.smoothedRms <= 0
      ? rmsRaw
      : this.smoothedRms * (1 - rmsSmooth) + rmsRaw * rmsSmooth;
    const rms = this.smoothedRms;

    const spectralLevel = this.computeSpectralLevel(this.freqData);
    const energy = Math.max(rms, spectralLevel * 0.78);

    this.voiceActive = this.voiceActive
      ? energy >= SILENCE_ENTER || spectralLevel >= SPECTRAL_ENTER
      : energy >= SILENCE_EXIT || spectralLevel >= SPECTRAL_EXIT;

    const sampleRate = this.analyser.context.sampleRate;
    const spectralCentroid = this.computeSpectralCentroid(this.freqData, sampleRate);
    const spectralFlux = this.computeSpectralFlux(this.freqData);
    const harmonicCount = this.countHarmonics(this.freqData);

    let rawFrequency = 0;
    let pitchConfidence = 0;

    if (this.voiceActive) {
      const pitch = this.estimatePitch(this.timeData, sampleRate);
      if (pitch.hz > 0) {
        rawFrequency = pitch.hz;
        pitchConfidence = pitch.confidence;
      } else {
        const peakHz = this.estimatePeakFrequency(this.freqData, sampleRate);
        if (peakHz > 0) {
          rawFrequency = peakHz;
          pitchConfidence = 0.48;
        } else if (spectralCentroid >= 55) {
          rawFrequency = spectralCentroid;
          pitchConfidence = 0.3;
        }
      }
    }

    let frequency = 0;
    if (rawFrequency > 0) {
      this.smoothedF0 = this.smoothedF0 <= 0
        ? rawFrequency
        : this.smoothedF0 * (1 - F0_SMOOTH) + rawFrequency * F0_SMOOTH;
      this.smoothedPitchConfidence = this.smoothedPitchConfidence <= 0
        ? pitchConfidence
        : this.smoothedPitchConfidence * (1 - F0_SMOOTH) + pitchConfidence * F0_SMOOTH;
      frequency = this.smoothedF0;
    } else if (this.voiceActive && this.smoothedF0 > 0) {
      this.smoothedF0 *= F0_HOLD_DECAY;
      this.smoothedPitchConfidence *= 0.94;
      frequency = this.smoothedF0;
      pitchConfidence = this.smoothedPitchConfidence;
    } else if (!this.voiceActive) {
      this.smoothedF0 = 0;
      this.smoothedPitchConfidence = 0;
    } else {
      pitchConfidence = this.smoothedPitchConfidence;
    }

    const isSilent = !this.voiceActive;

    if (isSilent) {
      this.silenceSince += delta;
    } else {
      this.silenceSince = 0;
    }

    if (this.lastRms > SILENCE_ENTER && energy > this.lastRms * ONSET_RMS_FACTOR) {
      this.onsetTimestamps.push(now);
    }

    this.onsetTimestamps = this.onsetTimestamps.filter((t) => now - t < ONSET_WINDOW_MS);
    this.lastRms = energy;

    const silenceRatio = isSilent ? Math.min(this.silenceSince / 3000, 1) : 0;
    const recentOnsets = this.onsetTimestamps.length;
    const rhythmSymmetry = symmetryFromRhythm(recentOnsets);

    return {
      rms,
      frequency,
      pitchConfidence: frequency > 0 ? pitchConfidence : 0,
      spectralLevel,
      isActive: this.voiceActive,
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
    this.smoothedRms = 0;
    this.smoothedF0 = 0;
    this.smoothedPitchConfidence = 0;
    this.voiceActive = false;
    this.silenceSince = 0;
    this.lastFrame = performance.now();
    this.onsetTimestamps = [];
    this.prevFreqData.fill(0);
  }

  private computeSpectralLevel(freqData: Uint8Array): number {
    let sum = 0;
    const start = 2;
    for (let i = start; i < freqData.length; i += 1) {
      sum += freqData[i];
    }
    return sum / ((freqData.length - start) * 255);
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

  private estimatePitch(
    buffer: Float32Array,
    sampleRate: number,
  ): { hz: number; confidence: number } {
    let energy = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      energy += buffer[i] * buffer[i];
    }
    if (energy < 1e-8) {
      return { hz: 0, confidence: 0 };
    }

    const minLag = Math.floor(sampleRate / 900);
    const maxLag = Math.floor(sampleRate / 65);
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

    const confidence = bestCorr / energy;
    if (bestLag <= 0 || confidence < PITCH_CORR_MIN) {
      return { hz: 0, confidence: 0 };
    }

    return { hz: sampleRate / bestLag, confidence: Math.min(confidence, 1) };
  }

  private estimatePeakFrequency(freqData: Uint8Array, sampleRate: number): number {
    const binWidth = sampleRate / (freqData.length * 2);
    const minBin = Math.max(2, Math.floor(70 / binWidth));
    const maxBin = Math.min(freqData.length - 1, Math.floor(4200 / binWidth));
    let bestBin = 0;
    let bestMag = 0;
    let sum = 0;

    for (let i = minBin; i <= maxBin; i += 1) {
      const mag = freqData[i];
      sum += mag;
      if (mag > bestMag) {
        bestMag = mag;
        bestBin = i;
      }
    }

    const span = Math.max(maxBin - minBin + 1, 1);
    const avg = sum / span;
    if (bestMag < PEAK_MAG_MIN || bestMag < avg * 1.35) {
      return 0;
    }

    return bestBin * binWidth;
  }

  private computeSpectralCentroid(freqData: Uint8Array, sampleRate: number): number {
    let weighted = 0;
    let total = 0;
    const binWidth = sampleRate / (freqData.length * 2);

    for (let i = 2; i < freqData.length; i += 1) {
      const mag = freqData[i];
      weighted += i * binWidth * mag;
      total += mag;
    }

    return total > 0 ? weighted / total : 0;
  }

  private countHarmonics(freqData: Uint8Array): number {
    let peaks = 0;
    for (let i = 2; i < freqData.length - 2; i += 1) {
      if (freqData[i] > 32 && freqData[i] > freqData[i - 1] && freqData[i] > freqData[i + 1]) {
        peaks += 1;
      }
    }
    return Math.min(peaks, 8);
  }

  /** Логарифмические полоски 60 Hz–8 kHz: голос + акустика (0…1). */
  getSpectrumBars(barCount: number): Float32Array {
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    const bars = new Float32Array(barCount);
    const sampleRate = this.analyser.context.sampleRate;
    const binWidth = sampleRate / (this.freqData.length * 2);
    const minHz = 60;
    const maxHz = 8000;
    const logMin = Math.log(minHz);
    const logMax = Math.log(maxHz);
    const logSpan = logMax - logMin;

    for (let i = 0; i < barCount; i += 1) {
      const f0 = Math.exp(logMin + (i / barCount) * logSpan);
      const f1 = Math.exp(logMin + ((i + 1) / barCount) * logSpan);
      const start = Math.max(1, Math.floor(f0 / binWidth));
      const end = Math.min(this.freqData.length - 1, Math.ceil(f1 / binWidth));
      let sum = 0;
      let weightSum = 0;
      for (let j = start; j <= end; j += 1) {
        const hz = j * binWidth;
        const weight = voiceBandWeight(hz);
        sum += (this.freqData[j] ?? 0) * weight;
        weightSum += weight;
      }
      const span = Math.max(weightSum, 1);
      const raw = sum / (span * 255);
      bars[i] = Math.min(Math.pow(raw, 0.82) * 1.05, 1);
    }
    return bars;
  }
}

/** Подчёркивает формантный диапазон голоса, не режет высокие гармоники инструментов. */
function voiceBandWeight(hz: number): number {
  if (hz < 120) {
    return 0.72;
  }
  if (hz < 280) {
    return 0.88 + (hz - 120) / 160 * 0.18;
  }
  if (hz <= 3400) {
    return 1.08;
  }
  if (hz <= 6000) {
    return 1.05 - (hz - 3400) / 2600 * 0.28;
  }
  return 0.82;
}
