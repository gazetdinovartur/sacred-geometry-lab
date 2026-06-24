import type { AudioFeatures } from '../types';
import { FeatureExtractor } from '../audio/FeatureExtractor';

export type AudioFrame = {
  timestamp: number;
  features: AudioFeatures;
  label: string;
};

/** Извлекает акустические признаки каждый кадр; маппинг — в LabApp. */
export class AudioSessionLoop {
  private frameId = 0;
  private extractor: FeatureExtractor | null = null;
  private analyser: AnalyserNode | null = null;
  private frameIndex = 0;
  private paused = false;

  constructor(private readonly onFrame: (frame: AudioFrame) => void) {}

  start(analyser: AnalyserNode): void {
    this.analyser = analyser;
    this.paused = false;
    this.frameIndex = 0;

    if (!this.extractor) {
      this.extractor = new FeatureExtractor(analyser);
    } else {
      this.extractor.reset();
    }

    this.scheduleTick();
  }

  pause(): void {
    this.paused = true;
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  resume(): void {
    if (!this.analyser || !this.extractor) {
      return;
    }
    this.paused = false;
    this.scheduleTick();
  }

  stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.extractor?.reset();
    this.extractor = null;
    this.analyser = null;
    this.paused = false;
    this.frameIndex = 0;
  }

  getSpectrumBars(count = 64): Float32Array {
    return this.extractor?.getSpectrumBars(count) ?? new Float32Array(count);
  }

  private scheduleTick(): void {
    cancelAnimationFrame(this.frameId);

    const tick = (): void => {
      if (!this.extractor || this.paused) {
        return;
      }

      const features = this.extractor.extract();
      this.frameIndex += 1;
      this.onFrame({
        timestamp: performance.now(),
        features,
        label: `Кадр ${this.frameIndex}`,
      });

      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }
}
