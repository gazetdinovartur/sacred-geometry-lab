import * as THREE from 'three';
import type { PitchPoint } from '../types';
import { voiceColor } from './threeColors';

const TRAIL_NAME = 'sacred-trail';
const HEAD_NAME = 'sacred-head';

function trailPoint(
  seg: PitchPoint,
  patternR: number,
  rotation: number,
  index: number,
): THREE.Vector3 {
  const angle = seg.angle + rotation * 0.018;
  const r = patternR * (0.22 + seg.radiusNorm * 0.62);
  const z = 0.11 + Math.sin(index * 0.45 + seg.variant) * 0.025;
  return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z);
}

function clearGroup(group: THREE.Group): void {
  group.children.slice().forEach((child) => {
    group.remove(child);
    if (child instanceof THREE.Line || child instanceof THREE.LineLoop) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
}

/** Pitch → тонкая линия на плоскости Цветка. Без tubes, мотивов, «осколков». */
export function rebuildVoiceTrail(
  group: THREE.Group,
  trail: PitchPoint[],
  patternR: number,
  baseHue: number,
  rotation: number,
): void {
  clearGroup(group);

  if (trail.length === 0) {
    return;
  }

  const points = trail.map((seg, i) => trailPoint(seg, patternR, rotation, i));

  if (points.length >= 2) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: voiceColor(baseHue),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.name = TRAIL_NAME;
    group.add(line);
  }

  addHead(group, points[points.length - 1], baseHue, patternR);
}

export function updateVoiceHead(
  group: THREE.Group,
  trail: PitchPoint[],
  patternR: number,
  baseHue: number,
  rotation: number,
  time: number,
): void {
  if (trail.length === 0) {
    return;
  }

  const last = trail[trail.length - 1];
  const pos = trailPoint(last, patternR, rotation, trail.length - 1);
  const head = group.getObjectByName(HEAD_NAME) as THREE.LineLoop | undefined;
  if (!head) {
    addHead(group, pos, baseHue, patternR);
    return;
  }

  const pulse = 1 + Math.sin(time * 5) * 0.18;
  const r = patternR * 0.012 * pulse;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = (i / 24) * Math.PI * 2;
    pts.push(new THREE.Vector3(pos.x + Math.cos(t) * r, pos.y + Math.sin(t) * r, pos.z + 0.02));
  }
  head.geometry.dispose();
  head.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  (head.material as THREE.LineBasicMaterial).color = voiceColor(baseHue);
  (head.material as THREE.LineBasicMaterial).opacity = 0.85;
}

function addHead(group: THREE.Group, pos: THREE.Vector3, baseHue: number, patternR: number): void {
  const r = patternR * 0.012;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = (i / 24) * Math.PI * 2;
    pts.push(new THREE.Vector3(pos.x + Math.cos(t) * r, pos.y + Math.sin(t) * r, pos.z + 0.02));
  }
  const head = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color: voiceColor(baseHue),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  head.name = HEAD_NAME;
  group.add(head);
}
