import type { AudioFeatures } from '../types';

const STORAGE_KEY = 'sgl-voice-profile';
export const CALIBRATION_DURATION_MS = 12000;

export type NormalizedFeatures = {
  rms: number;
  pitch: number;
  centroid: number;
  flux: number;
  harmonics: number;
};

type StoredProfile = {
  f0Min: number;
  f0Max: number;
  rmsMin: number;
  rmsMax: number;
  centroidMin: number;
  centroidMax: number;
  sampleCount: number;
  calibrated: boolean;
};

const CALIBRATION_PROMPTS = [
  { untilMs: 3000, text: 'Тихо, как шёпот — несколько секунд' },
  { untilMs: 6000, text: 'Громче — обычная речь' },
  { untilMs: 9000, text: 'Низкий тон — «а-а-а»' },
  { untilMs: CALIBRATION_DURATION_MS, text: 'Высокий тон — «и-и-и»' },
];

/** Калибровка один раз → localStorage. Нормализация под тихий/громкий голос. */
export class VoiceProfile {
  private f0Min = 120;
  private f0Max = 320;
  private rmsMin = 0.012;
  private rmsMax = 0.22;
  private centroidMin = 600;
  private centroidMax = 3200;
  private sampleCount = 0;
  private calibrated = false;

  private calibrationStarted = 0;
  private calibrating = false;

  constructor() {
    this.load();
  }

  /** Калибровка нужна только если профиль ещё не сохранён. */
  needsCalibration(): boolean {
    return !this.calibrated || this.f0Max <= this.f0Min + 20;
  }

  beginSessionCalibration(): void {
    this.calibrationStarted = performance.now();
    this.calibrating = true;
    this.f0Min = Infinity;
    this.f0Max = 0;
    this.rmsMin = Infinity;
    this.rmsMax = 0;
    this.centroidMin = Infinity;
    this.centroidMax = 0;
  }

  isCalibrating(): boolean {
    return this.calibrating;
  }

  isSessionCalibrated(): boolean {
    return this.calibrated && !this.calibrating;
  }

  calibrationProgress(now = performance.now()): number {
    if (!this.calibrating) {
      return this.calibrated ? 1 : 0;
    }
    return Math.min((now - this.calibrationStarted) / CALIBRATION_DURATION_MS, 1);
  }

  calibrationPrompt(now = performance.now()): string {
    const elapsed = now - this.calibrationStarted;
    const phase = CALIBRATION_PROMPTS.find((p) => elapsed < p.untilMs);
    return phase?.text ?? CALIBRATION_PROMPTS[CALIBRATION_PROMPTS.length - 1].text;
  }

  addCalibrationSample(features: AudioFeatures, now = performance.now()): boolean {
    this.collectBounds(features);

    if (now - this.calibrationStarted >= CALIBRATION_DURATION_MS) {
      this.finishCalibration();
      return true;
    }

    return false;
  }

  skipCalibration(): void {
    if (this.f0Min === Infinity) {
      this.f0Min = 120;
      this.f0Max = 320;
    }
    if (this.rmsMin === Infinity) {
      this.rmsMin = 0.012;
      this.rmsMax = 0.22;
    }
    if (this.centroidMin === Infinity) {
      this.centroidMin = 600;
      this.centroidMax = 3200;
    }
    this.finishCalibration();
  }

  observe(features: AudioFeatures): void {
    if (features.rms < 0.005) {
      return;
    }
    this.collectBounds(features);
    this.sampleCount += 1;
    if (this.sampleCount % 40 === 0) {
      this.persist();
    }
  }

  normalizeFeatures(features: AudioFeatures): NormalizedFeatures {
    const f0Range = Math.max(this.f0Max - this.f0Min, 50);
    const rmsRange = Math.max(this.rmsMax - this.rmsMin, 0.018);
    const centroidRange = Math.max(this.centroidMax - this.centroidMin, 350);

    const pitch = features.frequency > 0
      ? clamp((features.frequency - this.f0Min) / f0Range, 0, 1)
      : 0.5;

    const rmsLinear = clamp((features.rms - this.rmsMin) / rmsRange, 0, 1);
    const rms = clamp(0.1 + Math.pow(rmsLinear, 0.58) * 0.9, 0, 1);

    return {
      rms,
      pitch,
      centroid: clamp((features.spectralCentroid - this.centroidMin) / centroidRange, 0, 1),
      flux: clamp(features.spectralFlux * 6, 0, 1),
      harmonics: clamp(features.harmonicCount / 8, 0, 1),
    };
  }

  normalize(params: import('../types').GeometryParams): import('../types').GeometryParams {
    return params;
  }

  hash(): string {
    const raw = `${this.f0Min.toFixed(1)}:${this.f0Max.toFixed(1)}:${this.rmsMin.toFixed(4)}:${this.rmsMax.toFixed(4)}`;
    let h = 0;
    for (let i = 0; i < raw.length; i += 1) {
      h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
    }
    return `vp_${Math.abs(h).toString(16)}`;
  }

  isCalibrated(): boolean {
    return this.calibrated;
  }

  getHash(): string {
    return this.hash();
  }

  reset(): void {
    this.sampleCount = 0;
    this.calibrated = false;
    this.calibrating = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.f0Min = 120;
    this.f0Max = 320;
    this.rmsMin = 0.012;
    this.rmsMax = 0.22;
    this.centroidMin = 600;
    this.centroidMax = 3200;
  }

  private finishCalibration(): void {
    if (this.f0Min === Infinity) {
      this.skipCalibration();
      return;
    }
    this.calibrating = false;
    this.calibrated = true;
    this.persist();
  }

  private collectBounds(features: AudioFeatures): void {
    if (features.frequency > 0) {
      this.f0Min = Math.min(this.f0Min, features.frequency);
      this.f0Max = Math.max(this.f0Max, features.frequency);
    }
    if (features.rms > 0.003) {
      this.rmsMin = Math.min(this.rmsMin, features.rms);
      this.rmsMax = Math.max(this.rmsMax, features.rms);
    }
    if (features.spectralCentroid > 0) {
      this.centroidMin = Math.min(this.centroidMin, features.spectralCentroid);
      this.centroidMax = Math.max(this.centroidMax, features.spectralCentroid);
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const data: StoredProfile = {
      f0Min: this.f0Min,
      f0Max: this.f0Max,
      rmsMin: this.rmsMin,
      rmsMax: this.rmsMax,
      centroidMin: this.centroidMin,
      centroidMax: this.centroidMax,
      sampleCount: this.sampleCount,
      calibrated: this.calibrated,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private load(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const data = JSON.parse(raw) as StoredProfile;
      this.f0Min = data.f0Min;
      this.f0Max = data.f0Max;
      this.rmsMin = data.rmsMin ?? 0.012;
      this.rmsMax = data.rmsMax ?? 0.22;
      this.centroidMin = data.centroidMin ?? 600;
      this.centroidMax = data.centroidMax ?? 3200;
      this.sampleCount = data.sampleCount;
      this.calibrated = data.calibrated ?? (data.f0Max > data.f0Min + 20);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
