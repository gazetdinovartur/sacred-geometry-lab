import * as THREE from 'three';
import type { LabRenderer } from '../geometry/LabRenderer';
import type { FeatureSnapshot, GeometryParams, GeometryStyle } from '../types';
import {
  buildScaffoldStructure,
  flowerOfLifeNodes,
  scaffoldBuildKey,
} from './SacredScaffold3D';
import {
  readCanvasBg,
  scaffoldPalette,
} from './threeColors';

const REF_RADIUS = 200;
const SPECTRUM_BARS = 48;
const SPECTRUM_SECTORS = 6;
const LERP = 0.14;

function defaultParams(): GeometryParams {
  return {
    radius: 128,
    rays: 6,
    rotationSpeed: 0.0008,
    hue: 210,
    opacity: 0.62,
    symmetry: 6,
    breathRing: 0,
    lineWidth: 0.75,
    waveAmplitude: 0,
    spiralTurns: 0,
    dotCount: 0,
    elementCount: 7,
    pitchAngle: 0,
  };
}

function lerpParams(a: GeometryParams, b: GeometryParams, t: number): GeometryParams {
  const mix = (x: number, y: number): number => x + (y - x) * t;
  return {
    radius: mix(a.radius, b.radius),
    rays: Math.round(mix(a.rays, b.rays)),
    rotationSpeed: mix(a.rotationSpeed, b.rotationSpeed),
    hue: mix(a.hue, b.hue),
    opacity: mix(a.opacity, b.opacity),
    symmetry: Math.round(mix(a.symmetry, b.symmetry)),
    breathRing: mix(a.breathRing, b.breathRing),
    lineWidth: mix(a.lineWidth, b.lineWidth),
    waveAmplitude: mix(a.waveAmplitude, b.waveAmplitude),
    spiralTurns: mix(a.spiralTurns, b.spiralTurns),
    dotCount: Math.round(mix(a.dotCount, b.dotCount)),
    elementCount: Math.round(mix(a.elementCount, b.elementCount)),
    pitchAngle: mix(a.pitchAngle, b.pitchAngle),
  };
}

type ScaffoldLayers = {
  container: THREE.Group;
  circles: THREE.Group;
  halo: THREE.Group;
  breath: THREE.LineLoop;
  lastBuildKey: string;
  nodes: ReturnType<typeof flowerOfLifeNodes>;
};

