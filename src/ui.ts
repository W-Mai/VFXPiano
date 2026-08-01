import {
  closeMidiInput,
  listMidiInputs,
  onMidiStatus,
  openMidiInput,
} from "./midi";

/**
 * Floating MIDI device selector. Sits in the overlay (top-left), lets the user
 * pick an input and connect. Updates its own state from `midi-status` events.
 */
export function createMidiPanel(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "midi-panel";
  wrap.innerHTML = `
    <span class="mp-label">MIDI</span>
    <select id="mp-select" class="mp-select"></select>
    <button id="mp-refresh" class="mp-btn" title="刷新设备列表">⟳</button>
    <button id="mp-connect" class="mp-btn mp-primary">连接</button>
    <span id="mp-status" class="mp-status">未连接</span>
  `;

  const select = wrap.querySelector<HTMLSelectElement>("#mp-select")!;
  const status = wrap.querySelector<HTMLSpanElement>("#mp-status")!;
  const connectBtn = wrap.querySelector<HTMLButtonElement>("#mp-connect")!;

  async function refresh() {
    try {
      const ports = await listMidiInputs();
      select.innerHTML = "";
      if (ports.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "（无设备）";
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        return;
      }
      ports.forEach((name, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = name;
        select.appendChild(opt);
      });
    } catch (e) {
      status.textContent = "枚举失败";
      console.error("[midi] enumerate failed", e);
    }
  }

  connectBtn.addEventListener("click", async () => {
    if (connectBtn.dataset.connected === "1") {
      await closeMidiInput();
      return;
    }
    const idx = Number(select.value);
    if (Number.isNaN(idx)) return;
    try {
      await openMidiInput(idx);
    } catch (e) {
      status.textContent = "连接失败";
      console.error("[midi] open failed", e);
    }
  });

  wrap.querySelector<HTMLButtonElement>("#mp-refresh")!.addEventListener("click", refresh);

  onMidiStatus((s) => {
    if (s.connected) {
      status.textContent = `已连接 · ${s.name ?? ""}`;
      connectBtn.textContent = "断开";
      connectBtn.dataset.connected = "1";
    } else {
      status.textContent = "未连接";
      connectBtn.textContent = "连接";
      connectBtn.dataset.connected = "0";
    }
  });

  refresh();
  return wrap;
}
