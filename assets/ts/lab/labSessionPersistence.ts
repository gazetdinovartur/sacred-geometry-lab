import type { ExportStyle } from '../export/exportOptions';
import type { FeatureSnapshot, LabMode, PitchPoint } from '../types';

const STORAGE_KEY = 'sgl-lab-session';
const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PersistedLabSession = {
  version: typeof VERSION;
  savedAt: number;
  mode: LabMode;
  exportStyle: ExportStyle;
  frozenIndex: number | null;
  activeSnapshot: number | null;
  lastSnapshot: FeatureSnapshot;
  processSnapshots: FeatureSnapshot[];
  composite: FeatureSnapshot | null;
  pitchTrail: PitchPoint[];
  voiceAccumMs: number;
  sessionStarted: number;
  toneLabel: string;
  silenceLabel: string;
  rmsNorm: number;
};

export function clearLabSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveLabSession(
  data: Omit<PersistedLabSession, 'version' | 'savedAt'>,
): void {
  try {
    const payload: PersistedLabSession = {
      version: VERSION,
      savedAt: Date.now(),
      ...data,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota or private mode — ignore
  }
}

export function loadLabSession(): PersistedLabSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw) as PersistedLabSession;
    if (data.version !== VERSION || !data.lastSnapshot?.params) {
      return null;
    }

    if (Date.now() - data.savedAt > MAX_AGE_MS) {
      clearLabSession();
      return null;
    }

    return data;
  } catch {
    return null;
  }
}
