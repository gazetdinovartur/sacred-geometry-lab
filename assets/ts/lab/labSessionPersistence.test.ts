import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  clearLabSession,
  loadLabSession,
  saveLabSession,
} from './labSessionPersistence';
import type { FeatureSnapshot } from '../types';

const sampleSnapshot = (): FeatureSnapshot => ({
  timestamp: 1000,
  features: {
    rms: 0.1,
    frequency: 220,
    pitchConfidence: 0.8,
    spectralLevel: 0.2,
    isActive: true,
    spectralCentroid: 500,
    spectralFlux: 0.05,
    harmonicCount: 3,
    silenceRatio: 0.1,
    pauseMs: 0,
    recentOnsets: 1,
    rhythmSymmetry: 0.5,
  },
  params: {
    radius: 120,
    rays: 6,
    rotationSpeed: 0,
    hue: 200,
    opacity: 0.7,
    symmetry: 6,
    breathRing: 0.2,
    lineWidth: 1,
    waveAmplitude: 0,
    spiralTurns: 0,
    dotCount: 4,
    elementCount: 4,
    pitchAngle: 0,
  },
  label: 'Live',
  pitchTrail: [{ angle: 0, radiusNorm: 0.5, lineWidth: 1, opacity: 0.8, fold: 6, width: 0.5, kind: 'petal', variant: 0 }],
  voiceMs: 5000,
});

describe('labSessionPersistence', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    });
    clearLabSession();
  });

  it('roundtrips session snapshot', () => {
    saveLabSession({
      mode: 'live',
      exportStyle: 'dots',
      frozenIndex: null,
      activeSnapshot: null,
      lastSnapshot: sampleSnapshot(),
      processSnapshots: [],
      composite: null,
      pitchTrail: sampleSnapshot().pitchTrail ?? [],
      voiceAccumMs: 5000,
      sessionStarted: Date.now(),
      toneLabel: 'A3',
      silenceLabel: '—',
      rmsNorm: 42,
    });

    const loaded = loadLabSession();
    expect(loaded?.mode).toBe('live');
    expect(loaded?.lastSnapshot.params.hue).toBe(200);
    expect(loaded?.pitchTrail).toHaveLength(1);
  });

  it('returns null after clear', () => {
    saveLabSession({
      mode: 'process',
      exportStyle: 'classic',
      frozenIndex: -1,
      activeSnapshot: -1,
      lastSnapshot: sampleSnapshot(),
      processSnapshots: [sampleSnapshot()],
      composite: sampleSnapshot(),
      pitchTrail: [],
      voiceAccumMs: 8000,
      sessionStarted: Date.now(),
      toneLabel: '—',
      silenceLabel: '—',
      rmsNorm: 0,
    });

    clearLabSession();
    expect(loadLabSession()).toBeNull();
  });
});
