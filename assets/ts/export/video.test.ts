import { describe, expect, it } from 'vitest';
import type { FeatureSnapshot } from '../types';
import { easeInOutCubic, lerpGeometryParams } from '../geometry/paramInterpolation';
import { buildVideoFramePlans, DEFAULT_VIDEO_CONFIG } from '../export/videoTimeline';
import { buildCinemaFramePlans, CINEMA_VIDEO_CONFIG } from '../export/cinemaVideoTimeline';
import { buildSessionComposite, stageSnapshot } from '../export/sessionComposite';

function sampleSnapshot(index: number, timestamp: number): FeatureSnapshot {
  return {
    timestamp,
    sessionStarted: 1000,
    label: `Этап ${index + 1}`,
    features: {
      rms: 0.1 + index * 0.01,
      frequency: 180 + index * 20,
      pitchConfidence: 0.7,
      spectralLevel: 0.15,
      isActive: true,
      spectralCentroid: 1200 + index * 100,
      spectralFlux: 0.05,
      harmonicCount: 4,
      silenceRatio: 0,
      pauseMs: 0,
      recentOnsets: 4,
      rhythmSymmetry: 6,
    },
    params: {
      radius: 120 + index * 5,
      rays: 6,
      rotationSpeed: 0,
      hue: 200 + index * 5,
      opacity: 0.6 + index * 0.02,
      symmetry: 6,
      breathRing: 0,
      lineWidth: 1,
      waveAmplitude: 0,
      spiralTurns: 0,
      dotCount: 4,
      elementCount: 4 + index,
      pitchAngle: index * 0.1,
    },
    spectrum: [0.2, 0.4, 0.3, 0.5, 0.25, 0.35, 0.15, 0.45],
  };
}

describe('paramInterpolation', () => {
  it('eases between geometry params', () => {
    const a = sampleSnapshot(0, 1000).params;
    const b = sampleSnapshot(1, 2000).params;
    const mid = lerpGeometryParams(a, b, 0.5);
    expect(mid.radius).toBeGreaterThan(a.radius);
    expect(mid.radius).toBeLessThan(b.radius);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

describe('videoTimeline', () => {
  it('builds frame plans with holds, morphs and final composite', () => {
    const snapshots = [
      sampleSnapshot(0, 8000),
      sampleSnapshot(1, 20000),
      sampleSnapshot(2, 32000),
    ];
    snapshots[0].sessionStarted = 1000;

    const plans = buildVideoFramePlans(snapshots, {
      ...DEFAULT_VIDEO_CONFIG,
      morphMs: 2000,
      minHoldMs: 800,
      finalHoldMs: 2000,
      morphToFinalMs: 1500,
    });

    expect(plans.length).toBeGreaterThan(24);
    expect(plans[0].snapshot.processSnapshots?.length).toBe(1);
    expect(plans.at(-1)?.snapshot.label).toBe('Итог');
  });

  it('grows process rings per stage', () => {
    const snapshots = [sampleSnapshot(0, 5000), sampleSnapshot(1, 17000)];
    const stage0 = stageSnapshot(snapshots, 0);
    const stage1 = stageSnapshot(snapshots, 1);
    expect(stage0.processSnapshots?.length).toBe(1);
    expect(stage1.processSnapshots?.length).toBe(2);
    expect(buildSessionComposite(snapshots).processSnapshots?.length).toBe(2);
  });
});

describe('cinemaVideoTimeline', () => {
  it('builds 30fps plans synced to audio duration', () => {
    const snapshots = [
      sampleSnapshot(0, 8000),
      sampleSnapshot(1, 20000),
    ];
    const bundle = {
      audioBlob: new Blob([], { type: 'audio/webm' }),
      audioDurationMs: 5000,
      captureStartedAt: 1000,
      processSnapshots: snapshots.map((s, i) => ({
        timestamp: 1000 + i * 4000,
        sessionStarted: 1000,
        label: `Этап ${i + 1}`,
        features: s.features,
        params: s.params,
        spectrum: s.spectrum,
      })),
      samples: [
        { timeMs: 0, features: sampleSnapshot(0, 0).features, params: sampleSnapshot(0, 0).params, spectrum: sampleSnapshot(0, 0).spectrum },
        { timeMs: 2500, features: sampleSnapshot(1, 0).features, params: sampleSnapshot(1, 0).params, spectrum: sampleSnapshot(1, 0).spectrum },
        { timeMs: 4800, features: sampleSnapshot(1, 0).features, params: sampleSnapshot(1, 0).params, spectrum: sampleSnapshot(1, 0).spectrum },
      ],
    };

    const plans = buildCinemaFramePlans(bundle);
    const expectedMin = Math.floor((5000 + CINEMA_VIDEO_CONFIG.morphToFinalMs + CINEMA_VIDEO_CONFIG.finalHoldMs) / (1000 / 30));
    expect(plans.length).toBeGreaterThan(expectedMin - 5);
    expect(plans.at(-1)?.snapshot.label).toBe('Итог');
  });
});
