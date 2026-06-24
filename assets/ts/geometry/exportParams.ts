import type { GeometryParams } from '../types';

const EXPORT_RADIUS = 200;

/** Экспорт: фиксированный масштаб и чуть ярче — громкость не сжимает мандалу. */
export function boostParamsForExport(params: GeometryParams): GeometryParams {
  return {
    ...params,
    radius: EXPORT_RADIUS,
    opacity: Math.min(params.opacity * 1.06 + 0.04, 1),
    lineWidth: Math.max(params.lineWidth, 0.55),
  };
}
