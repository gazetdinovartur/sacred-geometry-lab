import { describe, expect, it, vi } from 'vitest';
import { symmetryFromRhythm, blendGeometryParams } from '../geometry/SymmetryResolver';
import { applySilenceFade } from '../geometry/SilenceMapper';
import { mapFeaturesToGeometry } from '../geometry/MappingEngine';
import { VoiceProfile, CALIBRATION_DURATION_MS } from '../audio/VoiceProfile';
import { CalibrationRunner } from '../lab/CalibrationRunner';
import { pngBytesFromDataUrl, sanitizeGeometryParams } from '../export/exportValidation';
import type { AudioFeatures } from '../types';

describe('SymmetryResolver', () => {
  it('maps rhythm onsets to symmetry', () => {
    expect(symmetryFromRhythm(3)).toBe(3);
    expect(symmetryFromRhythm(4)).toBe(4);
    expect(symmetryFromRhythm(7)).toBe(7);
  });
});

describe('SilenceMapper', () => {
  it('fades form slowly during silence', () => {
    const profile = new VoiceProfile();
    profile.skipCalibration();
    const norm = profile.normalizeFeatures(sampleFeatures());
    const base = mapFeaturesToGeometry(sampleFeatures(), norm);
    const faded = applySilenceFade(base, 3500, 0.6);
    expect(faded.rotationSpeed).toBeLessThan(base.rotationSpeed);
    expect(faded.opacity).toBeLessThan(base.opacity);
    expect(faded.opacity).toBeGreaterThan(0.12);
    expect(faded.radius).toBeLessThan(base.radius * 1.05);
    expect(faded.radius).toBeGreaterThan(base.radius * 0.5);
  });
});

describe('GeometryPipeline', () => {
  it('fades when silent after sound', async () => {
    const { GeometryPipeline } = await import('../geometry/GeometryPipeline');
    const profile = new VoiceProfile();
    profile.skipCalibration();
    const pipeline = new GeometryPipeline();
    const loud = { ...sampleFeatures(), rms: 0.15, silenceRatio: 0, pauseMs: 0 };
    const norm = profile.normalizeFeatures(loud);
    const held = pipeline.resolve(loud, norm);
    const silent = pipeline.resolve({ ...sampleFeatures(), rms: 0.001, silenceRatio: 0.7, pauseMs: 3500 }, norm);
    expect(silent.opacity).toBeLessThan(held.opacity);
    expect(silent.opacity).toBeGreaterThan(0.12);
  });
});

describe('Process composite', () => {
  it('blends snapshot params', () => {
    const profile = new VoiceProfile();
    profile.skipCalibration();
    const norm = profile.normalizeFeatures(sampleFeatures());
    const p = mapFeaturesToGeometry(sampleFeatures(), norm);
    const blended = blendGeometryParams([{ params: p }, { params: { ...p, radius: p.radius + 20 } }]);
    expect(blended.radius).toBeGreaterThan(p.radius);
  });
});

describe('MappingEngine', () => {
  it('maps one acoustic param per geometry field', () => {
    const profile = new VoiceProfile();
    profile.skipCalibration();
    const quiet = profile.normalizeFeatures({ ...sampleFeatures(), rms: 0.02, frequency: 120 });
    const loud = profile.normalizeFeatures({ ...sampleFeatures(), rms: 0.2, frequency: 380 });
    const q = mapFeaturesToGeometry(sampleFeatures(), quiet);
    const l = mapFeaturesToGeometry(sampleFeatures(), loud);
    expect(l.radius).toBeGreaterThan(q.radius);
    expect(l.rays).toBeGreaterThanOrEqual(q.rays);
  });
});

describe('VoiceProfile calibration', () => {
  it('normalizes safely while bounds are still open', () => {
    const profile = new VoiceProfile();
    profile.beginSessionCalibration();
    const norm = profile.normalizeFeatures({
      rms: 0.08,
      frequency: 0,
      spectralCentroid: 1200,
      spectralFlux: 0.02,
      harmonicCount: 3,
      silenceRatio: 0,
      pauseMs: 0,
      recentOnsets: 0,
      rhythmSymmetry: 4,
    });
    expect(Number.isFinite(norm.rms)).toBe(true);
    expect(norm.rms).toBeGreaterThan(0.05);
  });

  it('finishes even without detected pitch', () => {
    const profile = new VoiceProfile();
    profile.beginSessionCalibration();
    profile.addCalibrationSample({
      rms: 0.1,
      frequency: 0,
      spectralCentroid: 1400,
      spectralFlux: 0.03,
      harmonicCount: 2,
      silenceRatio: 0,
      pauseMs: 0,
      recentOnsets: 0,
      rhythmSymmetry: 4,
    });
    profile.skipCalibration();
    expect(profile.isCalibrated()).toBe(true);
  });
});

describe('CalibrationRunner', () => {
  it('advances progress on timer without audio frames', () => {
    vi.useFakeTimers();
    const profile = new VoiceProfile();
    const runner = new CalibrationRunner(profile);
    const progress: number[] = [];
    let completed = false;

    runner.start(
      (ui) => progress.push(ui.progress),
      () => { completed = true; },
    );

    expect(progress[0]).toBe(0);
    vi.advanceTimersByTime(6000);
    expect(progress.at(-1)).toBeGreaterThan(40);
    vi.advanceTimersByTime(CALIBRATION_DURATION_MS);
    expect(completed).toBe(true);
    expect(profile.isCalibrated()).toBe(true);
    vi.useRealTimers();
  });
});

describe('export validation', () => {
  it('rejects empty PNG data URLs', () => {
    expect(() => pngBytesFromDataUrl('data:image/png;base64,')).toThrow();
    expect(() => pngBytesFromDataUrl('data:,')).toThrow();
  });

  it('sanitizes invalid geometry params', () => {
    const params = sanitizeGeometryParams({
      radius: NaN,
      rays: Infinity,
      rotationSpeed: 0,
      hue: NaN,
      opacity: NaN,
      symmetry: 0,
      breathRing: 0,
      lineWidth: NaN,
      waveAmplitude: 0,
      spiralTurns: 0,
      dotCount: 0,
      elementCount: 0,
      pitchAngle: 0,
    });
    expect(Number.isFinite(params.radius)).toBe(true);
    expect(params.radius).toBeGreaterThan(40);
    expect(params.opacity).toBeGreaterThanOrEqual(0.35);
  });
});

describe('VoiceProfile spectrum gain', () => {
  it('scales up toward calibrated max loudness', () => {
    const profile = new VoiceProfile();
    profile.skipCalibration();
    const quiet = profile.spectrumGain(0.02);
    const loud = profile.spectrumGain(0.2);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeGreaterThan(0.85);
  });
});

function sampleFeatures(): AudioFeatures {
  return {
    rms: 0.12,
    frequency: 220,
    spectralCentroid: 1800,
    spectralFlux: 0.05,
    harmonicCount: 4,
    silenceRatio: 0,
    pauseMs: 0,
    recentOnsets: 4,
    rhythmSymmetry: 4,
  };
}
