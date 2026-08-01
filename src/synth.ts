import { invoke } from "@tauri-apps/api/core";

/**
 * Thin frontend wrapper over the Rust-side native audio engine (rustysynth +
 * cpal). All note/mute calls cross the Tauri IPC boundary to Rust, which
 * renders at native CoreAudio latency. `ready` resolves immediately — the
 * engine is initialised at app startup.
 */
export class Synth {
  readonly ready: Promise<void> = Promise.resolve();

  /** No-op: native audio doesn't need a Web Audio unlock gesture. */
  unlock(): void {}

  /** Returns the actual muted state reported by the engine. */
  setMuted(muted: boolean): Promise<boolean> {
    return invoke<boolean>("audio_set_muted", { muted });
  }

  noteOn(note: number, velocity: number): void {
    void invoke("audio_note_on", { note, velocity });
  }

  noteOff(note: number): void {
    void invoke("audio_note_off", { note });
  }
}
