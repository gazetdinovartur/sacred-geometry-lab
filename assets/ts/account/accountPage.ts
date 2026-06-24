import JSZip from 'jszip';
import { VoiceProfile } from '../audio/VoiceProfile';
import { DEFAULT_EXPORT_SIZE, exportStyleLabel } from '../export/exportOptions';
import { downloadSvg, svgToPngDataUrl, triggerDownloadBlob } from '../export/exportFiles';
import { patternsPngZipFilename } from '../export/exportNames';
import { pngBytesFromDataUrl } from '../export/exportValidation';

export type SavedPattern = {
  id: number;
  title: string;
  mode: string;
  geometryStyle: string;
  createdAt: string;
  svg: string;
};

type AccountPageData = {
  patterns: SavedPattern[];
  voiceStatus: string;
  editingId: number | null;
  editTitle: string;
  renameError: string;
  downloadingArchive: boolean;
  styleLabel: (style: string) => string;
  resetVoiceProfile: () => void;
  startRename: (pattern: SavedPattern) => void;
  cancelRename: () => void;
  saveRename: () => Promise<void>;
  downloadPattern: (pattern: SavedPattern) => void;
  downloadPngArchive: () => Promise<void>;
  deletePattern: (id: number) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

function readInitialPatterns(): SavedPattern[] {
  const el = document.getElementById('sgl-account-patterns');
  if (!el?.textContent?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(el.textContent) as SavedPattern[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function patternFilename(pattern: SavedPattern, ext: 'svg' | 'png'): string {
  const slug = pattern.title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'mandala';

  return `sgl-${slug}-${pattern.id}.${ext}`;
}

export function accountPage(): AccountPageData {
  const profile = new VoiceProfile();

  return {
    patterns: readInitialPatterns(),
    voiceStatus: profile.isCalibrated()
      ? `Текущий хеш: ${profile.getHash()}.`
      : 'Профиль ещё формируется — начните сессию на главной.',
    editingId: null,
    editTitle: '',
    renameError: '',
    downloadingArchive: false,
    styleLabel: exportStyleLabel,

    resetVoiceProfile(): void {
      profile.reset();
      this.voiceStatus = 'Профиль сброшен. Новая калибровка начнётся при следующей сессии.';
    },

    startRename(pattern: SavedPattern): void {
      this.editingId = pattern.id;
      this.editTitle = pattern.title;
      this.renameError = '';
    },

    cancelRename(): void {
      this.editingId = null;
      this.editTitle = '';
      this.renameError = '';
    },

    async saveRename(): Promise<void> {
      if (this.editingId === null) {
        return;
      }

      const id = this.editingId;
      const title = this.editTitle.trim() || 'Узор';

      const response = await fetch(`/api/patterns/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        this.renameError = 'Не удалось сохранить название';
        return;
      }

      const data = await response.json() as { title?: string };
      const nextTitle = data.title ?? title;
      this.patterns = this.patterns.map((p) => (
        p.id === id ? { ...p, title: nextTitle } : p
      ));
      this.cancelRename();
    },

    downloadPattern(pattern: SavedPattern): void {
      if (!pattern.svg || pattern.svg.length < 64) {
        window.alert('SVG узора пуст — скачать нельзя');
        return;
      }

      downloadSvg(pattern.svg, patternFilename(pattern, 'svg'));
    },

    async downloadPngArchive(): Promise<void> {
      if (this.patterns.length === 0) {
        return;
      }

      this.downloadingArchive = true;
      try {
        const zip = new JSZip();
        const size = DEFAULT_EXPORT_SIZE;

        for (const pattern of this.patterns) {
          if (!pattern.svg || pattern.svg.length < 64) {
            continue;
          }
          const dataUrl = await svgToPngDataUrl(pattern.svg, size);
          zip.file(patternFilename(pattern, 'png'), pngBytesFromDataUrl(dataUrl));
        }

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        triggerDownloadBlob(blob, patternsPngZipFilename());
      } catch {
        window.alert('Не удалось собрать PNG-архив');
      } finally {
        this.downloadingArchive = false;
      }
    },

    async deletePattern(id: number): Promise<void> {
      if (!window.confirm('Удалить этот узор?')) {
        return;
      }

      const response = await fetch(`/api/patterns/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (response.ok || response.status === 204) {
        this.patterns = this.patterns.filter((p) => p.id !== id);
      }
    },

    async deleteAccount(): Promise<void> {
      if (!window.confirm('Удалить аккаунт и все узоры? Это необратимо.')) {
        return;
      }

      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (response.ok || response.status === 204) {
        window.location.href = '/';
      }
    },
  };
}
