import JSZip from 'jszip';
import type { ExportStyle, ExportSize } from './exportOptions';
import { DEFAULT_EXPORT_SIZE } from './exportOptions';
import type { FeatureSnapshot } from '../types';
import {
  exportMandalaPng,
  sessionReportText,
} from './mandalaExport';
import type { VoiceProfileMetrics } from '../audio/VoiceProfile';
import { triggerDownloadBlob } from './exportFiles';
import { sessionZipFilename } from './exportNames';
import { pngBytesFromDataUrl } from './exportValidation';
import { buildSessionComposite } from './sessionComposite';

/** Покадровый экспорт Process → ZIP (только PNG) с отчётом. */
export async function exportSessionFrames(
  snapshots: FeatureSnapshot[],
  style: ExportStyle,
  profile?: VoiceProfileMetrics,
  size: ExportSize = DEFAULT_EXPORT_SIZE,
): Promise<string> {
  if (snapshots.length === 0) {
    return '';
  }

  const filename = sessionZipFilename();
  const zip = new JSZip();
  const composite = buildSessionComposite(snapshots);

  for (let i = 0; i < snapshots.length; i += 1) {
    const snap = snapshots[i];
    const png = pngBytesFromDataUrl(exportMandalaPng(snap, style, size));
    const stem = `frame-${String(i + 1).padStart(3, '0')}`;
    zip.file(`${stem}.png`, png);
  }

  zip.file('frame-000-itog.png', pngBytesFromDataUrl(exportMandalaPng(composite, style, size)));
  zip.file('session-report.txt', sessionReportText(snapshots, profile, style));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownloadBlob(blob, filename);
  return filename;
}
