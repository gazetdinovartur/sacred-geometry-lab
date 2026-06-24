/** R при экспорте 800×800 (params.radius = 200). База для масштабирования штриха. */
export const REF_MANDALA_R = 384;

/** Пиксели, масштабированные от эталонного R — линии и точки остаются чёткими на 1600/3200. */
export function u(R: number, pxAtRef: number): number {
  return pxAtRef * (R / REF_MANDALA_R);
}
