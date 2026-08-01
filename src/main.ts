import * as THREE from "three";
import { createScene, FOV } from "./render";
import { createMidiPanel } from "./ui";
import { onMidiEvent } from "./midi";
import { Piano } from "./piano";
import { ParticleField } from "./particles";
import { attachKeyboard } from "./keyboard";
import { Synth } from "./synth";

const container = document.getElementById("app");
if (!container) throw new Error("#app container not found");

const ctx = createScene(container);

// --- Piano ---
const piano = new Piano();
piano.group.position.y = -4;
ctx.scene.add(piano.group);

// --- Particle field ---
const field = new ParticleField(FOV);
ctx.scene.add(field.points);
ctx.onResize(() => field.onResize(FOV));

// --- Lighting ---
const ambient = new THREE.AmbientLight(0x6a7090, 0.9);
ctx.scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(4, 18, 14);
ctx.scene.add(keyLight);

const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
rim.position.set(-12, 6, -10);
ctx.scene.add(rim);

// --- Audio synth ---
const synth = new Synth();

// --- Note triggers (shared by MIDI, keyboard) ---
function noteOn(note: number, velocity: number) {
  void synth.unlock();
  piano.press(note, velocity);
  const top = piano.getKeyTop(note);
  if (top) field.emitNote(top.x, top.y, top.z, note, velocity);
  synth.noteOn(note, velocity);
}
function noteOff(note: number) {
  piano.release(note);
  synth.noteOff(note);
}

// --- Overlay UI ---
const overlay = document.getElementById("overlay");
overlay?.appendChild(createMidiPanel());

// Mute toggle (top-right): silences the synth immediately.
const muteBtn = document.createElement("button");
muteBtn.className = "mute-btn";
muteBtn.textContent = "🔊 音效";
muteBtn.title = "静音 / 取消静音";
muteBtn.addEventListener("click", async () => {
  const next = !muteBtn.classList.contains("muted");
  const actual = await synth.setMuted(next);
  muteBtn.textContent = actual ? "🔇 静音" : "🔊 音效";
  muteBtn.classList.toggle("muted", actual);
});
overlay?.appendChild(muteBtn);

const loadStatus = document.createElement("div");
loadStatus.className = "load-status";
loadStatus.textContent = "初始化原生音效…";
overlay?.appendChild(loadStatus);
synth.ready
  .then(() => {
    loadStatus.textContent = "原生音效就绪 ✓";
    loadStatus.classList.add("done");
    setTimeout(() => loadStatus.remove(), 1400);
  })
  .catch(() => {
    loadStatus.textContent = "音效初始化失败";
    loadStatus.classList.add("error");
  });

const hint = document.createElement("div");
hint.className = "hint";
hint.innerHTML = `键盘试奏：<b>A S D F G H J K L</b> 白键 · <b>W E T Y U O P</b> 黑键 · <b>Z / X</b> 升降八度`;
overlay?.appendChild(hint);

// --- Inputs ---
onMidiEvent((e) => {
  if (e.kind === "on") noteOn(e.note, e.velocity);
  else noteOff(e.note);
});
attachKeyboard(noteOn, noteOff);

// --- Animation loop ---
ctx.onTick((dt, t) => {
  piano.update(dt);
  field.update(dt, t);
});

ctx.start();
console.log("[VFXPiano] scene started (piano + particles + bloom + synth)");
