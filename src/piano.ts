import * as THREE from "three";
import { noteToHue } from "./colors";
import { KeyWave } from "./wave";

const MIN_NOTE = 21; // A0
const MAX_NOTE = 108; // C8

// Key dimensions (scene units). White key width = 1.0.
const WHITE_W = 1.0;
const WHITE_L = 5.5;
const WHITE_H = 0.7;
const BLACK_W = 0.58;
const BLACK_L = 3.5;
const BLACK_H = 0.7;

// Emissive glow: faint baseline always on (so the whole keyboard has a subtle
// living rainbow shimmer), peaking strongly on press.
const BASE_GLOW = 0.14;
const PEAK_GLOW = 2.8;

// Wave → visual Y displacement scale.
const WAVE_SCALE = 0.5;

const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10]); // within an octave

export function isBlackKey(note: number): boolean {
  return BLACK_OFFSETS.has(note % 12);
}

interface Key {
  note: number;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseY: number;
  press: number; // current 0..1
  target: number; // target 0..1
  glow: number; // current 0..1
  glowTarget: number;
  hue: number;
}

/**
 * 88-key grand piano mesh. Each key carries a faint constant emissive glow in
 * its own pitch color; pressing ramps that glow to a strong peak and injects
 * momentum into a 1D wave that ripples across the whole keyboard.
 */
export class Piano {
  readonly group = new THREE.Group();
  private readonly keys = new Map<number, Key>();
  private readonly whiteGeo: THREE.BoxGeometry;
  private readonly blackGeo: THREE.BoxGeometry;
  private readonly whiteCount: number;
  private readonly wave = new KeyWave();

  constructor() {
    this.whiteGeo = new THREE.BoxGeometry(WHITE_W * 0.94, WHITE_H, WHITE_L);
    this.blackGeo = new THREE.BoxGeometry(BLACK_W, BLACK_H, BLACK_L);

    // First pass: assign x positions to white keys (centered around x=0).
    const whiteX = new Map<number, number>();
    let whiteIdx = 0;
    for (let n = MIN_NOTE; n <= MAX_NOTE; n++) {
      if (!isBlackKey(n)) {
        whiteX.set(n, (whiteIdx - 25.5) * WHITE_W);
        whiteIdx++;
      }
    }
    this.whiteCount = whiteIdx;

    for (let n = MIN_NOTE; n <= MAX_NOTE; n++) {
      const hue = noteToHue(n);
      const emissive = new THREE.Color().setHSL(hue, 0.9, 0.55);
      if (isBlackKey(n)) {
        const prevWhiteX = whiteX.get(n - 1)!;
        const x = prevWhiteX + WHITE_W / 2;
        const material = new THREE.MeshStandardMaterial({
          color: 0x0c0c10,
          roughness: 0.32,
          metalness: 0.55,
          emissive,
          emissiveIntensity: BASE_GLOW,
        });
        const mesh = new THREE.Mesh(this.blackGeo, material);
        mesh.position.set(x, WHITE_H / 2 + BLACK_H / 2, -WHITE_L / 2 + BLACK_L / 2);
        this.group.add(mesh);
        this.keys.set(n, {
          note: n, mesh, material, baseY: mesh.position.y,
          press: 0, target: 0, glow: 0, glowTarget: 0, hue,
        });
      } else {
        const x = whiteX.get(n)!;
        const material = new THREE.MeshStandardMaterial({
          color: 0x9c978a,
          roughness: 0.5,
          metalness: 0.05,
          emissive,
          emissiveIntensity: BASE_GLOW,
        });
        const mesh = new THREE.Mesh(this.whiteGeo, material);
        mesh.position.set(x, 0, 0);
        this.group.add(mesh);
        this.keys.set(n, {
          note: n, mesh, material, baseY: 0,
          press: 0, target: 0, glow: 0, glowTarget: 0, hue,
        });
      }
    }

    // Fallboard / base bar behind the keys (dark brushed metal).
    const baseGeo = new THREE.BoxGeometry(this.whiteCount * WHITE_W + 2.4, 2.2, 1.6);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x12141d,
      roughness: 0.38,
      metalness: 0.72,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.35, -(WHITE_L / 2 + 0.8));
    this.group.add(base);
  }

  press(note: number, velocity: number) {
    const k = this.keys.get(note);
    if (!k) return;
    const v = Math.max(0, Math.min(1, velocity / 127));
    k.target = v;
    k.glowTarget = v;
    this.wave.impulse(note, velocity);
  }

  release(note: number) {
    const k = this.keys.get(note);
    if (!k) return;
    k.target = 0;
    k.glowTarget = 0;
  }

  update(dt: number) {
    this.wave.update(dt);
    const pressK = Math.min(1, dt * 22);
    const glowK = Math.min(1, dt * 7);
    for (const k of this.keys.values()) {
      k.press += (k.target - k.press) * pressK;
      k.glow += (k.glowTarget - k.glow) * glowK;
      // Local press depression + propagating wave displacement.
      const waveY = this.wave.displacement(k.note) * WAVE_SCALE;
      k.mesh.position.y = k.baseY - k.press * 0.28 + waveY;
      k.material.emissiveIntensity = BASE_GLOW + k.glow * (PEAK_GLOW - BASE_GLOW);
    }
  }

  /** World-space point at the top-front of a key — where particles spawn. */
  getKeyTop(note: number): THREE.Vector3 | null {
    const k = this.keys.get(note);
    if (!k) return null;
    const x = k.mesh.position.x;
    const y = k.mesh.position.y + (isBlackKey(note) ? BLACK_H / 2 : WHITE_H / 2) + 0.6;
    const z = -WHITE_L / 2;
    const v = new THREE.Vector3(x, y, z);
    v.applyMatrix4(this.group.matrixWorld);
    return v;
  }

  dispose() {
    this.whiteGeo.dispose();
    this.blackGeo.dispose();
    for (const k of this.keys.values()) k.material.dispose();
  }
}
