import * as THREE from 'three';
import type { FeatureSnapshot } from '../types';
import { downsampleBars, SPECTRUM_EXPORT_BANDS } from '../geometry/EqLabRenderer';
import { readCanvasBg } from './threeColors';
import {
  deriveFlightAudioVisuals,
  flightBandColor,
  type FlightAudioVisuals,
} from './flightAudioVisuals';

const GATE_COUNT = 9;
const GATE_SPACING = 210;
const BAR_COUNT = 48;
const STAR_COUNT = 1600;
const LOOK_AHEAD = 440;
const GATE_AHEAD_OFFSET = 130;
const BASE_FOV = 52;
const START_CAMERA_Z = 920;
const SMOOTH_RATE = 0.22;

type SmoothedBreath = Pick<FlightAudioVisuals, 'rms' | 'breath' | 'level' | 'energy' | 'flux'>;

function lerpSmooth(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

function breathWave(time: number, rate: number, phase = 0): number {
  const s = Math.sin(time * rate + phase);
  return s * s;
}

/** Портал: радиальное дыхание + спектральные цвета по зубцам. */
class FlightGate {
  readonly root = new THREE.Group();
  private readonly ring: THREE.LineLoop;
  private readonly innerRing: THREE.LineLoop;
  private readonly bars: THREE.LineSegments;
  private readonly ringMat: THREE.LineBasicMaterial;
  private readonly innerMat: THREE.LineBasicMaterial;
  private readonly barMat: THREE.LineBasicMaterial;

  constructor() {
    const ringGeo = new THREE.BufferGeometry();
    const segments = 96;
    const ringPts = new Float32Array((segments + 1) * 2);
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2 - Math.PI / 2;
      ringPts[i * 2] = Math.cos(a);
      ringPts[i * 2 + 1] = Math.sin(a);
    }
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPts, 2));

    this.ringMat = new THREE.LineBasicMaterial({
      depthWrite: true,
    });
    this.ring = new THREE.LineLoop(ringGeo, this.ringMat);

    const innerGeo = ringGeo.clone();
    this.innerMat = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.innerRing = new THREE.LineLoop(innerGeo, this.innerMat);
    this.innerRing.scale.setScalar(0.88);

    const barGeo = new THREE.BufferGeometry();
    barGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BAR_COUNT * 2 * 3), 3));
    barGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BAR_COUNT * 2 * 3), 3));
    this.barMat = new THREE.LineBasicMaterial({
      depthWrite: true,
      vertexColors: true,
    });
    this.bars = new THREE.LineSegments(barGeo, this.barMat);

    this.root.add(this.ring, this.innerRing, this.bars);
  }

  update(
    snapshot: FeatureSnapshot,
    spectrum: Float32Array,
    visuals: FlightAudioVisuals,
    smooth: SmoothedBreath,
    time: number,
    gateIndex: number,
  ): void {
    const { palette, pitch, centroid, hue } = visuals;
    const { rms, breath, level, energy, flux } = smooth;

    const baseRadius = 54 + energy * 36 + snapshot.params.radius * 0.12 + breath * 16;
    const inhale = breathWave(time, 0.72 + breath * 0.55 + rms * 0.25, gateIndex * 0.28);
    const swell = 0.1 + breath * 0.22 + rms * 0.16 + level * 0.1;
    const radiusScale = 1 + (inhale - 0.5) * swell * 2;

    this.root.rotation.z = 0;
    this.root.position.x = 0;
    this.root.position.y = 0;
    this.root.scale.setScalar(baseRadius * radiusScale);

    const ringHueShift = pitch * 28 + centroid * 18 + flux * 12;
    this.ringMat.color.copy(palette.halo)
      .lerp(palette.voice, 0.45 + rms * 0.35)
      .lerp(palette.core, pitch * 0.3);

    this.innerMat.color.copy(palette.breath)
      .lerp(palette.petal, 0.4 + inhale * 0.25)
      .lerp(palette.core, ringHueShift * 0.008);
    this.innerMat.opacity = 0.35 + breath * 0.35 + rms * 0.25;

    const positions = this.bars.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = this.bars.geometry.getAttribute('color') as THREE.BufferAttribute;
    const depth = baseRadius * radiusScale * (0.16 + energy * 0.28 + level * 0.2);
    const barBreath = 1 + (inhale - 0.5) * (0.08 + rms * 0.12);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < BAR_COUNT; i += 1) {
      const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
      const bin = Math.min(spectrum.length - 1, Math.floor((i / BAR_COUNT) * spectrum.length));
      const band = spectrum[bin] ?? 0;
      const amp = 0.04 + band * (0.62 + energy * 0.52 + rms * 0.4);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const h = amp * depth * barBreath;
      const rim = baseRadius * radiusScale;

      positions.setXYZ(i * 2, cos * rim, sin * rim, 0.02);
      positions.setXYZ(
        i * 2 + 1,
        cos * (rim + h),
        sin * (rim + h),
        0.04 + band * 0.12,
      );

      tmpColor.copy(flightBandColor(palette, i, BAR_COUNT, band, hue + ringHueShift));
      colors.setXYZ(i * 2, tmpColor.r, tmpColor.g, tmpColor.b);
      tmpColor.multiplyScalar(1 + band * 0.35);
      colors.setXYZ(i * 2 + 1, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  dispose(): void {
    this.ring.geometry.dispose();
    this.innerRing.geometry.dispose();
    this.bars.geometry.dispose();
    this.ringMat.dispose();
    this.innerMat.dispose();
    this.barMat.dispose();
  }
}

/** 3D-tunnel: чистый рендер без bloom/overlay, цвет только на линиях. */
export class FlightVideoRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 1, 9000);
  private readonly webgl: THREE.WebGLRenderer;
  private readonly gates: FlightGate[] = [];
  private readonly gateWorldZ: number[];
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.PointsMaterial;
  private readonly starSeed = new Float32Array(STAR_COUNT * 3);
  private readonly smooth: SmoothedBreath = {
    rms: 0.35,
    breath: 0.3,
    level: 0.35,
    energy: 0.5,
    flux: 0.08,
  };

  constructor(private readonly size: number) {
    this.webgl = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.webgl.setSize(size, size, false);
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = readCanvasBg();

    this.gateWorldZ = Array.from(
      { length: GATE_COUNT },
      (_, i) => START_CAMERA_Z - GATE_AHEAD_OFFSET - i * GATE_SPACING,
    );

    for (let i = 0; i < STAR_COUNT; i += 1) {
      this.starSeed[i * 3] = (Math.random() - 0.5) * 2;
      this.starSeed[i * 3 + 1] = (Math.random() - 0.5) * 2;
      this.starSeed[i * 3 + 2] = Math.random();
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STAR_COUNT * 3), 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(STAR_COUNT * 3), 3));
    this.starMat = new THREE.PointsMaterial({
      size: size >= 2400 ? 2.6 : size >= 1600 ? 2 : 1.4,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);

    for (let i = 0; i < GATE_COUNT; i += 1) {
      const gate = new FlightGate();
      this.gates.push(gate);
      this.scene.add(gate.root);
    }

    this.camera.position.set(0, 0, 0);
  }

  renderFrame(snapshot: FeatureSnapshot, cameraZ: number, timeSec: number): void {
    const visuals = deriveFlightAudioVisuals(snapshot);
    const smooth = this.updateSmooth(visuals);
    const spectrum = readSpectrum(snapshot);
    const { palette, pitch, centroid } = visuals;
    const { rms, breath, level, energy, flux } = smooth;

    this.camera.position.set(0, 0, cameraZ);
    this.camera.lookAt(0, 0, cameraZ - LOOK_AHEAD);

    const inhale = breathWave(timeSec, 0.65 + breath * 0.45, 0);
    const fovBreath = (inhale - 0.5) * (breath * 7 + rms * 4);
    this.camera.fov = BASE_FOV + breath * 5 + rms * 4 + fovBreath;
    this.camera.updateProjectionMatrix();

    this.recycleGates(cameraZ);
    for (let i = 0; i < GATE_COUNT; i += 1) {
      const gate = this.gates[i];
      gate.root.position.z = this.gateWorldZ[i];
      gate.update(snapshot, spectrum, visuals, smooth, timeSec, i);
    }

    this.updateStars(cameraZ, palette, pitch, centroid, flux, smooth, timeSec);
    this.webgl.render(this.scene, this.camera);
  }

  async toImageBitmap(): Promise<ImageBitmap> {
    return createImageBitmap(this.webgl.domElement);
  }

  dispose(): void {
    this.gates.forEach((g) => g.dispose());
    this.stars.geometry.dispose();
    this.starMat.dispose();
    this.webgl.dispose();
  }

  private updateSmooth(visuals: FlightAudioVisuals): SmoothedBreath {
    const rate = SMOOTH_RATE;
    this.smooth.rms = lerpSmooth(this.smooth.rms, visuals.rms, rate);
    this.smooth.breath = lerpSmooth(this.smooth.breath, visuals.breath, rate);
    this.smooth.level = lerpSmooth(this.smooth.level, visuals.level, rate);
    this.smooth.energy = lerpSmooth(this.smooth.energy, visuals.energy, rate);
    this.smooth.flux = lerpSmooth(this.smooth.flux, visuals.flux, rate);
    return this.smooth;
  }

  private recycleGates(cameraZ: number): void {
    const behindMargin = 48;
    for (let i = 0; i < GATE_COUNT; i += 1) {
      while (this.gateWorldZ[i] > cameraZ + behindMargin) {
        let minZ = this.gateWorldZ[0];
        for (let j = 1; j < GATE_COUNT; j += 1) {
          minZ = Math.min(minZ, this.gateWorldZ[j]);
        }
        this.gateWorldZ[i] = minZ - GATE_SPACING;
      }
    }
  }

  private updateStars(
    cameraZ: number,
    palette: FlightAudioVisuals['palette'],
    pitch: number,
    centroid: number,
    flux: number,
    smooth: SmoothedBreath,
    timeSec: number,
  ): void {
    const { rms, breath, level, energy } = smooth;
    const positions = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = this.stars.geometry.getAttribute('color') as THREE.BufferAttribute;
    const depthSpan = GATE_SPACING * GATE_COUNT * 2.8;
    const rushSpeed = 70 + level * 120 + rms * 140 + breath * 50;
    const inhale = breathWave(timeSec, 0.58 + breath * 0.4, 0.4);
    const armScale = 1 + (inhale - 0.5) * (0.14 + breath * 0.2 + rms * 0.12);
    const tmp = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i += 1) {
      const seedA = this.starSeed[i * 3];
      const seedB = this.starSeed[i * 3 + 1];
      const seedZ = this.starSeed[i * 3 + 2];
      const spiral = i / STAR_COUNT;
      const angle = spiral * Math.PI * 14 + seedA * 2.4;
      const arm = (26 + (seedZ * 120 + spiral * 80) * (0.68 + energy * 0.45)) * armScale;
      const x = Math.cos(angle) * arm;
      const y = Math.sin(angle) * arm;
      const rush = (timeSec * rushSpeed + seedZ * depthSpan + spiral * 180) % depthSpan;
      const z = cameraZ - 70 - rush;
      positions.setXYZ(i, x, y, z);

      tmp.copy(palette.voice)
        .lerp(palette.petal, spiral + centroid * 0.35)
        .lerp(palette.high, pitch * 0.4 + flux * 0.25)
        .lerp(palette.breath, (1 - spiral) * breath * 0.35);
      const twinkle = 0.75 + seedZ * 0.35 + rms * 0.2;
      colors.setXYZ(i, tmp.r * twinkle, tmp.g * twinkle, tmp.b * twinkle);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;

    this.starMat.size = (this.size >= 2400 ? 2.6 : this.size >= 1600 ? 2 : 1.4)
      * (1 + (inhale - 0.5) * (0.14 + rms * 0.2));
    this.starMat.opacity = 0.5 + energy * 0.32 + rms * 0.22;
  }
}

function readSpectrum(snapshot: FeatureSnapshot): Float32Array {
  if (!snapshot.spectrum?.length) {
    return new Float32Array(SPECTRUM_EXPORT_BANDS).fill(0.2);
  }
  return downsampleBars(new Float32Array(snapshot.spectrum), SPECTRUM_EXPORT_BANDS);
}
