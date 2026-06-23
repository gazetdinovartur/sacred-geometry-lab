import type { FeatureSnapshot } from '../types';
import { blendGeometryParams } from '../geometry/SymmetryResolver';
import { MandalaRenderer } from '../geometry/MandalaRenderer';

const SNAPSHOT_INTERVAL_MS = 5000;
const FIRST_SNAPSHOT_MS = 3000;
const MAX_SNAPSHOTS = 6;
const SIGNIFICANT_FLUX = 0.08;
const SIGNIFICANT_CENTROID_DELTA = 450;

export class ProcessMode {
  private snapshots: FeatureSnapshot[] = [];
  private composite: FeatureSnapshot | null = null;
  private lastCapture = 0;
  private sessionStart = 0;
  private lastCentroid = 0;

  constructor(private readonly renderer: MandalaRenderer) {}

  reset(): void {
    this.snapshots = [];
    this.composite = null;
    this.lastCapture = 0;
    this.sessionStart = 0;
    this.lastCentroid = 0;
  }

  beginSession(): void {
    this.sessionStart = performance.now();
    this.lastCapture = 0;
  }

  /** @returns true если добавлен новый слепок */
  capture(snapshot: FeatureSnapshot): boolean {
    const now = snapshot.timestamp;

    if (this.sessionStart === 0) {
      this.sessionStart = now;
    }

    const centroidDelta = Math.abs(snapshot.features.spectralCentroid - this.lastCentroid);
    const significantChange = snapshot.features.spectralFlux > SIGNIFICANT_FLUX
      || centroidDelta > SIGNIFICANT_CENTROID_DELTA;

    const elapsed = now - this.sessionStart;
    const sinceLast = now - this.lastCapture;

    const shouldCapture = (this.snapshots.length === 0 && elapsed >= FIRST_SNAPSHOT_MS)
      || (sinceLast >= SNAPSHOT_INTERVAL_MS && this.snapshots.length < MAX_SNAPSHOTS)
      || (significantChange && sinceLast >= 2000 && this.snapshots.length < MAX_SNAPSHOTS);

    if (shouldCapture) {
      const index = this.snapshots.length + 1;
      this.snapshots.push({
        ...structuredClone(snapshot),
        label: `Этап ${index}`,
      });
      this.lastCapture = now;
      this.lastCentroid = snapshot.features.spectralCentroid;
      return true;
    }

    this.lastCentroid = snapshot.features.spectralCentroid;
    return false;
  }

  finalize(fullPitchTrail: FeatureSnapshot['pitchTrail'] = []): FeatureSnapshot | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    const params = blendGeometryParams(this.snapshots);
    this.composite = {
      timestamp: performance.now(),
      features: this.snapshots[this.snapshots.length - 1].features,
      params,
      label: 'Итог',
      pitchTrail: fullPitchTrail,
    };

    return this.composite;
  }

  show(index: number): void {
    const snap = this.snapshots[index];
    if (!snap) {
      return;
    }
    this.renderer.renderSnapshot(snap);
  }

  showComposite(): void {
    if (this.composite) {
      this.renderer.renderSnapshot(this.composite);
      return;
    }
    this.renderer.renderComposite(this.snapshots);
  }

  getEntry(index: number): FeatureSnapshot | null {
    if (index === -1 && this.composite) {
      return this.composite;
    }
    return this.snapshots[index] ?? null;
  }

  getSnapshots(): FeatureSnapshot[] {
    return this.snapshots;
  }

  getComposite(): FeatureSnapshot | null {
    return this.composite;
  }
}
