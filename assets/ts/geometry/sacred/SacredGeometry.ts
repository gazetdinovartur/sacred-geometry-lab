import paper from 'paper';
import type { GeometryParams, GeometryStyle } from '../../types';

type ColorFn = (hue: number, opacity: number) => paper.Color;

export function drawSacredOverlay(
  group: paper.Group,
  center: paper.Point,
  params: GeometryParams,
  style: GeometryStyle,
  rotation: number,
  color: ColorFn,
): void {
  if (style === 'classic') {
    return;
  }

  const r = params.radius * 0.85;

  switch (style) {
    case 'flower':
      drawFlowerOfLife(group, center, r, params, color);
      break;
    case 'seed':
      drawSeedOfLife(group, center, r * 0.55, params, color);
      break;
    case 'metatron':
      drawMetatron(group, center, r, rotation, params, color);
      break;
    case 'merkaba':
      drawMerkaba(group, center, r, rotation, params, color);
      break;
    case 'yantra':
      drawYantra(group, center, r, params, rotation, color);
      break;
    default:
      break;
  }
}

function drawFlowerOfLife(
  group: paper.Group,
  center: paper.Point,
  radius: number,
  params: GeometryParams,
  color: ColorFn,
): void {
  const petalR = radius / 3;
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    const c = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(petalR));
    group.addChild(new paper.Path.Circle({
      center: c,
      radius: petalR,
      strokeColor: color(params.hue, params.opacity * 0.5),
      strokeWidth: params.lineWidth * 0.45,
      fillColor: null,
    }));
  }
  group.addChild(new paper.Path.Circle({
    center,
    radius: petalR,
    strokeColor: color(params.hue + 20, params.opacity * 0.55),
    strokeWidth: params.lineWidth * 0.45,
    fillColor: null,
  }));
}

function drawSeedOfLife(
  group: paper.Group,
  center: paper.Point,
  radius: number,
  params: GeometryParams,
  color: ColorFn,
): void {
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    const c = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(radius));
    group.addChild(new paper.Path.Circle({
      center: c,
      radius,
      strokeColor: color(params.hue + i * 8, params.opacity * 0.45),
      strokeWidth: params.lineWidth * 0.4,
      fillColor: null,
    }));
  }
}

function drawMetatron(
  group: paper.Group,
  center: paper.Point,
  radius: number,
  rotation: number,
  params: GeometryParams,
  color: ColorFn,
): void {
  const inner = radius * 0.45;
  group.addChild(new paper.Path.Circle({
    center,
    radius: inner,
    strokeColor: color(params.hue, params.opacity * 0.6),
    strokeWidth: params.lineWidth * 0.5,
    fillColor: null,
  }));

  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i + rotation;
    const outer = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(radius));
    group.addChild(new paper.Path.Line({
      from: center,
      to: outer,
      strokeColor: color(params.hue + 15, params.opacity * 0.4),
      strokeWidth: params.lineWidth * 0.35,
    }));
    group.addChild(new paper.Path.Circle({
      center: outer,
      radius: inner * 0.35,
      strokeColor: color(params.hue + 30, params.opacity * 0.35),
      strokeWidth: params.lineWidth * 0.3,
      fillColor: null,
    }));
  }
}

function drawMerkaba(
  group: paper.Group,
  center: paper.Point,
  radius: number,
  rotation: number,
  params: GeometryParams,
  color: ColorFn,
): void {
  const tri = (flip: boolean): paper.Path => {
    const path = new paper.Path();
    for (let i = 0; i < 3; i += 1) {
      const angle = rotation + (Math.PI * 2 * i) / 3 + (flip ? Math.PI : 0);
      const p = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(radius * 0.9));
      if (i === 0) {
        path.moveTo(p);
      } else {
        path.lineTo(p);
      }
    }
    path.closed = true;
    path.strokeColor = color(params.hue + (flip ? 40 : 0), params.opacity * 0.55);
    path.strokeWidth = params.lineWidth * 0.55;
    return path;
  };

  group.addChild(tri(false));
  group.addChild(tri(true));
}

function drawYantra(
  group: paper.Group,
  center: paper.Point,
  radius: number,
  params: GeometryParams,
  rotation: number,
  color: ColorFn,
): void {
  const sides = Math.max(params.symmetry, 4);
  const path = new paper.Path();
  for (let i = 0; i <= sides; i += 1) {
    const t = i / sides;
    const r = radius * (0.35 + Math.sin(t * Math.PI) * 0.55);
    const angle = rotation + (Math.PI * 2 * i) / sides;
    const p = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(r));
    if (i === 0) {
      path.moveTo(p);
    } else {
      path.lineTo(p);
    }
  }
  path.closed = true;
  path.strokeColor = color(params.hue - 10, params.opacity * 0.65);
  path.strokeWidth = params.lineWidth * 0.6;
  group.addChild(path);
}