/** Sacred-only: один каркас Цветка, звук меняет opacity/цвет/движение — без новых фигур. */
export class ThreeLabRenderer implements LabRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 1, 4000);
  private readonly webgl: THREE.WebGLRenderer;
  private readonly root = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly dualLeft = new THREE.Group();
  private readonly dualRight = new THREE.Group();
  private readonly overlapGlow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );

  private targetParams = defaultParams();
  private displayParams = defaultParams();
  private dualLeftParams = defaultParams();
  private dualRightParams = defaultParams();
  private style: GeometryStyle = 'flower';
  private rotation = 0;
  private frozenRotation: number | undefined;
  private mode: 'single' | 'dual' = 'single';
  private layers!: ScaffoldLayers;
  private leftLayers!: ScaffoldLayers;
  private rightLayers!: ScaffoldLayers;

  private spectrumTarget = new Float32Array(SPECTRUM_BARS);
  private spectrumDisplay = new Float32Array(SPECTRUM_BARS);
  private rafId = 0;
  private size = 800;
  private time = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.NoToneMapping;

    this.layers = this.createLayerStack();
    this.leftLayers = this.createLayerStack();
    this.rightLayers = this.createLayerStack();

    this.tilt.add(this.layers.container);
    this.root.add(this.tilt);
    this.dualLeft.add(this.leftLayers.container);
    this.dualRight.add(this.rightLayers.container);

    this.scene.add(this.root, this.dualLeft, this.dualRight, this.overlapGlow);
    this.dualLeft.visible = false;
    this.dualRight.visible = false;

    this.camera.position.set(0, -55, 500);
    this.camera.lookAt(0, 0, 0);

    this.resize();
    this.updateScaffold(this.layers, this.displayParams);
    this.startLoop();
  }

  setStyle(style: GeometryStyle): void {
    if (this.style === style) {
      return;
    }
    this.style = style;
    this.invalidateLayerCaches(this.layers);
    this.invalidateLayerCaches(this.leftLayers);
    this.invalidateLayerCaches(this.rightLayers);
  }

  setSpectrum(bars: Float32Array): void {
    const n = Math.min(bars.length, SPECTRUM_BARS);
    for (let i = 0; i < n; i += 1) {
      this.spectrumTarget[i] = bars[i];
    }
  }

  refreshTheme(): void {
    this.invalidateLayerCaches(this.layers);
    this.invalidateLayerCaches(this.leftLayers);
    this.invalidateLayerCaches(this.rightLayers);
    this.applyBg();
  }

  resize(): void {
    const wrap = this.canvas.parentElement;
    if (!wrap) {
      return;
    }
    const size = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
    const resolved = size >= 1 ? size : 560;
    this.size = resolved;
    this.webgl.setSize(resolved, resolved, false);
    if (size < 1) {
      return;
    }
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.applyBg();
  }

  render(params: GeometryParams, _pitchTrail = [], frozenRotation?: number): void {
    this.mode = 'single';
    this.root.visible = true;
    this.dualLeft.visible = false;
    this.dualRight.visible = false;
    this.overlapGlow.visible = false;
    this.targetParams = params;
    this.frozenRotation = frozenRotation;
    if (frozenRotation !== undefined) {
      this.rotation = frozenRotation;
    }
  }

  renderSnapshot(snapshot: FeatureSnapshot): void {
    this.render(snapshot.params);
  }

  renderComposite(snapshots: FeatureSnapshot[]): void {
    if (snapshots.length === 0) {
      return;
    }
    this.render(snapshots[snapshots.length - 1].params);
  }

  renderDual(left: GeometryParams, right: GeometryParams, overlap: number): void {
    this.mode = 'dual';
    this.root.visible = false;
    this.dualLeft.visible = true;
    this.dualRight.visible = true;
    this.overlapGlow.visible = overlap > 0.08;
    this.dualLeftParams = left;
    this.dualRightParams = right;
    this.rotation += (left.rotationSpeed + right.rotationSpeed) * 0.5;
    this.updateOverlap(overlap, left, right);
  }

  clear(): void {
    this.rotation = 0;
    this.targetParams = defaultParams();
    this.displayParams = defaultParams();
    this.spectrumTarget.fill(0);
    this.spectrumDisplay.fill(0);
    this.renderFrame();
  }

  exportSvg(): string {
    const png = this.exportPng();
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.size}" height="${this.size}">`,
      `<image href="${png}" width="${this.size}" height="${this.size}"/>`,
      '</svg>',
    ].join('');
  }

  exportPng(): string {
    this.renderFrame();
    return this.canvas.toDataURL('image/png');
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.webgl.dispose();
  }

  private renderFrame(): void {
    this.webgl.render(this.scene, this.camera);
  }

  private startLoop(): void {
    const tick = (now: number): void => {
      this.time = now * 0.001;
      this.displayParams = lerpParams(this.displayParams, this.targetParams, LERP);

      for (let i = 0; i < SPECTRUM_BARS; i += 1) {
        this.spectrumDisplay[i] += (this.spectrumTarget[i] - this.spectrumDisplay[i]) * 0.2;
      }

      if (this.frozenRotation === undefined) {
        this.rotation += this.displayParams.rotationSpeed;
      }

      if (this.mode === 'single') {
        const live = isLive(this.displayParams);
        this.root.rotation.z = this.rotation * (live ? 0.055 : 0.028);
        this.updateScaffold(this.layers, this.displayParams);
      } else {
        const sf = this.scaleFactor();
        this.dualLeft.position.x = -sf * 90;
        this.dualRight.position.x = sf * 90;
        const scale = 0.58;
        this.updateScaffold(this.leftLayers, scaleParams(this.dualLeftParams, scale));
        this.updateScaffold(this.rightLayers, scaleParams(this.dualRightParams, scale));
      }

      this.applyBg();
      this.renderFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private applyBg(): void {
    const bg = readCanvasBg();
    this.scene.background = bg;
    this.webgl.setClearColor(bg, 1);
  }

  private scaleFactor(): number {
    return (this.size * 0.62) / REF_RADIUS;
  }

  private patternRadius(params: GeometryParams): number {
    return params.radius * this.scaleFactor();
  }

  private createLayerStack(): ScaffoldLayers {
    const container = new THREE.Group();
    const circles = new THREE.Group();
    const halo = new THREE.Group();
    halo.position.z = -0.04;
    const breathPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i += 1) {
      const t = (i / 128) * Math.PI * 2;
      breathPts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), -0.06));
    }
    const breath = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(breathPts),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.2, color: 0xffffff }),
    );
    breath.visible = false;

    container.add(circles, halo, breath);
    return {
      container,
      circles,
      halo,
      breath,
      lastBuildKey: '',
      nodes: flowerOfLifeNodes(100),
    };
  }

  private invalidateLayerCaches(layers: ScaffoldLayers): void {
    layers.lastBuildKey = '';
  }

  private updateOverlap(overlap: number, left: GeometryParams, right: GeometryParams): void {
    const r = this.scaleFactor() * 120 * overlap;
    this.overlapGlow.geometry.dispose();
    this.overlapGlow.geometry = new THREE.CircleGeometry(r, 48);
    const pal = scaffoldPalette((left.hue + right.hue) * 0.5);
    const mat = this.overlapGlow.material as THREE.MeshBasicMaterial;
    mat.color = pal.voice;
    mat.opacity = 0.05 + overlap * 0.16;
  }

  private updateScaffold(layers: ScaffoldLayers, params: GeometryParams): void {
    const patternR = this.patternRadius(params);
    const pal = scaffoldPalette(params.hue);
    const live = isLive(params);
    const buildKey = scaffoldBuildKey(this.style, patternR);

    if (buildKey !== layers.lastBuildKey) {
      layers.nodes = buildScaffoldStructure(
        layers.circles,
        layers.halo,
        this.style,
        patternR,
        pal.line,
        pal.halo,
      );
      layers.lastBuildKey = buildKey;
    } else {
      tintLineGroup(layers.circles, pal.line);
      tintLineGroup(layers.halo, pal.halo);
    }

    this.paintCircles(layers, params, pal, live);
    this.paintHalo(layers, params, pal, live);
    this.applyLiveMotion(layers, params, live, pal);
    this.updateBreath(layers.breath, params, patternR, pal.breath);
  }

  /** Гармоники + RMS → какие круги ярче; f₀ → один акцентный круг. */
  private paintCircles(
    layers: ScaffoldLayers,
    params: GeometryParams,
    pal: ReturnType<typeof scaffoldPalette>,
    live: boolean,
  ): void {
    const active = Math.min(7, Math.max(params.elementCount, live ? 6 : params.elementCount));
    const pitchIndex = nearestPitchCircle(params.pitchAngle);

    layers.circles.children.forEach((child) => {
      if (!(child instanceof THREE.LineLoop)) {
        return;
      }
      const index = Number.parseInt(child.name.replace('circle-', ''), 10);
      const mat = child.material as THREE.LineBasicMaterial;

      if (index === 0) {
        mat.color = live ? pal.voice.clone().lerp(pal.line, 0.55) : pal.line;
        mat.opacity = live
          ? 0.4 + params.opacity * 0.35 + Math.sin(this.time * 3) * 0.04 * params.opacity
          : 0.35 + params.opacity * 0.2;
        return;
      }

      const isActive = Number.isNaN(index) || index < active;
      const isPitch = live && index === pitchIndex;

      mat.color = isPitch ? pal.voice : isActive ? pal.line : pal.halo;
      mat.opacity = isPitch
        ? 0.72 + params.opacity * 0.25
        : isActive
          ? 0.48 + params.opacity * 0.38
          : 0.12;
    });
  }

  /** Спектр → яркость 6 внешних кругов; RMS → граница. */
  private paintHalo(
    layers: ScaffoldLayers,
    params: GeometryParams,
    pal: ReturnType<typeof scaffoldPalette>,
    live: boolean,
  ): void {
    const binsPerSector = Math.floor(SPECTRUM_BARS / SPECTRUM_SECTORS);
    const boundaryBoost = 0.22 + params.opacity * (live ? 0.5 : 0.4);

    layers.halo.children.forEach((child) => {
      if (!(child instanceof THREE.LineLoop)) {
        return;
      }
      const mat = child.material as THREE.LineBasicMaterial;

      if (child.name === 'boundary') {
        mat.color = pal.halo;
        mat.opacity = boundaryBoost;
        const breath = live ? 1 + Math.sin(this.time * 2.1) * 0.014 * params.opacity : 1;
        child.scale.set(breath, breath, 1);
        return;
      }

      if (!child.name.startsWith('outer-')) {
        return;
      }

      const sector = Number.parseInt(child.name.replace('outer-', ''), 10) - 10;
      let level = 0;
      if (sector >= 0 && sector < SPECTRUM_SECTORS) {
        for (let b = 0; b < binsPerSector; b += 1) {
          level += this.spectrumDisplay[sector * binsPerSector + b] ?? 0;
        }
        level /= binsPerSector;
      }

      const idle = live ? 0 : 0.03 + 0.012 * (1 + Math.sin(this.time * 1.1 + sector));
      level = Math.max(level, idle);

      mat.color = live && level > 0.12 ? pal.voice.clone().lerp(pal.halo, 0.45) : pal.halo;
      mat.opacity = live
        ? 0.14 + level * 0.52 + params.opacity * 0.15
        : 0.1 + params.opacity * 0.12;

      const s = live ? 1 + level * 0.018 : 1;
      child.scale.set(s, s, 1);
    });
  }

  private applyLiveMotion(
    layers: ScaffoldLayers,
    params: GeometryParams,
    live: boolean,
    _pal: ReturnType<typeof scaffoldPalette>,
  ): void {
    const energy = params.opacity;
    const pulse = 1 + Math.sin(this.time * 2.6) * (live ? 0.024 : 0.008) * energy;
    layers.container.scale.set(pulse, pulse, 1);

    this.tilt.rotation.x = 0.1 + params.pitchAngle * 0.045 + Math.sin(this.time * 0.85) * 0.025 * energy;
    this.tilt.rotation.y = Math.sin(this.time * 0.65 + params.pitchAngle) * 0.035 * energy;
    layers.halo.rotation.z = -params.pitchAngle * 0.1 - this.rotation * 0.01;

    layers.circles.children.forEach((child) => {
      if (!(child instanceof THREE.LineLoop)) {
        return;
      }
      const index = Number.parseInt(child.name.replace('circle-', ''), 10);
      const baseZ = index === 0 ? 0 : 0.04 + index * 0.015;
      const wobble = live ? Math.sin(this.time * 2.4 + index * 0.85) * 0.022 * energy : 0;
      child.position.z = baseZ + wobble;
    });
  }

  private updateBreath(
    loop: THREE.LineLoop,
    params: GeometryParams,
    patternR: number,
    color: THREE.Color,
  ): void {
    if (params.breathRing <= 0.05) {
      loop.visible = false;
      return;
    }
    loop.visible = true;
    const pulse = 1 + Math.sin(this.time * 1.6) * 0.006;
    const r = patternR * (1.06 + params.breathRing * 0.12) * pulse;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i += 1) {
      const t = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, -0.06));
    }
    loop.geometry.dispose();
    loop.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = loop.material as THREE.LineBasicMaterial;
    mat.color = color;
    mat.opacity = 0.18 + params.breathRing * 0.32;
  }
}

function isLive(params: GeometryParams): boolean {
  return params.opacity > 0.68;
}

function nearestPitchCircle(pitchAngle: number): number {
  const dir = pitchAngle % (Math.PI * 2);
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i <= 6; i += 1) {
    const angle = ((i - 1) * Math.PI) / 3;
    const diff = Math.abs(wrapAngle(angle - dir));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function scaleParams(params: GeometryParams, scale: number): GeometryParams {
  return { ...params, radius: params.radius * scale };
}

function wrapAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) {
    x -= Math.PI * 2;
  }
  if (x < -Math.PI) {
    x += Math.PI * 2;
  }
  return x;
}

function tintLineGroup(group: THREE.Group, color: THREE.Color): void {
  group.traverse((node) => {
    if (node instanceof THREE.LineLoop || node instanceof THREE.Line) {
      (node.material as THREE.LineBasicMaterial).color = color;
    }
  });
}
