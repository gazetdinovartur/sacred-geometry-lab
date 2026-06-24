import * as THREE from 'three';
import { circleLineLoop, disposeGroup, flowerOfLifeNodes } from './SacredScaffold3D';

/** Тонкий контур Семени жизни — 7 кругов, без периферии. */
export class FlowerContour3D {
  readonly group = new THREE.Group();
  private lastRadius = 0;

  rebuild(patternRadius: number, lineColor: THREE.Color, opacity: number): void {
    if (this.lastRadius > 0 && Math.abs(patternRadius - this.lastRadius) / this.lastRadius < 0.025) {
      this.tint(lineColor, opacity);
      return;
    }

    disposeGroup(this.group);
    this.lastRadius = patternRadius;

    const nodes = flowerOfLifeNodes(patternRadius);
    nodes.forEach((node, i) => {
      const z = i === 0 ? 0.08 : 0.1 + i * 0.008;
      const ring = circleLineLoop(node.x, node.y, node.r, lineColor, opacity, z);
      ring.name = `flower-${node.index}`;
      this.group.add(ring);
    });
  }

  tint(color: THREE.Color, opacity: number): void {
    this.group.traverse((node) => {
      if (node instanceof THREE.LineLoop) {
        (node.material as THREE.LineBasicMaterial).color = color;
        (node.material as THREE.LineBasicMaterial).opacity = opacity;
      }
    });
  }

  dispose(): void {
    disposeGroup(this.group);
  }
}
