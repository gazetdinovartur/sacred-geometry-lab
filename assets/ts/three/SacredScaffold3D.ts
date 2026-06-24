import * as THREE from 'three';
import type { GeometryStyle } from '../types';

/** Узел Цветка жизни — центр и радиус одного круга. */
export type FlowerNode = {
  x: number;
  y: number;
  r: number;
  index: number;
};

const CIRCLE_SEGMENTS = 160;

/** Тонкая линия-круг — воздушный контур, не «труба». */
export function circleLineLoop(
  cx: number,
  cy: number,
  radius: number,
  color: THREE.Color,
  opacity: number,
  z = 0,
): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i += 1) {
    const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    pts.push(new THREE.Vector3(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius, z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  return new THREE.LineLoop(geo, mat);
}

/** Семь кругов Seed / Flower of Life (1 центр + 6 вокруг). */
export function flowerOfLifeNodes(patternRadius: number): FlowerNode[] {
  const petalR = patternRadius / 3;
  const nodes: FlowerNode[] = [{ x: 0, y: 0, r: petalR, index: 0 }];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    nodes.push({
      x: Math.cos(angle) * petalR,
      y: Math.sin(angle) * petalR,
      r: petalR,
      index: i + 1,
    });
  }
  return nodes;
}

/** Внешнее кольцо Цветка — 6 кругов второго венца. */
export function outerFlowerNodes(patternRadius: number): FlowerNode[] {
  const petalR = patternRadius / 3;
  const nodes: FlowerNode[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    const cx = Math.cos(angle) * petalR * 2;
    const cy = Math.sin(angle) * petalR * 2;
    nodes.push({ x: cx, y: cy, r: petalR, index: 10 + i });
  }
  return nodes;
}

export function disposeGroup(group: THREE.Group): void {
  group.children.slice().forEach((child) => {
    group.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Line || node instanceof THREE.LineLoop) {
        node.geometry.dispose();
        const mat = node.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        const mat = node.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    });
  });
}

export type ScaffoldBuildKey = string;

export function scaffoldBuildKey(
  style: GeometryStyle,
  patternRadius: number,
): ScaffoldBuildKey {
  return `${style}-${Math.round(patternRadius)}`;
}

/** Каркас: тонкие контуры. Граница-эквалайзер — отдельно в ThreeLabRenderer. */
export function buildScaffoldStructure(
  group: THREE.Group,
  haloGroup: THREE.Group,
  style: GeometryStyle,
  patternRadius: number,
  lineColor: THREE.Color,
  haloColor: THREE.Color,
): FlowerNode[] {
  disposeGroup(group);
  disposeGroup(haloGroup);

  const nodes = flowerOfLifeNodes(patternRadius);

  nodes.forEach((node, i) => {
    const z = i === 0 ? 0 : 0.04 + i * 0.018;
    const ring = circleLineLoop(node.x, node.y, node.r, lineColor, 0.58, z);
    ring.name = `circle-${node.index}`;
    group.add(ring);
  });

  if (style === 'flower') {
    outerFlowerNodes(patternRadius).forEach((node, i) => {
      const ring = circleLineLoop(node.x, node.y, node.r, haloColor, 0.22, 0.02 + i * 0.01);
      ring.name = `outer-${node.index}`;
      haloGroup.add(ring);
    });
  }

  return nodes;
}
