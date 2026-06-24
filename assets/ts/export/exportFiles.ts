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

const PNG_EXPORT_SIZE = 1600;

/** SVG → PNG data URL (для скачивания из кабинета). */
export function svgToPngDataUrl(svg: string, size = PNG_EXPORT_SIZE): Promise<string> {
  if (!svg || svg.length < 64) {
    return Promise.reject(new Error('SVG is empty'));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl.startsWith('data:image/png')) {
        reject(new Error('PNG conversion failed'));
        return;
      }
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG load failed'));
    };

    img.src = url;
  });
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
