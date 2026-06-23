export function downloadSvg(svg: string, filename = 'mandala.svg'): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadPng(dataUrl: string, filename = 'mandala.png'): void {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  triggerDownload(new Blob([bytes], { type: mime }), filename);
}

function triggerDownload(blob: Blob, filename: string): void {
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
