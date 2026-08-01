import * as THREE from "three";
import { createScene, FOV } from "../src/render";
import { Piano } from "../src/piano";
import { ParticleField } from "../src/particles";
import { attachKeyboard } from "../src/keyboard";
import { WebMidi, createMidiPanelWeb } from "./midi";
import { WebSynth } from "./synth";
import { marked } from "marked";

const container = document.getElementById("app");
if (!container) throw new Error("#app not found");

const ctx = createScene(container);

const piano = new Piano();
piano.group.position.y = -4;
ctx.scene.add(piano.group);

const field = new ParticleField(FOV);
ctx.scene.add(field.points);
ctx.onResize(() => field.onResize(FOV));

ctx.scene.add(new THREE.AmbientLight(0x6a7090, 0.9));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(4, 18, 14);
ctx.scene.add(keyLight);
const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
rim.position.set(-12, 6, -10);
ctx.scene.add(rim);

const synth = new WebSynth();

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

const overlay = document.getElementById("overlay");

// MIDI (Web MIDI API)
const midi = new WebMidi();
midi.init().then((ok) => {
  if (ok) {
    overlay?.appendChild(
      createMidiPanelWeb(midi, (e) =>
        e.kind === "on" ? noteOn(e.note, e.velocity) : noteOff(e.note)
      )
    );
  } else {
    const note = document.createElement("div");
    note.className = "midi-panel";
    note.innerHTML = `<span class="mp-status">此浏览器不支持 Web MIDI，请用电脑键盘弹奏</span>`;
    overlay?.appendChild(note);
  }
});

// Mute
const muteBtn = document.createElement("button");
muteBtn.className = "mute-btn";
muteBtn.textContent = "🔊 音效";
muteBtn.title = "静音 / 取消静音";
muteBtn.addEventListener("click", () => {
  const m = !synth.isMuted();
  synth.setMuted(m);
  muteBtn.textContent = m ? "🔇 静音" : "🔊 音效";
  muteBtn.classList.toggle("muted", m);
});
overlay?.appendChild(muteBtn);

// Synth load status
const loadStatus = document.createElement("div");
loadStatus.className = "load-status";
loadStatus.textContent = "加载钢琴音色…";
overlay?.appendChild(loadStatus);
synth.ready
  .then(() => {
    loadStatus.textContent = "音色就绪 ✓";
    loadStatus.classList.add("done");
    setTimeout(() => loadStatus.remove(), 1400);
  })
  .catch(() => {
    loadStatus.textContent = "音色加载失败（需联网）";
    loadStatus.classList.add("error");
  });

// Hint
const hint = document.createElement("div");
hint.className = "hint";
hint.innerHTML = `键盘试奏：<b>A S D F G H J K L</b> 白键 · <b>W E T Y U O P</b> 黑键 · <b>Z / X</b> 升降八度`;
overlay?.appendChild(hint);

attachKeyboard(noteOn, noteOff);

// Help modal — fetch README and render as markdown
const helpBtn = document.getElementById("help-btn")!;
const modal = document.getElementById("help-modal")!;
const helpContent = document.getElementById("help-content")!;
const RAW = "https://raw.githubusercontent.com/W-Mai/VFXPiano/main";

function openHelp() {
  modal.classList.remove("hidden");
  if (helpContent.dataset.loaded) return;
  helpContent.textContent = "加载中…";
  fetch(`${RAW}/README.md`)
    .then((r) => r.text())
    .then((md) => {
      // rewrite relative urls to absolute raw
      md = md.replace(/\((docs\/|\.\/)/g, `(${RAW}/$1`);
      helpContent.innerHTML = marked.parse(md) as string;
      helpContent.dataset.loaded = "1";
    })
    .catch(() => {
      helpContent.textContent = "README 加载失败";
    });
}
function closeHelp() {
  modal.classList.add("hidden");
}
helpBtn.addEventListener("click", openHelp);
modal.querySelector(".modal-close")!.addEventListener("click", closeHelp);
modal.querySelector(".modal-backdrop")!.addEventListener("click", closeHelp);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeHelp();
});

ctx.onTick((dt, t) => {
  piano.update(dt);
  field.update(dt, t);
});
ctx.start();
