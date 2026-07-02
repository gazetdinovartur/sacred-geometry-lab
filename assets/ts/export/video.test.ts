import { describe, expect, it } from 'vitest';
import type { FeatureSnapshot } from '../types';
import { easeInOutCubic, easeInOutSine, lerpGeometryParams } from '../geometry/paramInterpolation';
import { buildVideoFramePlans, DEFAULT_VIDEO_CONFIG } from '../export/videoTimeline';
import { buildCinemaFramePlans, CINEMA_VIDEO_CONFIG, SYNCED_CINEMA_VIDEO_CONFIG } from '../export/cinemaVideoTimeline';
import { buildFlightVideoPlan, canBuildFlightVideo, MIN_FLIGHT_VIDEO_SAMPLES } from '../export/flightVideoPlan';
import { buildFrameTimes } from '../export/cinemaVideoTimeline';
import { buildSessionComposite, stageSnapshot } from '../export/sessionComposite';
import {
  buildVideoMorphSnapshot,
  lerpBreathingParams,
  resolveVideoAnchorParams,
  stabilizeHoldSnapshot,
} from '../export/videoFrameBuilder';

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
      rotationSpeed: 0.02 + index * 0.01,
      hue: 200 + index * 5,
      opacity: 0.6 + index * 0.02,
      symmetry: 6,
      breathRing: 0,
      lineWidth: 1,
      waveAmplitude: 0,
      spiralTurns: 0,
      dotCount: 4,
      elementCount: 4 + index,
      pitchAngle: index * 0.9,
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
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 5);
  });
});

describe('videoFrameBuilder', () => {
  it('locks scaffold orientation for the whole video', () => {
    const snapshots = [sampleSnapshot(0, 1000), sampleSnapshot(2, 3000)];
    const anchor = resolveVideoAnchorParams(snapshots);
    expect(anchor.pitchAngle).toBe(0);
    expect(anchor.rotationSpeed).toBe(0);

    const morphed = buildVideoMorphSnapshot(snapshots[0], snapshots[1], 0.5, anchor);
    expect(morphed.params.pitchAngle).toBe(0);
    expect(morphed.params.symmetry).toBe(anchor.symmetry);
  });

  it('only breathes size and color between stages', () => {
    const snapshots = [sampleSnapshot(0, 1000), sampleSnapshot(1, 2000)];
    const anchor = resolveVideoAnchorParams(snapshots);
    const mid = lerpBreathingParams(snapshots[0].params, snapshots[1].params, 0.5, anchor);
    expect(mid.pitchAngle).toBe(0);
    expect(mid.radius).toBeGreaterThan(snapshots[0].params.radius);
    expect(mid.radius).toBeLessThan(snapshots[1].params.radius);
  });

  it('stabilizes hold frames', () => {
    const snap = sampleSnapshot(1, 2000);
    const anchor = resolveVideoAnchorParams([snap]);
    const stable = stabilizeHoldSnapshot(snap, anchor);
    expect(stable.params.pitchAngle).toBe(0);
    expect(stable.params.opacity).toBe(snap.params.opacity);
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
    expect(plans.every((p) => p.snapshot.params.pitchAngle === 0)).toBe(true);
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

describe('flightVideoPlan', () => {
  it('prefers cinema timeline when enough live samples', () => {
    const snapshots = [sampleSnapshot(0, 8000), sampleSnapshot(1, 20000)];
    const samples = Array.from({ length: MIN_FLIGHT_VIDEO_SAMPLES }, (_, i) => ({
      timeMs: i * 400,
      features: sampleSnapshot(0, 0).features,
      params: sampleSnapshot(0, 0).params,
      spectrum: sampleSnapshot(0, 0).spectrum,
    }));
    const bundle = {
      audioBlob: new Blob(['audio'], { type: 'audio/webm' }),
      audioDurationMs: 5000,
      captureStartedAt: 1000,
      processSnapshots: snapshots,
      samples,
    };

    expect(canBuildFlightVideo({ cinemaBundle: bundle, processSnapshots: [] })).toBe(true);
    const plan = buildFlightVideoPlan({ cinemaBundle: bundle, processSnapshots: [] });
    expect(plan.fps).toBe(SYNCED_CINEMA_VIDEO_CONFIG.fps);
    expect(plan.audioBlob).not.toBeNull();
    expect(plan.plans.length).toBeGreaterThan(0);
  });

  it('falls back to process timeline with two stages', () => {
    const snapshots = [sampleSnapshot(0, 8000), sampleSnapshot(1, 20000)];
    expect(canBuildFlightVideo({ cinemaBundle: null, processSnapshots: snapshots })).toBe(true);
    const plan = buildFlightVideoPlan({ cinemaBundle: null, processSnapshots: snapshots });
    expect(plan.plans.length).toBeGreaterThan(0);
    expect(plan.plans.every((p) => p.snapshot.params.pitchAngle === 0)).toBe(true);
  });
});

describe('cinemaVideoTimeline', () => {
  it('synced export ends exactly with audio duration', () => {
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
        { timeMs: 0, features: { ...sampleSnapshot(0, 0).features, rms: 0, isActive: false }, params: sampleSnapshot(0, 0).params, spectrum: sampleSnapshot(0, 0).spectrum, levelNorm: 0 },
        { timeMs: 900, features: sampleSnapshot(0, 0).features, params: sampleSnapshot(0, 0).params, spectrum: sampleSnapshot(0, 0).spectrum },
        { timeMs: 2500, features: sampleSnapshot(1, 0).features, params: sampleSnapshot(1, 0).params, spectrum: sampleSnapshot(1, 0).spectrum },
        { timeMs: 4800, features: sampleSnapshot(1, 0).features, params: sampleSnapshot(1, 0).params, spectrum: sampleSnapshot(1, 0).spectrum },
      ],
    };

    const plans = buildCinemaFramePlans(bundle, SYNCED_CINEMA_VIDEO_CONFIG);
    const times = buildFrameTimes(5000, 30);
    expect(plans.length).toBe(times.length);
    expect(plans.at(-1)?.timeMs).toBe(5000);
    expect(plans[0]?.timeMs).toBe(0);
    expect(plans[0]?.snapshot.features.rms).toBe(0);
  });

  it('legacy export keeps epilogue after content', () => {
    const snapshots = [sampleSnapshot(0, 8000), sampleSnapshot(1, 20000)];
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

    const plans = buildCinemaFramePlans(bundle, CINEMA_VIDEO_CONFIG);
    const expectedMin = Math.floor((5000 + CINEMA_VIDEO_CONFIG.morphToFinalMs + CINEMA_VIDEO_CONFIG.finalHoldMs) / (1000 / 30));
    expect(plans.length).toBeGreaterThan(expectedMin - 5);
    expect(plans.at(-1)?.snapshot.label).toBe('Итог');
  });
});
