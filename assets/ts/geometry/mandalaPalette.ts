import paper from 'paper';

export type MandalaPalette = {
  bg: paper.Color;
  primary: paper.Color;
  secondary: paper.Color;
  muted: paper.Color;
  fill: paper.Color;
};

function cssVar(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

function cssColor(name: string, fallback: string): paper.Color {
  try {
    return new paper.Color(cssVar(name, fallback));
  } catch {
    return new paper.Color(fallback);
  }
}

/** Палитра экспорта: accent темы + лёгкий оттенок голоса, без «радуги» и голубого фона. */
export function buildMandalaPalette(voiceHue: number): MandalaPalette {
  const accent = cssColor('--accent', '#a898d8');
  const text = cssColor('--text', '#e8e4dc');
  const bg = cssColor('--canvas-bg', '#1a1820');
  const muted = cssColor('--text-muted', '#9a92aa');

  const voice = new paper.Color({
    hue: voiceHue % 360,
    saturation: 0.38,
    brightness: 0.9,
  });

  const primary = mixColors(accent, voice, 0.18);
  const secondary = mixColors(text, accent, 0.42);
  const fill = mixColors(primary, bg, 0.82);

  return { bg, primary, secondary, muted, fill };
}

export function paletteStroke(color: paper.Color, opacity: number): paper.Color {
  const c = color.clone();
  c.alpha = Math.min(Math.max(opacity, 0.12), 0.98);
  return c;
}

function mixColors(a: paper.Color, b: paper.Color, t: number): paper.Color {
  return new paper.Color(
    a.red + (b.red - a.red) * t,
    a.green + (b.green - a.green) * t,
    a.blue + (b.blue - a.blue) * t,
  );
}
