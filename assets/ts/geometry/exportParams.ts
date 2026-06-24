import type { GeometryParams } from '../types';

/** Экспорт: чуть ярче, без подмены формы — голос должен читаться. */
export function boostParamsForExport(params: GeometryParams): GeometryParams {
  return {
    ...params,
    opacity: Math.min(params.opacity * 1.06 + 0.04, 1),
    lineWidth: Math.max(params.lineWidth, 0.55),
  };
}
