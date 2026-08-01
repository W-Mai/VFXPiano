export interface MidiEvent {
  kind: "on" | "off";
  note: number;
  velocity: number;
  channel: number;
}

/**
 * Web MIDI API wrapper (browser-native, no Rust). Enumerates MIDI inputs,
 * lets the user pick one, and dispatches note on/off events.
 */
export class WebMidi {
  private access: MIDIAccess | null = null;
  private inputs: MIDIInput[] = [];
  private current: MIDIInput | null = null;

  get supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess;
  }

  async init(): Promise<boolean> {
    if (!this.supported) return false;
    try {
      this.access = await navigator.requestMIDIAccess();
      this.refresh();
      this.access.onstatechange = () => this.refresh();
      return true;
    } catch {
      return false;
    }
  }

  private refresh() {
    if (!this.access) return;
    this.inputs = Array.from(this.access.inputs.values());
  }

  list(): string[] {
    this.refresh();
    return this.inputs.map((i) => i.name ?? "Unknown device");
  }

  async open(index: number, onEvent: (e: MidiEvent) => void): Promise<void> {
    this.close();
    this.refresh();
    const input = this.inputs[index];
    if (!input) return;
    input.onmidimessage = (msg) => {
      const d = msg.data;
      if (d.length < 3) return;
      const status = d[0];
      const channel = status & 0x0f;
      const note = d[1];
      const velocity = d[2];
      const cmd = status & 0xf0;
      if (cmd === 0x90 && velocity > 0) onEvent({ kind: "on", note, velocity, channel });
      else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0))
        onEvent({ kind: "off", note, velocity, channel });
    };
    this.current = input;
  }

  close() {
    if (this.current) this.current.onmidimessage = null;
    this.current = null;
  }
}

/** Floating MIDI device selector backed by Web MIDI. */
export function createMidiPanelWeb(
  midi: WebMidi,
  onEvent: (e: MidiEvent) => void
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "midi-panel";
  wrap.innerHTML = `
    <span class="mp-label">MIDI</span>
    <select class="mp-select"></select>
    <button class="mp-btn" id="mp-refresh" title="刷新设备列表">⟳</button>
    <button class="mp-btn mp-primary" id="mp-connect">连接</button>
    <span class="mp-status">未连接</span>
  `;
  const select = wrap.querySelector<HTMLSelectElement>(".mp-select")!;
  const status = wrap.querySelector<HTMLSpanElement>(".mp-status")!;
  const connectBtn = wrap.querySelector<HTMLButtonElement>("#mp-connect")!;
  let connected = false;

  function refresh() {
    const ports = midi.list();
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
  }

  connectBtn.addEventListener("click", async () => {
    if (connected) {
      midi.close();
      connected = false;
      status.textContent = "未连接";
      connectBtn.textContent = "连接";
      connectBtn.dataset.connected = "0";
      return;
    }
    const idx = Number(select.value);
    if (Number.isNaN(idx)) return;
    await midi.open(idx, onEvent);
    connected = true;
    status.textContent = `已连接 · ${select.selectedOptions[0]?.textContent ?? ""}`;
    connectBtn.textContent = "断开";
    connectBtn.dataset.connected = "1";
  });

  wrap.querySelector<HTMLButtonElement>("#mp-refresh")!.addEventListener("click", refresh);
  refresh();
  return wrap;
}
