const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type PitchInfo = {
  note: string;
  octave: number;
  cents: number;
  label: string;
  shortLabel: string;
};

/** Частота → нота и октава (равномерная темперация, A4 = 440 Hz). */
export function hzToPitch(hz: number): PitchInfo | null {
  if (hz <= 20) {
    return null;
  }

  const midi = 69 + 12 * Math.log2(hz / 440);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  const note = NOTE_NAMES[noteIndex];

  return {
    note,
    octave,
    cents,
    label: `${note}${octave}`,
    shortLabel: cents === 0 ? `${note}${octave}` : `${note}${octave} (${cents > 0 ? '+' : ''}${cents})`,
  };
}

/** Подпись для виджетов. */
export function formatPitchLabel(hz: number, pitchConfidence: number): string {
  if (hz <= 0) {
    return '—';
  }

  const pitch = hzToPitch(hz);
  if (!pitch) {
    return `${Math.round(hz)} Hz`;
  }

  if (pitchConfidence >= 0.45) {
    return pitch.shortLabel;
  }

  return `${pitch.label} · ~${Math.round(hz)} Hz`;
}

/** Крупная подпись в центре круга: нота + октава. */
export function formatCenterPitch(hz: number): string {
  if (hz <= 0) {
    return '—';
  }
  const pitch = hzToPitch(hz);
  return pitch?.label ?? `${Math.round(hz)} Hz`;
}

/** Вторая строка центра: Hz и уровень. */
export function formatCenterSubline(hz: number, levelPct: number): string {
  const hzPart = hz > 0 ? `${Math.round(hz)} Hz` : '— Hz';
  return `${hzPart} · ${levelPct}%`;
}
