import * as THREE from "three";
import { noteToHue } from "./colors";

const MAX_PARTICLES = 8000;

const T_SMOKE = 0;
const T_ORB = 1;
const T_SPARK = 2;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * uScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.001) discard;
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float falloff = smoothstep(0.5, 0.0, d);
    falloff = pow(falloff, 1.5);
    float core = smoothstep(0.22, 0.0, d);
    vec3 c = vColor + core * 0.7;
    gl_FragColor = vec4(c, falloff * vAlpha);
  }
`;

/** Cheap curl-like noise approximation for organic drift. */
function curl(x: number, y: number, z: number, t: number, s: number, out: THREE.Vector3) {
  out.set(
    Math.sin(y * 0.6 + t * 0.7 + s) + Math.cos(z * 0.4 + t * 0.5),
    Math.sin(z * 0.5 + t * 1.1 + s * 1.7) + Math.cos(x * 0.4 + t * 0.6),
    Math.sin(x * 0.4 + t * 0.9 + s * 0.6) + Math.cos(y * 0.5 + t * 0.8)
  );
  out.multiplyScalar(0.35);
}

/**
 * Unified GPU-rendered particle field with three layers (smoke / orb / spark).
 * CPU integrates physics each frame; a custom additive shader renders soft
 * glowing point sprites. Spawned per note from the key top.
 */
export class ParticleField {
  readonly points: THREE.Points;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;

  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly aSize: Float32Array;
  private readonly aAlpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly type: Int8Array;
  private readonly baseSize: Float32Array;
  private readonly seed: Float32Array;

  private cursor = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(fovDeg: number) {
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.aSize = new Float32Array(MAX_PARTICLES);
    this.aAlpha = new Float32Array(MAX_PARTICLES);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.type = new Int8Array(MAX_PARTICLES);
    this.baseSize = new Float32Array(MAX_PARTICLES);
    this.seed = new Float32Array(MAX_PARTICLES);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uScale: { value: this.computeScale(fovDeg) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  private computeScale(fovDeg: number): number {
    const h = window.innerHeight;
    return h / (2 * Math.tan((fovDeg * Math.PI) / 180));
  }

  onResize(fovDeg: number) {
    this.mat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    this.mat.uniforms.uScale.value = this.computeScale(fovDeg);
  }

  private nextIndex(): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return i;
  }

  private spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    r: number, g: number, b: number,
    size: number, life: number, type: number
  ) {
    const i = this.nextIndex();
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.aSize[i] = size;
    this.aAlpha[i] = 0;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.type[i] = type;
    this.baseSize[i] = size;
    this.seed[i] = Math.random() * 1000;
  }

  /** Emit a three-layer burst from a key top, scaled by velocity. */
  emitNote(x: number, y: number, z: number, note: number, velocity: number) {
    const hue = noteToHue(note);
    const v = Math.max(0, Math.min(1, velocity / 127));

    // --- Smoke layer: soft rising plume ---
    this.color.setHSL(hue, 0.75, 0.55);
    const smokeN = 10 + Math.floor(v * 8);
    for (let k = 0; k < smokeN; k++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.4,
        y + Math.random() * 0.2,
        z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        0.6 + Math.random() * 0.8,
        (Math.random() - 0.5) * 0.4,
        this.color.r, this.color.g, this.color.b,
        0.55 + Math.random() * 0.4,
        5.0 + Math.random() * 2.5,
        T_SMOKE
      );
    }

    // --- Orb layer: bright pulsing core ---
    this.color.setHSL(hue, 1.0, 0.6);
    const orbN = 2 + Math.floor(v * 3);
    for (let k = 0; k < orbN; k++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.2,
        y + Math.random() * 0.1,
        z + (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.15,
        0.4 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.15,
        this.color.r, this.color.g, this.color.b,
        0.5 + Math.random() * 0.3,
        3.5 + Math.random() * 1.5,
        T_ORB
      );
    }

    // --- Spark layer: fast sharp streaks ---
    this.color.setHSL(hue, 0.95, 0.72);
    const sparkN = 12 + Math.floor(v * 20);
    for (let k = 0; k < sparkN; k++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random();
      const speed = 2.5 + Math.random() * 4 * (0.6 + v);
      this.spawn(
        x + (Math.random() - 0.5) * 0.15,
        y,
        z + (Math.random() - 0.5) * 0.15,
        Math.cos(ang) * rad * speed * 0.5,
        1.5 + Math.random() * speed,
        Math.sin(ang) * rad * speed * 0.5,
        this.color.r, this.color.g, this.color.b,
        0.07 + Math.random() * 0.07,
        0.35 + Math.random() * 0.45,
        T_SPARK
      );
    }
  }

  update(dt: number, time: number) {
    const n = MAX_PARTICLES;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) {
        this.aAlpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.aAlpha[i] = 0;
        continue;
      }
      const i3 = i * 3;
      const x = this.pos[i3], y = this.pos[i3 + 1], z = this.pos[i3 + 2];
      const t = this.type[i];
      const lt = 1 - this.life[i] / this.maxLife[i]; // 0..1 over lifetime
      const s = this.seed[i];

      if (t === T_SMOKE) {
        curl(x, y, z, time, s, this.tmp);
        this.vel[i3] += this.tmp.x * dt;
        this.vel[i3 + 1] += (this.tmp.y * 0.5 + 4.0) * dt; // buoyancy
        this.vel[i3 + 2] += this.tmp.z * dt;
        const drag = Math.max(0, 1 - 0.3 * dt);
        this.vel[i3] *= drag; this.vel[i3 + 1] *= drag; this.vel[i3 + 2] *= drag;
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        this.aSize[i] = this.baseSize[i] * (1 + lt * 2.5);
        let a = 0.5;
        if (lt < 0.18) a *= lt / 0.18;
        else if (lt > 0.45) a *= 1 - (lt - 0.45) / 0.55;
        this.aAlpha[i] = a;
      } else if (t === T_ORB) {
        this.vel[i3 + 1] += 1.8 * dt;
        this.vel[i3] *= Math.max(0, 1 - 0.5 * dt);
        this.vel[i3 + 2] *= Math.max(0, 1 - 0.5 * dt);
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        const pulse = 1 + Math.sin(time * 8 + s) * 0.15;
        this.aSize[i] = this.baseSize[i] * pulse * (1 + lt * 0.3);
        let a = 1.0;
        if (lt > 0.5) a *= 1 - (lt - 0.5) / 0.5;
        this.aAlpha[i] = a;
      } else {
        // T_SPARK
        this.vel[i3 + 1] -= 4.5 * dt; // gravity
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        this.aSize[i] = this.baseSize[i] * (1 - lt * 0.6);
        this.aAlpha[i] = (1 - lt) * 1.0;
      }
    }

    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}
