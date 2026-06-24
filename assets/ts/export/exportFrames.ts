import JSZip from 'jszip';
import type { LabRenderer } from '../geometry/LabRenderer';
import type { FeatureSnapshot } from '../types';
import { triggerDownloadBlob } from './exportFiles';

/** Покадровый экспорт Process → ZIP с PNG. */
export async function exportSessionFrames(
  renderer: LabRenderer,
  snapshots: FeatureSnapshot[],
): Promise<void> {
  if (snapshots.length === 0) {
    return;
  }

  const zip = new JSZip();

  for (let i = 0; i < snapshots.length; i += 1) {
    renderer.renderSnapshot(snapshots[i]);
    await waitFrames(3);
    const png = pngFromDataUrl(renderer.exportPng());
    zip.file(`frame-${String(i + 1).padStart(3, '0')}.png`, png);
  }

  renderer.renderComposite(snapshots);
  await waitFrames(3);
  zip.file('frame-000-itog.png', pngFromDataUrl(renderer.exportPng()));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownloadBlob(blob, 'mandala-frames.zip');
}

function pngFromDataUrl(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(',');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const step = (): void => {
      left -= 1;
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
