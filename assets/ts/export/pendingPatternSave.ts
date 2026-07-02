export type PatternSavePayload = {
  mode: string;
  geometryStyle: string;
  geometryParams: unknown;
  featureTimeline: unknown[];
  svg: string;
  voiceProfileHash: string | null;
};

const STORAGE_KEY = 'sgl-pending-pattern';

/** Удалить устаревший ключ из localStorage (раньше дублировал серверную сессию). */
export function clearPendingPatternSave(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Сохранить узор в PHP-сессии до OAuth. localStorage не используем — только серверная сессия. */
export async function stashPendingPatternSave(payload: PatternSavePayload): Promise<boolean> {
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
