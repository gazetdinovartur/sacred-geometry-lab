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
  const wrap = document.querySelector('.mandala-wrap');
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

/** Оттенок от hue, но опирается на --line — контраст на обеих темах. */
export function mandalaColor(hue: number, tint = 0.22): THREE.Color {
  const base = lineBaseColor();
  base.getHSL(hsl);
  const t = new THREE.Color().setHSL((hue % 360) / 360, 0.52, hsl.l);
  return base.clone().lerp(t, tint);
}

export function voiceColor(hue: number): THREE.Color {
  const accent = accentColor();
  accent.getHSL(hsl);
  const t = new THREE.Color().setHSL((hue % 360) / 360, 0.58, hsl.l);
  return accent.clone().lerp(t, 0.38);
}

/** Спокойная палитра — чистый акцент, без грязных серых наслоений. */
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
    ? new THREE.Color('#524878')
    : new THREE.Color('#ddd6f0');
  const halo = accent.clone().lerp(line, light ? 0.35 : 0.25);
  return {
    line,
    halo,
    voice: voiceColor(hue),
    core: accent.clone(),
    breath: accent.clone().lerp(line, 0.4),
    petal: accent.clone().lerp(voiceColor(hue), 0.45),
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
