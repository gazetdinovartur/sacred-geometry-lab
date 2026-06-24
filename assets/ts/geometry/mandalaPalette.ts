import paper from 'paper';

export type MandalaPalette = {
  bg: paper.Color;
  primary: paper.Color;
  secondary: paper.Color;
  muted: paper.Color;
  line: paper.Color;
  fill: paper.Color;
};

/** Семь чакр: красный → оранж → жёлтый → зелёный → голубой → индиго → фиолетовый. */
const CHAKRA_HUES = [4, 28, 48, 128, 205, 265, 292] as const;

const CHAKRA_CENTROID_MIN = 80;
const CHAKRA_CENTROID_MAX = 9000;

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

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** t ∈ [0,1]: низ → красный, верх → фиолетовый. */
export function chakraHueFromT(t: number): number {
  const pos = clamp01(t) * (CHAKRA_HUES.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  if (i >= CHAKRA_HUES.length - 1) {
    return CHAKRA_HUES[CHAKRA_HUES.length - 1];
  }
  const a = CHAKRA_HUES[i];
  const b = CHAKRA_HUES[i + 1];
  return a + (b - a) * frac;
}

/** Центроид / f₀ → чакровый оттенок (логарифмическая шкала). */
export function chakraHueFromHz(hz: number, fallbackT = 0.45): number {
  if (!Number.isFinite(hz) || hz <= 0) {
    return chakraHueFromT(fallbackT);
  }
  const lo = Math.log(CHAKRA_CENTROID_MIN);
  const hi = Math.log(CHAKRA_CENTROID_MAX);
  const t = (Math.log(Math.max(hz, CHAKRA_CENTROID_MIN)) - lo) / (hi - lo);
  return chakraHueFromT(t);
}

export function chakraPaperColor(
  hue: number,
  saturation: number,
  brightness: number,
): paper.Color {
  return new paper.Color({
    hue: hue % 360,
    saturation: Math.min(Math.max(saturation, 0.35), 1),
    brightness: Math.min(Math.max(brightness, 0.55), 1),
  });
}

/** Палитра из CSS-темы + лёгкий оттенок голоса. */
export function buildMandalaPalette(voiceHue: number): MandalaPalette {
  const accent = cssColor('--accent', '#a898d8');
  const text = cssColor('--text', '#e8e4dc');
  const bg = cssColor('--canvas-bg', '#1a1820');
  const muted = cssColor('--text-muted', '#9a92aa');
  const line = cssColor('--line', '#ddd6f0');

  const voice = chakraPaperColor(voiceHue, 0.38, 0.86);

  const primary = mixColors(accent, voice, 0.2);
  const secondary = mixColors(line, voice, 0.28);
  const fill = mixColors(primary, bg, 0.82);

  return { bg, primary, secondary, muted, line, fill };
}

/**
 * Цвет точки: чакровая шкала по полосе спектра + оттенок кольца (центроид этапа).
 */
export function ringBandColor(
  palette: MandalaPalette,
  bandIndex: number,
  bandCount: number,
  depth: number,
  ringCentroidHz: number,
  ringIndex = 0,
  ringCount = 1,
  level = 0.5,
): paper.Color {
  const bandT = bandCount <= 1 ? 0.5 : bandIndex / (bandCount - 1);
  const ringT = ringCount <= 1 ? depth : ringIndex / Math.max(ringCount - 1, 1);

  const bandHue = chakraHueFromT(bandT);
  const ringHue = chakraHueFromHz(ringCentroidHz, ringT);
  const radialHue = chakraHueFromT(ringT * 0.9 + 0.05);

  const hue = (bandHue * 0.62 + ringHue * 0.23 + radialHue * 0.15) % 360;
  const saturation = 0.56 + level * 0.26 + depth * 0.1;
  const brightness = 0.7 + level * 0.2 + bandT * 0.1;

  const chakra = chakraPaperColor(hue, saturation, brightness);
  return mixColors(chakra, palette.line, 0.06);
}

/** Цвет для спирали pitch: низкий голос — краснее, высокий — фиолетовее. */
export function spiralChakraColor(
  palette: MandalaPalette,
  pitchNorm: number,
  opacity: number,
): paper.Color {
  const hue = chakraHueFromT(clamp01(pitchNorm));
  const c = chakraPaperColor(hue, 0.52 + opacity * 0.2, 0.74 + opacity * 0.16);
  return mixColors(c, palette.muted, 0.12);
}

/** Ядро bindu — центроид сессии на чакровой шкале. */
export function binduChakraColor(
  palette: MandalaPalette,
  centroidHz: number,
  rms: number,
): paper.Color {
  const hue = chakraHueFromHz(centroidHz, 0.42);
  const c = chakraPaperColor(hue, 0.62 + rms * 0.2, 0.82 + rms * 0.1);
  return mixColors(c, palette.primary, 0.15);
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
