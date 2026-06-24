import * as THREE from 'three';
import type { GeometryParams } from '../types';

/** Центральное ядро — все параметры звука → форма, цвет, движение. */
export class SacredOrb3D {
  readonly group = new THREE.Group();

  private outer: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly outerUniforms: {
    time: { value: number };
    audioLevel: { value: number };
    distortion: { value: number };
    color: { value: THREE.Color };
  };
  private readonly glowUniforms: {
    time: { value: number };
    audioLevel: { value: number };
    color: { value: THREE.Color };
  };

  private detail = 2;
  private baseRadius: number;

  constructor(radius = 36) {
    this.baseRadius = radius;
    this.outerUniforms = {
      time: { value: 0 },
      audioLevel: { value: 0 },
      distortion: { value: 0.35 },
      color: { value: new THREE.Color('#a898d8') },
    };
    this.glowUniforms = {
      time: { value: 0 },
      audioLevel: { value: 0 },
      color: { value: new THREE.Color('#a898d8') },
    };

    this.outer = this.createWireMesh(radius, this.detail);
    this.glow = this.createGlowMesh(radius);
    this.group.add(this.glow, this.outer);
  }

  setColor(color: THREE.Color): void {
    this.outerUniforms.color.value.copy(color);
    this.glowUniforms.color.value.copy(color);
  }

  /** Прямой маппинг GeometryParams + спектр → объёмное ядро. */
  updateFromParams(
    time: number,
    params: GeometryParams,
    audioLevel: number,
    live: boolean,
  ): void {
    const energy = params.opacity;
    const level = Math.max(audioLevel, live ? 0.1 : 0.05) * energy;

    const detail = Math.min(3, Math.max(1, Math.round(params.symmetry / 3)));
    if (detail !== this.detail) {
      this.detail = detail;
      this.replaceWireMesh(detail);
    }

    const radiusScale = 0.75 + (params.radius / 200) * 0.65;
    const breath = 1 + params.breathRing * 0.14
      + Math.sin(time * 1.45) * (0.018 + params.breathRing * 0.045);
    this.group.scale.setScalar(radiusScale * breath);

    this.outerUniforms.time.value = time;
    this.outerUniforms.audioLevel.value = level;
    this.outerUniforms.distortion.value = 0.22
      + (params.waveAmplitude / 34) * 0.35
      + level * 0.55
      + params.elementCount * 0.018;

    this.glowUniforms.time.value = time;
    this.glowUniforms.audioLevel.value = level * (0.85 + params.breathRing * 0.25);

    this.group.rotation.x = params.pitchAngle * 0.42
      + Math.sin(time * 0.55) * 0.06 * energy;
    this.group.rotation.y = time * (0.06 + params.rotationSpeed * 90);
    this.group.rotation.z = Math.sin(time * 0.38 + params.pitchAngle) * 0.04 * energy;
  }

  dispose(): void {
    this.outer.geometry.dispose();
    (this.outer.material as THREE.Material).dispose();
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
  }

  private createWireMesh(radius: number, detail: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, detail),
      new THREE.ShaderMaterial({
        uniforms: this.outerUniforms,
        wireframe: true,
        transparent: true,
        depthWrite: false,
        vertexShader: ORB_VERTEX,
        fragmentShader: ORB_FRAGMENT,
      }),
    );
    mesh.name = 'sacred-orb-wire';
    return mesh;
  }

  private createGlowMesh(radius: number): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.22, 36, 36),
      new THREE.ShaderMaterial({
        uniforms: this.glowUniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
      }),
    );
  }

  private replaceWireMesh(detail: number): void {
    this.group.remove(this.outer);
    this.outer.geometry.dispose();
    (this.outer.material as THREE.Material).dispose();
    this.outer = this.createWireMesh(this.baseRadius, detail);
    this.group.add(this.outer);
  }
}

const ORB_VERTEX = /* glsl */ `
uniform float time;
uniform float audioLevel;
uniform float distortion;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 pos = position;
  float noise = snoise(pos * 0.07 + vec3(0.0, 0.0, time * 0.32));
  pos += normal * noise * distortion * (0.4 + audioLevel * 0.95);
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const ORB_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float audioLevel;
uniform float time;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 viewDir = normalize(-vPosition);
  float fresnel = 1.0 - max(0.0, dot(viewDir, vNormal));
  fresnel = pow(fresnel, 1.6 + audioLevel * 1.4);
  float pulse = 0.84 + 0.16 * sin(time * 2.1);
  vec3 emissive = color * fresnel * pulse * (0.85 + audioLevel * 0.95);
  float alpha = fresnel * (0.52 + audioLevel * 0.35);
  gl_FragColor = vec4(emissive, alpha);
}
`;

const GLOW_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float audioLevel;
uniform float time;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 viewDir = normalize(-vPosition);
  float fresnel = 1.0 - max(0.0, dot(viewDir, vNormal));
  fresnel = pow(fresnel, 2.2);
  float pulse = 0.78 + 0.22 * sin(time * 1.5);
  vec3 emissive = color * fresnel * pulse * (0.28 + audioLevel * 0.55);
  float alpha = fresnel * (0.14 + audioLevel * 0.22);
  gl_FragColor = vec4(emissive, alpha);
}
`;
