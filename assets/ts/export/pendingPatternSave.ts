export type PatternSavePayload = {
  mode: string;
  geometryStyle: string;
  geometryParams: unknown;
  featureTimeline: unknown[];
  svg: string;
  voiceProfileHash: string | null;
};

const STORAGE_KEY = 'sgl-pending-pattern';

export function storePendingPatternSave(payload: PatternSavePayload): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function peekPendingPatternSave(): PatternSavePayload | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PatternSavePayload;
    if (typeof parsed.mode !== 'string' || typeof parsed.svg !== 'string') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingPatternSave(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function postPatternSave(payload: PatternSavePayload): Promise<{ id: number; title: string } | null> {
  const response = await fetch('/api/patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('pattern save failed');
  }

  const data = await response.json() as { id?: number; title?: string };
  if (typeof data.id !== 'number') {
    throw new Error('pattern save response invalid');
  }

  return {
    id: data.id,
    title: data.title?.trim() || 'Узор',
  };
}

/** После входа: отправить отложенный узор на сервер и очистить storage. */
export async function flushPendingPatternSave(): Promise<{ id: number; title: string } | null> {
  const payload = peekPendingPatternSave();
  if (!payload) {
    return null;
  }

  try {
    const saved = await postPatternSave(payload);
    if (saved) {
      clearPendingPatternSave();
    }

    return saved;
  } catch {
    return null;
  }
}

export function hasPendingPatternSave(): boolean {
  return peekPendingPatternSave() !== null;
}
