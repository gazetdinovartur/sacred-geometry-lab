import type { DialogFrame, FeatureSnapshot } from '../types';
import { FeatureExtractor } from '../audio/FeatureExtractor';

/** Два канала → два полушария мандалы. */
export class DialogSessionLoop {
  private frameId = 0;
  private extractorA: FeatureExtractor | null = null;
  private extractorB: FeatureExtractor | null = null;
  private paused = false;
  private frameIndex = 0;

  constructor(private readonly onFrame: (frame: DialogFrame) => void) {}

  start(analyserA: AnalyserNode, analyserB: AnalyserNode): void {
    this.extractorA = new FeatureExtractor(analyserA);
    this.extractorB = new FeatureExtractor(analyserB);
    this.paused = false;
    this.frameIndex = 0;
    this.scheduleTick();
  }

  pause(): void {
    this.paused = true;
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  resume(): void {
    if (!this.extractorA || !this.extractorB) {
      return;
    }
    this.paused = false;
    this.scheduleTick();
  }

  stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.extractorA = null;
    this.extractorB = null;
    this.paused = false;
    this.frameIndex = 0;
  }

  private scheduleTick(): void {
    cancelAnimationFrame(this.frameId);

    const tick = (): void => {
      if (!this.extractorA || !this.extractorB || this.paused) {
        return;
      }

      const featuresA = this.extractorA.extract();
      const featuresB = this.extractorB.extract();
      const overlap = Math.min(featuresA.rms, featuresB.rms) / Math.max(featuresA.rms, featuresB.rms, 0.001);

      this.frameIndex += 1;
      const label = `Кадр ${this.frameIndex}`;

      const left: FeatureSnapshot = {
        timestamp: performance.now(),
        features: featuresA,
        params: {} as FeatureSnapshot['params'],
        label,
      };
      const right: FeatureSnapshot = {
        timestamp: performance.now(),
        features: featuresB,
        params: {} as FeatureSnapshot['params'],
        label,
      };

      this.onFrame({ left, right, overlap: Math.min(overlap, 1) });
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }
}
