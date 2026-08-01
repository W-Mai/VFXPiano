import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MidiEvent {
  kind: "on" | "off";
  note: number;
  velocity: number;
  channel: number;
}

export interface MidiStatus {
  connected: boolean;
  port?: number;
  name?: string;
}

export const listMidiInputs = () => invoke<string[]>("list_midi_inputs");
export const openMidiInput = (port: number) => invoke<void>("open_midi_input", { port });
export const closeMidiInput = () => invoke<void>("close_midi_input");

export function onMidiEvent(cb: (e: MidiEvent) => void): Promise<UnlistenFn> {
  return listen<MidiEvent>("midi-event", (ev) => cb(ev.payload));
}

export function onMidiStatus(cb: (s: MidiStatus) => void): Promise<UnlistenFn> {
  return listen<MidiStatus>("midi-status", (ev) => cb(ev.payload));
}
