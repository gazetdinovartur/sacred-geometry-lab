import JSZip from 'jszip';
import type { FeatureSnapshot, GeometryStyle } from '../types';
import {
  exportMandalaPng,
  exportMandalaSvg,
  sessionReportText,
} from './mandalaExport';
import { triggerDownloadBlob } from './exportFiles';
import { pngBytesFromDataUrl } from './exportValidation';

/** Покадровый экспорт Process → ZIP с мандалами и отчётом. */
export async function exportSessionFrames(
  snapshots: FeatureSnapshot[],
  style: GeometryStyle,
): Promise<void> {
  if (snapshots.length === 0) {
    return;
  }

  const zip = new JSZip();

  for (let i = 0; i < snapshots.length; i += 1) {
    const snap = snapshots[i];
    const png = pngBytesFromDataUrl(exportMandalaPng(snap, style));
    const svg = exportMandalaSvg(snap, style);
    const stem = `frame-${String(i + 1).padStart(3, '0')}`;
    zip.file(`${stem}.png`, png);
    zip.file(`${stem}.svg`, svg);
  }

  const composite = blendSnapshots(snapshots);
  zip.file('frame-000-itog.png', pngBytesFromDataUrl(exportMandalaPng(composite, style)));
  zip.file('frame-000-itog.svg', exportMandalaSvg(composite, style));
  zip.file('session-report.txt', sessionReportText(snapshots));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownloadBlob(blob, 'sgl-session.zip');
}

function blendSnapshots(snapshots: FeatureSnapshot[]): FeatureSnapshot {
  const last = snapshots[snapshots.length - 1];
  const mergedTrail = snapshots.flatMap((s) => s.pitchTrail ?? []);
  const avgSpectrum = averageSpectrum(snapshots);

  return {
    ...last,
    label: 'Итог',
    pitchTrail: mergedTrail,
    spectrum: avgSpectrum,
  };
}

function averageSpectrum(snapshots: FeatureSnapshot[]): number[] | undefined {
  const withSpectrum = snapshots.filter((s) => s.spectrum?.length);
  if (withSpectrum.length === 0) {
    return undefined;
  }

  const len = withSpectrum[0].spectrum!.length;
  const avg = new Array(len).fill(0);
  withSpectrum.forEach((snap) => {
    snap.spectrum!.forEach((v, i) => {
      avg[i] += v;
    });
  });
  return avg.map((v) => v / withSpectrum.length);
}
