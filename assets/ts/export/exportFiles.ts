import { pngBytesFromDataUrl } from './exportValidation';

export function downloadSvg(svg: string, filename = 'mandala.svg'): void {
  if (!svg || svg.length < 64) {
    throw new Error('SVG export is empty');
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadPng(dataUrl: string, filename = 'mandala.png'): void {
  const bytes = pngBytesFromDataUrl(dataUrl);
  triggerDownload(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  if (blob.size < 32) {
    throw new Error('Export file is empty');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function triggerDownloadBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename);
}
