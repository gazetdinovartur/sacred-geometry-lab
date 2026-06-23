import type { GeometryParams } from '../types';

/** Во время звука — полная реакция. */
export function applySilenceLive(params: GeometryParams): GeometryParams {
  return { ...params, breathRing: 0 };
}

/** В тишине — форма медленно тускнеет, не исчезает мгновенно. */
export function applySilenceFade(base: GeometryParams, pauseMs: number, silenceRatio: number): GeometryParams {
  const fade = Math.min(Math.max(Math.max(silenceRatio, pauseMs / 7000), 0), 1);
  const breath = Math.min(pauseMs / 2500, 1);

  return {
    ...base,
    rotationSpeed: base.rotationSpeed * (1 - fade * 0.75),
    breathRing: breath,
    opacity: Math.max(base.opacity * (1 - fade * 0.5), 0.14),
    radius: Math.max(base.radius * (1 - fade * 0.12) + breath * 10, base.radius * 0.55),
  };
}

export function formatSilenceLabel(silenceRatio: number, pauseMs: number): string {
  if (pauseMs < 200) {
    return 'звук';
  }
  if (silenceRatio > 0.5 || pauseMs > 1200) {
    return 'покой';
  }
  return 'тускнеет';
}
