import * as THREE from 'three';

/** Мягкое поле частиц вокруг мандалы — глубина без sci-fi шума. */
export class AmbientField3D {
  readonly points: THREE.Points;
  private readonly basePositions: Float32Array;
  private readonly count: number;

  constructor(count = 120, spread = 320) {
    this.count = count;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.35 + Math.random() * 0.65);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.25;
      sizes[i] = 0.8 + Math.random() * 1.6;
    }

    this.basePositions = positions.slice();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.4,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.name = 'ambient-field';
  }

  setColor(color: THREE.Color): void {
    (this.points.material as THREE.PointsMaterial).color = color;
  }

  update(time: number, audioLevel: number, live: boolean): void {
    const positions = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const opacity = live ? 0.12 + audioLevel * 0.22 : 0.08;
    (this.points.material as THREE.PointsMaterial).opacity = opacity;

    for (let i = 0; i < this.count; i += 1) {
      const bx = this.basePositions[i * 3];
      const by = this.basePositions[i * 3 + 1];
      const bz = this.basePositions[i * 3 + 2];
      const drift = live ? 1 : 0.35;
      positions.setXYZ(
        i,
        bx + Math.sin(time * 0.22 + i * 0.7) * 6 * drift,
        by + Math.cos(time * 0.18 + i * 0.5) * 6 * drift,
        bz + Math.sin(time * 0.14 + i) * 3 * drift,
      );
    }
    positions.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
