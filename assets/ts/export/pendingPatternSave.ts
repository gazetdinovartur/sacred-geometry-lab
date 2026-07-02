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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function peekPendingPatternSave(): PatternSavePayload | null {
  const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.removeItem(STORAGE_KEY);
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

/** Сохранить узор в PHP-сессии до OAuth и продублировать в localStorage. */
export async function stashPendingPatternSave(payload: PatternSavePayload): Promise<boolean> {
  storePendingPatternSave(payload);

  try {
    const response = await fetch('/api/patterns/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** После входа: отправить отложенный узор на сервер и очистить storage. */
export async function flushPendingPatternSave(): Promise<{ id: number; title: string } | null> {
  const payload = peekPendingPatternSave();
  if (!payload) {
    return null;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const saved = await postPatternSave(payload);
      if (saved) {
        clearPendingPatternSave();
        return saved;
      }
    } catch {
      // retry below
    }

    if (attempt < 3) {
      await sleep(250 * (attempt + 1));
    }
  }

  return null;
}

export function hasPendingPatternSave(): boolean {
  return peekPendingPatternSave() !== null;
}
