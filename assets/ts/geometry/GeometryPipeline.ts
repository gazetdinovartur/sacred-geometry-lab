import type { AudioFeatures, GeometryParams } from '../types';
import type { NormalizedFeatures } from '../audio/VoiceProfile';
import { mapFeaturesToGeometry } from './MappingEngine';
import { applySilenceFade, applySilenceLive } from './SilenceMapper';

const SILENCE_RMS = 0.015;

/** Звук → параметры. В тишине — медленное затухание последней формы. */
export class GeometryPipeline {
  private heldParams: GeometryParams | null = null;

  resolve(features: AudioFeatures, norm: NormalizedFeatures): GeometryParams {
    const isSilent = features.rms < SILENCE_RMS;

    if (!isSilent) {
      const base = mapFeaturesToGeometry(features, norm);
      this.heldParams = base;
      return applySilenceLive(base);
    }

    if (this.heldParams) {
      return applySilenceFade(this.heldParams, features.pauseMs, features.silenceRatio);
    }

    return applySilenceLive(mapFeaturesToGeometry(features, norm));
  }

  reset(): void {
    this.heldParams = null;
  }

  hasHeldForm(): boolean {
    return this.heldParams !== null;
  }
}

export { SILENCE_RMS };
