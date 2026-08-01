import { SplendidGrandPiano } from "smplr";

/**
 * Piano sound via smplr's SplendidGrandPiano (sampled Steinway, 4 velocity
 * layers, fetched online).
 *
 * Web Audio requires a user gesture to start — call `unlock()` on first input.
 * `setMuted(true)` immediately stops all sound and suppresses new notes.
 *
 * Latency: `latencyHint: "interactive"` asks the webview for the smallest
 * output buffer. Reverb is intentionally omitted to keep the signal chain
 * short. (Web Audio in a webview still can't fully match a native DAW — if
 * latency remains too high, the fix is to render audio on the Rust side with
 * cpal + a native SoundFont player.)
 */
export class Synth {
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

  /** Resume the AudioContext — no-op after the first successful call. */
  async unlock(): Promise<void> {
    if (this.resumed) return;
    try {
      await this.ctx.resume();
      this.resumed = true;
    } catch {
      /* ignore — will retry on next call */
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Mute: immediately silence any sounding notes and suppress future ones. */
  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.stopAll();
  }

  /** Stop every currently sounding note. */
  stopAll(): void {
    try {
      this.piano.stop();
    } catch {
      /* ignore */
    }
  }

  noteOn(note: number, velocity: number): void {
    if (this.muted || !this.resumed) return;
    try {
      this.piano.start({ note, velocity, time: this.ctx.currentTime });
    } catch (e) {
      console.warn("[synth] start failed", e);
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
