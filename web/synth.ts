import { SplendidGrandPiano } from "smplr";

/**
 * Web Audio piano synth (smplr SplendidGrandPiano, sampled Steinway). For the
 * browser build — browsers have far lower Web Audio latency than Tauri's
 * WKWebView, so this is fine for a web demo. (The desktop app uses native
 * rustysynth+cpal for ~5ms latency.)
 */
export class WebSynth {
  private readonly ctx: AudioContext;
  private readonly piano: ReturnType<typeof SplendidGrandPiano>;
  readonly ready: Promise<void>;
  private resumed = false;
  private muted = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.piano = SplendidGrandPiano(this.ctx, { volume: 92 });
    this.ready = this.piano.ready.then(() => undefined);
  }

  async unlock(): Promise<void> {
    if (this.resumed) return;
    try {
      await this.ctx.resume();
      this.resumed = true;
    } catch {
      /* ignore */
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (m) {
      try {
        this.piano.stop();
      } catch {
        /* ignore */
      }
    }
  }

  noteOn(note: number, velocity: number): void {
    if (this.muted || !this.resumed) return;
    try {
      this.piano.start({ note, velocity, time: this.ctx.currentTime });
    } catch {
      /* ignore */
    }
  }

  noteOff(note: number): void {
    try {
      this.piano.stop(note);
    } catch {
      /* ignore */
    }
  }
}
