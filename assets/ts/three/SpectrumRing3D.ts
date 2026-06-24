import * as THREE from 'three';

const DEFAULT_BARS = 48;

/** Радиальные полоски — эквалайзер по границе круга. */
export class SpectrumRing3D {
  readonly bars: THREE.LineSegments;
  private readonly material: THREE.LineBasicMaterial;
  private readonly barCount: number;

  constructor(color: THREE.Color, barCount = DEFAULT_BARS) {
    this.barCount = barCount;
    const positions = new Float32Array(barCount * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      linewidth: 1,
    });
    this.bars = new THREE.LineSegments(geo, this.material);
    this.bars.name = 'spectrum-eq';
    this.bars.renderOrder = 4;
  }

  setColor(color: THREE.Color): void {
    this.material.color = color;
  }

  update(
    baseR: number,
    spectrum: Float32Array,
    time: number,
    live: boolean,
    energy: number,
  ): void {
    const positions = this.bars.geometry.getAttribute('position') as THREE.BufferAttribute;
    const barDepth = baseR * (live ? 0.38 : 0.16);
    const minTip = baseR * 0.018;

    for (let i = 0; i < this.barCount; i += 1) {
      const angle = (i / this.barCount) * Math.PI * 2 - Math.PI / 2;
      const bin = Math.min(spectrum.length - 1, Math.floor((i / this.barCount) * spectrum.length));
      const level = spectrum[bin] ?? 0;
      const idle = 0.08 + Math.sin(time * 2.2 + i * 0.45) * 0.045;
      const amp = idle + level * (live ? 1.15 : 0.5);
      const h = minTip + amp * barDepth * (0.6 + energy * 0.4);

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      positions.setXYZ(i * 2, cos * baseR, sin * baseR, 0.14);
      positions.setXYZ(i * 2 + 1, cos * (baseR + h), sin * (baseR + h), 0.16 + level * 0.04);
    }

    positions.needsUpdate = true;
    this.material.opacity = live ? 0.78 + energy * 0.22 : 0.55 + energy * 0.2;
  }

  dispose(): void {
    this.bars.geometry.dispose();
    this.material.dispose();
  }
}
