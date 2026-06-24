import * as THREE from 'three';
import type { LabRenderer } from '../geometry/LabRenderer';
import type { FeatureSnapshot, GeometryParams, GeometryStyle, PitchPoint } from '../types';
import { BloomComposer } from './BloomComposer';
import { CymaticPlate3D } from './CymaticPlate3D';
import { FlowerContour3D } from './FlowerContour3D';
import { SpectrumRing3D } from './SpectrumRing3D';
import { scaffoldPalette } from './threeColors';

const SPECTRUM_BARS = 48;
const LERP = 0.14;
const AMBIENT_BASE_R = 220;
const CORE_BASE_R = 130;

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

/**
 * Два слоя: ambient cymatics на весь экран + точный центр в круге
 * (core cymatics, контур Цветка, EQ).
 */
export class ThreeLabRenderer implements LabRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 1, 5000);
  private readonly webgl: THREE.WebGLRenderer;
  private readonly composer: BloomComposer;
  private readonly focus = new THREE.Group();
  private readonly ambientPlate: CymaticPlate3D;
  private readonly corePlate: CymaticPlate3D;
  private readonly flower = new FlowerContour3D();
  private readonly eqRing: SpectrumRing3D;
  private readonly dualLeft = new THREE.Group();
  private readonly dualRight = new THREE.Group();

  private targetParams = defaultParams();
  private displayParams = defaultParams();
  private rotation = 0;
  private frozenRotation: number | undefined;
  private mode: 'single' | 'dual' = 'single';

  private spectrumTarget = new Float32Array(SPECTRUM_BARS);
  private spectrumDisplay = new Float32Array(SPECTRUM_BARS);
  private rafId = 0;
  private sizeW = 800;
  private sizeH = 620;
  private time = 0;
  private cameraZ = 520;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.NoToneMapping;

    const pal = scaffoldPalette(defaultParams().hue);
    this.ambientPlate = new CymaticPlate3D(AMBIENT_BASE_R, 'ambient', 112);
    this.corePlate = new CymaticPlate3D(CORE_BASE_R, 'core', 140);
    this.eqRing = new SpectrumRing3D(pal.voice, SPECTRUM_BARS);

    this.focus.add(this.corePlate.mesh, this.flower.group, this.eqRing.bars);
    this.scene.add(this.ambientPlate.mesh, this.focus, this.dualLeft, this.dualRight);
    this.dualLeft.visible = false;
    this.dualRight.visible = false;

    this.camera.position.set(0, 0, this.cameraZ);
    this.camera.lookAt(0, 0, 0);

    this.composer = new BloomComposer(this.webgl, this.scene, this.camera);
    this.resize();
    this.startLoop();
  }

  setStyle(_style: GeometryStyle): void {}

  setSpectrum(bars: Float32Array): void {
    const n = Math.min(bars.length, SPECTRUM_BARS);
    for (let i = 0; i < n; i += 1) {
      this.spectrumTarget[i] = bars[i];
    }
  }

  refreshTheme(): void {
    this.applyPalette(scaffoldPalette(this.displayParams.hue));
  }

  resize(): void {
    const stage = this.canvas.parentElement;
    if (!stage) {
      return;
    }
    const w = Math.max(stage.clientWidth, 320);
    const h = Math.max(stage.clientHeight, 320);
    this.sizeW = w;
    this.sizeH = h;
    this.webgl.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.webgl.setClearColor(0x000000, 0);
    this.layoutWorld();
  }

  render(params: GeometryParams, _pitchTrail: PitchPoint[] = [], frozenRotation?: number): void {
    this.mode = 'single';
    this.focus.visible = true;
    this.ambientPlate.mesh.visible = true;
    this.dualLeft.visible = false;
    this.dualRight.visible = false;
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

  renderDual(_left: GeometryParams, _right: GeometryParams, _overlap: number): void {
    this.mode = 'dual';
    this.focus.visible = false;
    this.ambientPlate.mesh.visible = false;
    this.dualLeft.visible = true;
    this.dualRight.visible = true;
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
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.sizeW}" height="${this.sizeH}">`,
      `<image href="${png}" width="${this.sizeW}" height="${this.sizeH}"/>`,
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
    this.composer.dispose();
    this.ambientPlate.dispose();
    this.corePlate.dispose();
    this.flower.dispose();
    this.eqRing.dispose();
    this.webgl.dispose();
  }

  private layoutWorld(): void {
    const focusR = this.focusRadiusWorld();
    const coverR = this.coverRadiusWorld();

    this.ambientPlate.setScale(coverR / AMBIENT_BASE_R);
    this.corePlate.setScale((focusR * 0.88) / CORE_BASE_R);
  }

  private worldPerPixel(): number {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const viewH = 2 * Math.tan(vFov / 2) * this.camera.position.z;
    return viewH / this.sizeH;
  }

  /** Радиус круга-мандалы в мировых единицах. */
  private focusRadiusWorld(): number {
    const frame = document.querySelector('.mandala-frame');
    const framePx = frame instanceof HTMLElement
      ? frame.clientWidth * 0.44
      : Math.min(this.sizeW, this.sizeH, 560) * 0.44;
    return framePx * this.worldPerPixel();
  }

  /** Радиус ambient-пластины — покрывает сцену. */
  private coverRadiusWorld(): number {
    const coverPx = Math.hypot(this.sizeW, this.sizeH) * 0.52;
    return coverPx * this.worldPerPixel();
  }

  private renderFrame(): void {
    this.composer.render();
  }

  private startLoop(): void {
    const tick = (now: number): void => {
      this.time = now * 0.001;
      this.displayParams = lerpParams(this.displayParams, this.targetParams, LERP);

      for (let i = 0; i < SPECTRUM_BARS; i += 1) {
        this.spectrumDisplay[i] += (this.spectrumTarget[i] - this.spectrumDisplay[i]) * 0.26;
      }

      const audioLevel = this.computeAudioLevel();
      const live = isLive(this.displayParams);
      const pal = scaffoldPalette(this.displayParams.hue);

      if (this.frozenRotation === undefined) {
        this.rotation += this.displayParams.rotationSpeed;
      }

      if (this.mode === 'single') {
        this.focus.rotation.z = this.rotation * 0.012;
        this.applyPalette(pal);
        this.updateScene(audioLevel, live);
        this.updateCamera(audioLevel, live);
        this.syncAura(audioLevel, live);
      }

      const bloom = 0.34 + audioLevel * 0.4 + (live ? 0.1 : 0);
      this.composer.setBloomStrength(bloom);
      this.scene.background = null;
      this.renderFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private applyPalette(pal: ReturnType<typeof scaffoldPalette>): void {
    this.ambientPlate.setColors(pal.line, pal.halo);
    this.corePlate.setColors(pal.line, pal.voice);
    this.eqRing.setColor(pal.voice);
    this.flower.tint(pal.halo, 0.38);
  }

  private updateScene(audioLevel: number, live: boolean): void {
    const params = this.displayParams;
    const energy = params.opacity;
    const focusR = this.focusRadiusWorld();

    this.ambientPlate.updateFromParams(this.time, params, this.spectrumDisplay, audioLevel, live);
    this.corePlate.updateFromParams(this.time, params, this.spectrumDisplay, audioLevel, live);

    const eqR = focusR * 0.96;
    this.eqRing.bars.position.z = 0.12;
    this.eqRing.update(eqR, this.spectrumDisplay, this.time, live, energy);

    const flowerR = focusR * 0.82;
    this.flower.rebuild(flowerR, scaffoldPalette(params.hue).halo, live ? 0.42 : 0.32);

    this.layoutWorld();
  }

  private syncAura(audioLevel: number, live: boolean): void {
    const frame = document.querySelector('.mandala-frame');
    if (!(frame instanceof HTMLElement)) {
      return;
    }
    frame.style.setProperty('--mandala-aura', String(live ? 0.5 + audioLevel * 0.85 : 0.32));
    frame.style.setProperty('--mandala-hue', String(Math.round(this.displayParams.hue)));
  }

  private computeAudioLevel(): number {
    let sum = 0;
    for (let i = 0; i < SPECTRUM_BARS; i += 1) {
      sum += this.spectrumDisplay[i];
    }
    return sum / SPECTRUM_BARS;
  }

  private updateCamera(audioLevel: number, live: boolean): void {
    const breath = Math.max(this.displayParams.breathRing, 0.04);
    const targetZ = this.cameraZ - audioLevel * 28 - breath * 14;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.035;
    this.camera.position.x = 0;
    this.camera.position.y = 0;
    this.camera.lookAt(0, 0, 0);
  }
}

function isLive(params: GeometryParams): boolean {
  return params.opacity > 0.5;
}
