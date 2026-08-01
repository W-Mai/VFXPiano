import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export type TickFn = (dt: number, t: number) => void;

export interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  clock: THREE.Clock;
  start: () => void;
  onTick: (cb: TickFn) => () => void;
  onResize: (cb: () => void) => void;
}

export const FOV = 52;

function makeGradientBackground(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#0a0d1c");
  grad.addColorStop(0.5, "#070912");
  grad.addColorStop(1, "#04050a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Core Three.js stage with Bloom post-processing. Piano at bottom, particles
 * rise upward into the headroom. Camera uses a gentle perspective.
 */
export function createScene(container: HTMLElement): SceneCtx {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x05060a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = makeGradientBackground();
  scene.fog = new THREE.FogExp2(0x06070d, 0.004);

  const camera = new THREE.PerspectiveCamera(
    FOV,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  // Piano framed at the very bottom; particles rise far up the screen.
  camera.position.set(0, 9, 38);
  camera.lookAt(0, 6, 0);

  // --- Post-processing: Bloom for the glow ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.95, // strength
    0.7, // radius
    0.12 // threshold — faint key shimmer stays subtle, pressed glow blooms hard
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const clock = new THREE.Clock();
  const ticks = new Set<TickFn>();
  const resizeCbs = new Set<() => void>();

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const cb of resizeCbs) cb();
  }
  window.addEventListener("resize", resize);

  let running = false;
  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const cb of ticks) cb(dt, t);
    composer.render();
    requestAnimationFrame(loop);
  }

  return {
    scene,
    camera,
    renderer,
    composer,
    clock,
    start() {
      if (running) return;
      running = true;
      clock.start();
      requestAnimationFrame(loop);
    },
    onTick(cb) {
      ticks.add(cb);
      return () => ticks.delete(cb);
    },
    onResize(cb) {
      resizeCbs.add(cb);
    },
  };
}
