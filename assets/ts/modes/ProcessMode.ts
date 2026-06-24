import type { LabRenderer } from '../geometry/LabRenderer';
import type { FeatureSnapshot } from '../types';
import { blendGeometryParams } from '../geometry/SymmetryResolver';

const SNAPSHOT_INTERVAL_MS = 12000;
const FIRST_SNAPSHOT_MS = 7000;
const SIGNIFICANT_FLUX = 0.1;
const SIGNIFICANT_CENTROID_DELTA = 500;
const MIN_CHANGE_GAP_MS = 5000;
const MIN_FINAL_GAP_MS = 2500;

export class ProcessMode {
  private snapshots: FeatureSnapshot[] = [];
  private composite: FeatureSnapshot | null = null;
  private lastCapture = 0;
  private sessionStart = 0;
  private lastCentroid = 0;

  constructor(private readonly renderer: LabRenderer) {}

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
      || sinceLast >= SNAPSHOT_INTERVAL_MS
      || (significantChange && sinceLast >= MIN_CHANGE_GAP_MS);

    if (shouldCapture) {
      this.pushSnapshot(snapshot);
      return true;
    }

    this.lastCentroid = snapshot.features.spectralCentroid;
    return false;
  }

  /** Финальный кадр при «Стоп» — тишина тоже часть процесса. */
  ensureClosingCapture(snapshot: FeatureSnapshot): void {
    if (this.snapshots.length === 0) {
      this.pushSnapshot(snapshot, 'Этап 1');
      return;
    }

    const sinceLast = snapshot.timestamp - this.lastCapture;
    if (sinceLast >= MIN_FINAL_GAP_MS) {
      this.pushSnapshot(snapshot);
    }
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
      spectrum: averageSpectrum(this.snapshots),
      processSnapshots: [...this.snapshots],
      sessionStarted: this.snapshots[0]?.sessionStarted,
      profileHash: this.snapshots[0]?.profileHash,
      voiceMs: this.snapshots.reduce((sum, s) => sum + (s.voiceMs ?? 0), 0),
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

  private pushSnapshot(snapshot: FeatureSnapshot, label?: string): void {
    const index = this.snapshots.length + 1;
    this.snapshots.push({
      ...structuredClone(snapshot),
      label: label ?? `Этап ${index}`,
    });
    this.lastCapture = snapshot.timestamp;
    this.lastCentroid = snapshot.features.spectralCentroid;
  }
}

function averageSpectrum(snapshots: FeatureSnapshot[]): number[] | undefined {
  const withSpectrum = snapshots.filter((s) => s.spectrum?.length);
  if (withSpectrum.length === 0) {
    return undefined;
  }

  const len = withSpectrum[0].spectrum!.length;
  const avg = new Array(len).fill(0);
  withSpectrum.forEach((snap) => {
    snap.spectrum!.forEach((v, i) => {
      avg[i] += v;
    });
  });
  return avg.map((v) => v / withSpectrum.length);
}
