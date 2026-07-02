import JSZip from 'jszip';
import { DEFAULT_EXPORT_SIZE, exportStyleLabel } from '../export/exportOptions';
import { downloadPng, downloadSvg, svgToPngDataUrl, triggerDownloadBlob } from '../export/exportFiles';
import { patternsPngZipFilename } from '../export/exportNames';
import { clearPendingPatternSave } from '../export/pendingPatternSave';
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
  userLabel: string | null;
  everHadPatterns: boolean;
  viewerPattern: SavedPattern | null;
  editingId: number | null;
  editTitle: string;
  renameError: string;
  downloadingArchive: boolean;
  init: () => void;
  styleLabel: (style: string) => string;
  modeLabel: (mode: string) => string;
  formatCreatedDate: (iso: string) => string;
  formatCreatedTime: (iso: string) => string;
  emptyStateTitle: () => string;
  emptyStateText: () => string;
  patternsCountLabel: () => string;
  openViewer: (pattern: SavedPattern) => void;
  closeViewer: () => void;
  stepViewer: (delta: number) => void;
  viewerHasPrev: () => boolean;
  viewerHasNext: () => boolean;
  viewerPositionLabel: () => string;
  handleViewerKey: (event: KeyboardEvent) => void;
  startRename: (pattern: SavedPattern) => void;
  cancelRename: () => void;
  saveRename: () => Promise<void>;
  downloadPattern: (pattern: SavedPattern) => void;
  downloadPatternPng: (pattern: SavedPattern) => Promise<void>;
  downloadPngArchive: () => Promise<void>;
  deletePattern: (id: number) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

function readAccountBootstrap(): { patterns: SavedPattern[]; userLabel: string | null } {
  const el = document.getElementById('sgl-account-data');
  if (!el?.textContent?.trim()) {
    return { patterns: [], userLabel: null };
  }

  try {
    const parsed = JSON.parse(el.textContent) as {
      patterns?: SavedPattern[];
      userLabel?: string | null;
    };
    const patterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
    const userLabel = typeof parsed.userLabel === 'string' && parsed.userLabel.trim() !== ''
      ? parsed.userLabel.trim()
      : null;

    return { patterns, userLabel };
  } catch {
    return { patterns: [], userLabel: null };
  }
}

function patternsCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} сохранённых узоров`;
  }
  if (mod10 === 1) {
    return `${count} сохранённый узор`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} сохранённых узора`;
  }

  return `${count} сохранённых узоров`;
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

function parseCreatedAt(iso: string): Date | null {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'process':
      return 'Процесс';
    case 'dialog':
      return 'Диалог';
    case 'live':
    default:
      return 'Момент';
  }
}

function formatCreatedDate(iso: string): string {
  const parsed = parseCreatedAt(iso);
  if (!parsed) {
    return iso;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

function formatCreatedTime(iso: string): string {
  const parsed = parseCreatedAt(iso);
  if (!parsed) {
    return '';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function scrollToHighlightedPattern(): void {
  const { hash } = window.location;
  if (!hash.startsWith('#pattern-')) {
    return;
  }

  window.requestAnimationFrame(() => {
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function viewerIndex(patterns: SavedPattern[], current: SavedPattern | null): number {
  if (!current) {
    return -1;
  }

  return patterns.findIndex((p) => p.id === current.id);
}

function isViewablePattern(pattern: SavedPattern | undefined): pattern is SavedPattern {
  return Boolean(pattern?.svg && pattern.svg.length >= 64);
}

function syncViewerHash(pattern: SavedPattern | null): void {
  const next = pattern ? `#pattern-${pattern.id}` : '';
  if (window.location.hash === next) {
    return;
  }

  history.replaceState(null, '', next || `${window.location.pathname}${window.location.search}`);
}

export function accountPage(): AccountPageData {
  const bootstrap = readAccountBootstrap();

  return {
    patterns: bootstrap.patterns,
    userLabel: bootstrap.userLabel,
    everHadPatterns: bootstrap.patterns.length > 0,
    viewerPattern: null,
    editingId: null,
    editTitle: '',
    renameError: '',
    downloadingArchive: false,

    init(): void {
      clearPendingPatternSave();
      scrollToHighlightedPattern();
    },

    styleLabel: exportStyleLabel,
    modeLabel,
    formatCreatedDate,
    formatCreatedTime,

    emptyStateTitle(): string {
      return this.everHadPatterns
        ? 'Узоров пока нет'
        : 'Здесь будут твои сохранённые узоры';
    },

    emptyStateText(): string {
      if (this.everHadPatterns) {
        return 'Ты удалил все сохранённые мандалы. После новой сессии на главной можно положить сюда следующий узор.';
      }

      return 'Сохрани первую мандалу после сессии — она появится в этой сетке.';
    },

    patternsCountLabel(): string {
      return patternsCountLabel(this.patterns.length);
    },

    openViewer(pattern: SavedPattern): void {
      if (!pattern.svg || pattern.svg.length < 64) {
        window.alert('SVG узора пуст — открыть нельзя');
        return;
      }

      this.viewerPattern = pattern;
      document.body.classList.add('sgl-viewer-open');
      syncViewerHash(pattern);
    },

    closeViewer(): void {
      this.viewerPattern = null;
      document.body.classList.remove('sgl-viewer-open');
      syncViewerHash(null);
    },

    stepViewer(delta: number): void {
      if (!this.viewerPattern || delta === 0) {
        return;
      }

      const idx = viewerIndex(this.patterns, this.viewerPattern);
      if (idx < 0) {
        return;
      }

      const next = this.patterns[idx + delta];
      if (!isViewablePattern(next)) {
        return;
      }

      this.viewerPattern = next;
      syncViewerHash(next);
    },

    viewerHasPrev(): boolean {
      const idx = viewerIndex(this.patterns, this.viewerPattern);
      return idx > 0 && isViewablePattern(this.patterns[idx - 1]);
    },

    viewerHasNext(): boolean {
      const idx = viewerIndex(this.patterns, this.viewerPattern);
      return idx >= 0
        && idx < this.patterns.length - 1
        && isViewablePattern(this.patterns[idx + 1]);
    },

    viewerPositionLabel(): string {
      const idx = viewerIndex(this.patterns, this.viewerPattern);
      if (idx < 0 || this.patterns.length === 0) {
        return '';
      }

      return `${idx + 1} / ${this.patterns.length}`;
    },

    handleViewerKey(event: KeyboardEvent): void {
      if (!this.viewerPattern) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.stepViewer(-1);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.stepViewer(1);
      }
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

    async downloadPatternPng(pattern: SavedPattern): Promise<void> {
      if (!pattern.svg || pattern.svg.length < 64) {
        window.alert('SVG узора пуст — скачать нельзя');
        return;
      }

      try {
        const dataUrl = await svgToPngDataUrl(pattern.svg, DEFAULT_EXPORT_SIZE);
        downloadPng(dataUrl, patternFilename(pattern, 'png'));
      } catch {
        window.alert('Не удалось собрать PNG');
      }
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
        if (this.viewerPattern?.id === id) {
          this.closeViewer();
        }
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
