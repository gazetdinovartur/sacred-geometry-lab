import { describe, expect, it } from 'vitest';
import { symmetryFromRhythm, blendGeometryParams } from '../geometry/SymmetryResolver';
import { applySilenceFade } from '../geometry/SilenceMapper';
import { mapFeaturesToGeometry } from '../geometry/MappingEngine';
import { VoiceProfile } from '../audio/VoiceProfile';
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
