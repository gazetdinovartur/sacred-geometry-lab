import type { GeometryStyle } from '../types';

/** Два визуальных режима экспорта. «Слои» рендерятся как flower. */
export type ExportStyle = 'dots' | 'layers';

export type ExportAction = 'png' | 'svg' | 'zip' | 'video' | 'cinema' | 'save';

export type ExportSize = 800 | 1600 | 3200;

export const DEFAULT_EXPORT_SIZE: ExportSize = 1600;

export const EXPORT_SIZE_OPTIONS: { value: ExportSize; label: string }[] = [
  { value: 1600, label: '1600×1600' },
  { value: 800, label: '800×800' },
  { value: 3200, label: '3200×3200' },
];

export const EXPORT_STYLE_OPTIONS: { value: ExportStyle; label: string }[] = [
  { value: 'dots', label: 'Точечная мандала' },
  { value: 'layers', label: 'Слои (линии)' },
];

export function exportActionLabel(action: ExportAction): string {
  switch (action) {
    case 'png':
      return 'Скачать PNG';
    case 'svg':
      return 'Скачать SVG';
    case 'zip':
      return 'Скачать ZIP сессии';
    case 'video':
      return 'Скачать видео · 3D';
    case 'cinema':
      return 'Скачать Видео · Мандала';
    case 'save':
      return 'Сохранить в своё место';
    default:
      return 'Выполнить';
  }
}

export function resolveRenderStyle(style: ExportStyle): GeometryStyle {
  return style === 'layers' ? 'flower' : 'dots';
}

export function exportStyleLabel(style: ExportStyle | string): string {
  const found = EXPORT_STYLE_OPTIONS.find((o) => o.value === style);
  if (found) {
    return found.label;
  }
  if (style === 'flower' || style === 'seed' || style === 'classic' || style === 'yantra') {
    return 'Слои (линии)';
  }
  return String(style);
}
