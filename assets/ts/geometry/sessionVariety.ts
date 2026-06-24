import type { GeometryParams } from '../types';
import { signalPitchJitter } from './dotMandalaMath';

export type SessionFingerprint = {
  hueShift: number;
  scaleJitter: number;
  starSkew: number;
};

/** @deprecated Уникальность только из сигнала — hash сессии больше не применяется. */
export function applySessionVariety(
  params: GeometryParams,
  _profileHash: string,
  _sessionStarted: number,
): GeometryParams {
  return params;
}

/** @deprecated Используйте signalPitchJitter из dotMandalaMath. */
export function pitchShimmerJitter(features: Parameters<typeof signalPitchJitter>[0]): number {
  return signalPitchJitter(features);
}

export function sessionFingerprint(_profileHash: string, _sessionStarted: number): SessionFingerprint {
  return { hueShift: 0, scaleJitter: 1, starSkew: 0 };
}
