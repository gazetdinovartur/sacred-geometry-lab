import type { GeometryParams } from '../types';

export type SessionFingerprint = {
  hueShift: number;
  scaleJitter: number;
  starSkew: number;
};

/** Детерминированная уникальность сессии: профиль + день + время старта. */
export function sessionFingerprint(profileHash: string, sessionStarted: number): SessionFingerprint {
  const day = new Date(sessionStarted).toISOString().slice(0, 10);
  const seed = hashString(`${profileHash}|${day}|${sessionStarted}`);
  return {
    hueShift: ((seed % 360) / 360) * 18 - 9,
    scaleJitter: 0.94 + ((seed >> 8) % 120) / 1000,
    starSkew: (((seed >> 16) % 200) - 100) / 8000,
  };
}

export function applySessionVariety(
  params: GeometryParams,
  profileHash: string,
  sessionStarted: number,
): GeometryParams {
  const fp = sessionFingerprint(profileHash, sessionStarted);
  return {
    ...params,
    hue: params.hue + fp.hueShift,
    radius: params.radius * fp.scaleJitter,
    pitchAngle: params.pitchAngle + fp.starSkew,
  };
}

export function pitchShimmerJitter(features: { frequency: number; spectralFlux: number }): number {
  if (features.frequency <= 0) {
    return features.spectralFlux * 0.015;
  }
  const micro = (features.frequency % 13) / 13000;
  return micro + features.spectralFlux * 0.012;
}

function hashString(raw: string): number {
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
