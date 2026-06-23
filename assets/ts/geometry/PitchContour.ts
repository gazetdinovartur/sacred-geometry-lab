import type { AudioFeatures } from '../types';
import type { NormalizedFeatures } from '../audio/VoiceProfile';
import type { PitchPoint, VoiceMotifKind } from '../types';
import { pickVoiceMotif, motifVariant } from './MotifPicker';

const MAX_SEGMENTS = 200;
const MIN_SECTOR_STEP = 0.12;

/** Голос → узоры мандалы (разные формы от разных параметров). */
export class PitchContour {
  private segments: PitchPoint[] = [];
  private angle = 0;
  private lastNorm: NormalizedFeatures | null = null;
  private lastOnsets = 0;

  reset(): void {
    this.segments = [];
    this.angle = 0;
    this.lastNorm = null;
    this.lastOnsets = 0;
  }

  push(
    norm: NormalizedFeatures,
    features: AudioFeatures,
    active: boolean,
    symmetry: number,
  ): VoiceMotifKind | null {
    if (!active) {
      return null;
    }

    const kind = pickVoiceMotif(norm, this.lastNorm, features, this.lastOnsets);
    const fold = Math.max(symmetry, 3);
    const sector = (Math.PI * 2) / fold;
    this.angle += sector * (0.24 + norm.rms * 0.22);
    const snapped = Math.round(this.angle / sector) * sector;

    const last = this.segments[this.segments.length - 1];
    if (last && Math.abs(snapped - last.angle) < sector * MIN_SECTOR_STEP && last.kind === kind) {
      this.lastNorm = { ...norm };
      this.lastOnsets = features.recentOnsets;
      return null;
    }

    this.segments.push({
      angle: snapped,
      radiusNorm: 0.36 + norm.pitch * 0.5,
      lineWidth: 0.55 + norm.rms * 0.65,
      opacity: 0.55 + norm.rms * 0.42,
      fold,
      width: sector * (kind === 'wave' ? 0.95 : kind === 'filigree' ? 0.55 : 0.72),
      kind,
      variant: motifVariant(norm, kind),
    });

    if (this.segments.length > MAX_SEGMENTS) {
      this.segments.shift();
    }

    this.lastNorm = { ...norm };
    this.lastOnsets = features.recentOnsets;
    return kind;
  }

  getPoints(): PitchPoint[] {
    return this.segments;
  }

  setPoints(points: PitchPoint[]): void {
    this.segments = points.map((p) => ({
      ...p,
      kind: p.kind ?? 'petal',
      variant: p.variant ?? 0,
    }));
    if (this.segments.length > 0) {
      this.angle = this.segments[this.segments.length - 1].angle;
    }
  }

  clonePoints(): PitchPoint[] {
    return this.segments.map((p) => ({ ...p }));
  }
}
