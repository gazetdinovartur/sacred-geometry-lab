import type { VoiceProfile } from '../audio/VoiceProfile';
import type { AudioFeatures } from '../types';

export type CalibrationUiState = {
  isCalibrating: boolean;
  progress: number;
  prompt: string;
};

/** Таймер калибровки + сэмплы с микрофона. Не зависит от rAF-цикла целиком. */
export class CalibrationRunner {
  private timerId = 0;
  private lastFeatures: AudioFeatures | null = null;
  private onUiUpdate: ((state: CalibrationUiState) => void) | null = null;
  private onComplete: (() => void) | null = null;

  constructor(private readonly profile: VoiceProfile) {}

  start(onUiUpdate: (state: CalibrationUiState) => void, onComplete: () => void): void {
    this.stop();
    this.lastFeatures = null;
    this.onUiUpdate = onUiUpdate;
    this.onComplete = onComplete;
    this.profile.beginSessionCalibration();
    this.emitUi();
    this.timerId = globalThis.setInterval(() => this.tick(), 100) as unknown as number;
  }

  stop(): void {
    if (this.timerId) {
      globalThis.clearInterval(this.timerId);
      this.timerId = 0;
    }
    this.lastFeatures = null;
    this.onUiUpdate = null;
    this.onComplete = null;
  }

  pushFeatures(features: AudioFeatures): void {
    if (!this.profile.isCalibrating()) {
      return;
    }
    this.lastFeatures = features;
    this.profile.ingestCalibrationSample(features);
  }

  abort(): void {
    this.stop();
    this.profile.abortCalibration();
  }

  skip(): void {
    this.stop();
    this.profile.skipCalibration();
  }

  private tick(): void {
    if (!this.profile.isCalibrating()) {
      this.stop();
      return;
    }

    if (this.lastFeatures) {
      this.profile.ingestCalibrationSample(this.lastFeatures);
    }

    const done = this.profile.completeCalibrationIfDue();
    this.emitUi();

    if (done) {
      const complete = this.onComplete;
      this.stop();
      complete?.();
    }
  }

  private emitUi(): void {
    this.onUiUpdate?.({
      isCalibrating: this.profile.isCalibrating(),
      progress: Math.round(this.profile.calibrationProgress() * 100),
      prompt: this.profile.calibrationPrompt(),
    });
  }
}
