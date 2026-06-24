import * as THREE from 'three';
import { basicMat } from './threeColors';

/** Тонкое кольцо (RMS, гармоники) — не solid-torus. */
export function ringMesh(
  radius: number,
  thickness: number,
  color: THREE.Color,
  segments = 128,
): THREE.Mesh {
  const inner = Math.max(radius - thickness, radius * 0.82);
  const geo = new THREE.RingGeometry(inner, radius, segments);
  return new THREE.Mesh(geo, basicMat(color));
}

/** Луч: тонкая трубка от центра наружу. */
export function rayMesh(
  angle: number,
  innerR: number,
  outerR: number,
  tubeR: number,
  color: THREE.Color,
): THREE.Mesh {
  const from = new THREE.Vector3(Math.cos(angle) * innerR, Math.sin(angle) * innerR, 0);
  const to = new THREE.Vector3(Math.cos(angle) * outerR, Math.sin(angle) * outerR, 0);
  const geo = new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 4, tubeR, 6, false);
  return new THREE.Mesh(geo, basicMat(color));
}

/** Звезда симметрии — острые ребра, тонкие сегменты. */
export function starGroup(
  n: number,
  outerR: number,
  innerR: number,
  tubeR: number,
  color: THREE.Color,
  rotation = 0,
): THREE.Group {
  const group = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n * 2; i += 1) {
    const angle = (Math.PI * i) / n + rotation - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0));
  }

  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const geo = new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 2, tubeR, 5, false);
    group.add(new THREE.Mesh(geo, basicMat(color)));
  }
  return group;
}

/** Тембр — контур многоугольника (не залитый «шестигранник»). */
export function timbrePolygonGroup(
  sides: number,
  radius: number,
  tubeR: number,
  color: THREE.Color,
  rotation = 0,
): THREE.Group {
  const group = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides + rotation;
    pts.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  for (let i = 0; i < pts.length; i += 1) {
    const geo = new THREE.TubeGeometry(
      new THREE.LineCurve3(pts[i], pts[(i + 1) % pts.length]),
      2,
      tubeR,
      5,
      false,
    );
    group.add(new THREE.Mesh(geo, basicMat(color)));
  }
  return group;
}

/** Волна flux — синусоидальное кольцо. */
export function waveRingGroup(
  radius: number,
  amplitude: number,
  tubeR: number,
  color: THREE.Color,
  segments = 96,
): THREE.Group {
  const group = new THREE.Group();
  const amp = Math.min(amplitude * 0.004, radius * 0.08);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (Math.PI * 2 * i) / segments;
    const r = radius + Math.sin(t * 5) * amp;
    pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0.2));
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const geo = new THREE.TubeGeometry(new THREE.LineCurve3(pts[i], pts[i + 1]), 2, tubeR, 4, false);
    group.add(new THREE.Mesh(geo, basicMat(color)));
  }
  return group;
}

/** Точки плотности (dotCount / flux). */
export function dotFieldGroup(
  count: number,
  radius: number,
  beadR: number,
  color: THREE.Color,
): THREE.Group {
  const group = new THREE.Group();
  const n = Math.max(count, 1);
  for (let i = 0; i < n; i += 1) {
    const angle = (Math.PI * 2 * i) / n;
    const r = radius * (0.92 + (i % 3) * 0.035);
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(beadR, 10, 10),
      basicMat(color),
    );
    bead.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0.35);
    group.add(bead);
  }
  return group;
}

export function disposeGroup(group: THREE.Group): void {
  group.children.slice().forEach((child) => {
    group.remove(child);
    child.traverse((node) => {
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
