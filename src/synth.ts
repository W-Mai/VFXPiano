import { SplendidGrandPiano, Reverb } from "smplr";

/**
 * Piano sound via smplr's SplendidGrandPiano (sampled Steinway, 4 velocity
 * layers, fetched online). Adds a touch of reverb for richness.
 *
 * Web Audio requires a user gesture to start — call `unlock()` on first input.
 */
export class Synth {
  private readonly ctx: AudioContext;
  private readonly piano: ReturnType<typeof SplendidGrandPiano>;
  readonly ready: Promise<void>;
  private resumed = false;

  constructor() {
    this.ctx = new AudioContext();
    this.piano = SplendidGrandPiano(this.ctx, { volume: 92 });
    this.piano.output.addEffect("reverb", Reverb(this.ctx), 0.22);
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

  noteOn(note: number, velocity: number): void {
    if (!this.resumed) return;
    try {
      this.piano.start({ note, velocity });
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
