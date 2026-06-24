import * as THREE from 'three';

const hsl = { h: 0, s: 0, l: 0 };

function cssColor(varName: string, fallback: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
  try {
    return new THREE.Color(raw);
  } catch {
    return new THREE.Color(fallback);
  }
}

export function lineBaseColor(): THREE.Color {
  return cssColor('--line', '#2a2840');
}

export function accentColor(): THREE.Color {
  return cssColor('--accent', '#6b5b95');
}

export function readCanvasBg(): THREE.Color {
  const wrap = document.querySelector('.mandala-frame') ?? document.querySelector('.lab__stage');
  const source = wrap ?? document.documentElement;
  const raw = getComputedStyle(source).getPropertyValue('--canvas-bg').trim()
    || getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim()
    || '#1a1820';
  try {
    return new THREE.Color(raw);
  } catch {
    return new THREE.Color(0x1a1820);
  }
}

export function isLightCanvas(): boolean {
  const bg = readCanvasBg();
  return bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114 > 0.55;
}

export function mandalaColor(hue: number, tint = 0.22): THREE.Color {
  const base = lineBaseColor();
  base.getHSL(hsl);
  const t = new THREE.Color().setHSL((hue % 360) / 360, 0.52, hsl.l);
  return base.clone().lerp(t, tint);
}

export function voiceColor(hue: number): THREE.Color {
  const accent = accentColor();
  accent.getHSL(hsl);
  const light = isLightCanvas();
  const t = new THREE.Color().setHSL(
    (hue % 360) / 360,
    light ? 0.52 : 0.58,
    light ? hsl.l : Math.min(hsl.l + 0.06, 0.78),
  );
  return accent.clone().lerp(t, light ? 0.42 : 0.48);
}

/** Воздушная палитра — тонкие линии, мягкое свечение на тёмном. */
export function scaffoldPalette(hue: number): {
  line: THREE.Color;
  halo: THREE.Color;
  voice: THREE.Color;
  core: THREE.Color;
  breath: THREE.Color;
  petal: THREE.Color;
} {
  const accent = accentColor();
  const light = isLightCanvas();
  const line = light
    ? new THREE.Color('#3a2d58')
    : new THREE.Color('#ddd6f0');
  const halo = light
    ? accent.clone().lerp(line, 0.2)
    : accent.clone().lerp(new THREE.Color('#c8b8f0'), 0.35);
  return {
    line,
    halo,
    voice: voiceColor(hue),
    core: accent.clone(),
    breath: accent.clone().lerp(line, 0.35),
    petal: accent.clone().lerp(voiceColor(hue), 0.4),
  };
}

export function hslColor(hue: number, _opacity: number): THREE.Color {
  return mandalaColor(hue);
}

export function basicMat(color: THREE.Color): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

export function structureMaterial(hue: number): THREE.MeshBasicMaterial {
  return basicMat(mandalaColor(hue, 0.28));
}

export function trailMaterial(hue: number): THREE.MeshBasicMaterial {
  return basicMat(voiceColor(hue));
}

export function glowMaterial(hue: number): THREE.MeshBasicMaterial {
  return basicMat(voiceColor(hue));
}

export function structureLineMaterial(hue: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: mandalaColor(hue, 0.22) });
}

export function lineMaterial(hue: number, _opacity: number): THREE.LineBasicMaterial {
  return structureLineMaterial(hue);
}
