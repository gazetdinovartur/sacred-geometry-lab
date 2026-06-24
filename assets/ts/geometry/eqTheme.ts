export type EqTheme = {
  bg: string;
  accent: string;
  accentSoft: string;
  text: string;
  textMuted: string;
  border: string;
  bar: string;
  barDim: string;
};

export function readEqTheme(): EqTheme {
  const root = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string): string => {
    const raw = root.getPropertyValue(name).trim();
    return raw || fallback;
  };

  return {
    bg: pick('--canvas-bg', '#16141c'),
    accent: pick('--accent', '#8b7ab8'),
    accentSoft: pick('--accent-soft', 'rgba(139, 122, 184, 0.2)'),
    text: pick('--text', '#ece8f4'),
    textMuted: pick('--text-muted', '#9a92aa'),
    border: pick('--border', '#2e2a38'),
    bar: pick('--accent', '#a898d8'),
    barDim: pick('--text-muted', '#5c5568'),
  };
}
