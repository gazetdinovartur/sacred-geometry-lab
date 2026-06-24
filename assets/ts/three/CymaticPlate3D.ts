import * as THREE from 'three';
import type { GeometryParams } from '../types';

const MODE_COUNT = 12;

export type CymaticVariant = 'ambient' | 'core';

/**
 * Cymatic-пластина: FFT → моды Chladni → «песок» на гребнях.
 * ambient — мягкое поле на весь экран; core — чёткий центр в круге.
 */
export class CymaticPlate3D {
  readonly mesh: THREE.Mesh;

  private readonly uniforms: {
    uTime: { value: number };
    uEnergy: { value: number };
    uPitch: { value: number };
    uSymmetry: { value: number };
    uBreath: { value: number };
    uFlux: { value: number };
    uGain: { value: number };
    uDispScale: { value: number };
    uSoftness: { value: number };
    uAlphaMax: { value: number };
    uColor: { value: THREE.Color };
    uAccent: { value: THREE.Color };
    uModes: { value: number[] };
  };

  private readonly baseRadius: number;
  private readonly variant: CymaticVariant;
  private readonly modeAmps = new Float32Array(MODE_COUNT);

  constructor(radius: number, variant: CymaticVariant, segments = 128) {
    this.baseRadius = radius;
    this.variant = variant;
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, segments, segments);

    const preset = variant === 'ambient'
      ? { gain: 0.72, disp: 32, soft: 0.55, alpha: 0.38 }
      : { gain: 1.45, disp: 38, soft: 0.22, alpha: 0.92 };

    this.uniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 0.5 },
      uPitch: { value: 0 },
      uSymmetry: { value: 6 },
      uBreath: { value: 0 },
      uFlux: { value: 0 },
      uGain: { value: preset.gain },
      uDispScale: { value: preset.disp },
      uSoftness: { value: preset.soft },
      uAlphaMax: { value: preset.alpha },
      uColor: { value: new THREE.Color('#ddd6f0') },
      uAccent: { value: new THREE.Color('#a898d8') },
      uModes: { value: new Array(MODE_COUNT).fill(0) },
    };

    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: PLATE_VERTEX,
        fragmentShader: PLATE_FRAGMENT,
        transparent: true,
        depthWrite: variant === 'core',
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.name = variant === 'ambient' ? 'cymatic-ambient' : 'cymatic-core';
    this.mesh.renderOrder = variant === 'ambient' ? 0 : 1;
  }

  setColors(sand: THREE.Color, accent: THREE.Color): void {
    this.uniforms.uColor.value.copy(sand);
    this.uniforms.uAccent.value.copy(accent);
  }

  updateFromParams(
    time: number,
    params: GeometryParams,
    spectrum: Float32Array,
    audioLevel: number,
    live: boolean,
  ): void {
    const energy = params.opacity;
    const level = Math.max(audioLevel, live ? 0.1 : 0.05) * energy;

    for (let i = 0; i < MODE_COUNT; i += 1) {
      const b0 = Math.min(spectrum.length - 1, i * 4);
      let amp = (spectrum[b0] + (spectrum[b0 + 1] ?? 0) + (spectrum[b0 + 2] ?? 0) + (spectrum[b0 + 3] ?? 0)) * 0.25;
      const idle = this.variant === 'ambient' ? 0.045 : 0.03;
      amp += idle + Math.sin(time * 1.3 + i * 0.7) * 0.02;
      this.modeAmps[i] = amp;
    }

    const modes = this.uniforms.uModes.value;
    for (let i = 0; i < MODE_COUNT; i += 1) {
      modes[i] = this.modeAmps[i];
    }

    this.uniforms.uTime.value = time;
    this.uniforms.uEnergy.value = level;
    this.uniforms.uPitch.value = params.pitchAngle / (Math.PI * 2);
    this.uniforms.uSymmetry.value = params.symmetry;
    this.uniforms.uBreath.value = Math.max(params.breathRing, live ? 0.06 : 0.04);
    this.uniforms.uFlux.value = params.waveAmplitude / 34;
  }

  setScale(scale: number): void {
    this.mesh.scale.setScalar(scale);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const PLATE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uPitch;
uniform float uSymmetry;
uniform float uBreath;
uniform float uFlux;
uniform float uGain;
uniform float uDispScale;
uniform float uModes[12];

varying vec2 vUv;
varying float vHeight;

float chladni(vec2 p, float t, float sym, float pitch, float energy, float breath, float flux, float gain) {
  float r = length(p);
  float theta = atan(p.y, p.x);
  float h = 0.0;
  float tm = t * (0.38 + flux * 0.85);

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float amp = uModes[i] * gain * (0.65 + energy * 0.9);
    float n = floor(fi * 0.5 + 2.0) + floor(pitch * 5.0);
    float m = mod(fi + sym, max(sym, 3.0)) + 2.0;

    h += amp * sin(n * p.x * 3.14159265 + tm * 0.35) * sin(m * p.y * 3.14159265 - tm * 0.22);
    h += amp * 0.78 * sin(sym * theta + fi * 0.55 + tm + pitch * 6.28318);
    h += amp * 0.52 * sin((n + m) * r * 5.0 - tm * 0.5) * (1.0 - r * 0.75);
  }

  return h * (0.32 + breath * 0.45) * (0.55 + energy * 0.95);
}

void main() {
  vUv = uv;
  vec2 p = (uv - 0.5) * 2.0;

  float h = chladni(p, uTime, uSymmetry, uPitch, uEnergy, uBreath, uFlux, uGain);
  vHeight = h;

  vec3 pos = position;
  pos.z += h * uDispScale;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const PLATE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uEnergy;
uniform float uBreath;
uniform float uSoftness;
uniform float uAlphaMax;

varying vec2 vUv;
varying float vHeight;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);

  float edge = smoothstep(1.0, 0.82, r);
  float grad = abs(dFdx(vHeight)) + abs(dFdy(vHeight));
  float ridge = 1.0 - smoothstep(0.0, uSoftness, grad);
  ridge = pow(ridge, 1.15);

  float breathe = 0.88 + 0.12 * sin(uBreath * 14.0);

  vec3 deep = uColor * 0.05;
  vec3 sand = mix(uColor * 0.42, uAccent, ridge * 0.75 + uEnergy * 0.45);
  sand *= (0.55 + ridge * 1.05) * breathe;

  vec3 col = mix(deep, sand, edge * (0.7 + uEnergy * 0.3));
  float alpha = edge * uAlphaMax * (0.55 + ridge * 0.45);

  gl_FragColor = vec4(col, alpha);
}
`;
