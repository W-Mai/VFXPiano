// Computer-keyboard fallback so the viz can be driven without a MIDI device.
// Musical-Typing layout: home row = white keys, upper row = black keys,
// Z / X = octave down / up.

const WHITE: Record<string, number> = {
  KeyA: 0,
  KeyS: 2,
  KeyD: 4,
  KeyF: 5,
  KeyG: 7,
  KeyH: 9,
  KeyJ: 11,
  KeyK: 12,
  KeyL: 14,
  Semicolon: 16,
};

const BLACK: Record<string, number> = {
  KeyW: 1,
  KeyE: 3,
  KeyT: 6,
  KeyY: 8,
  KeyU: 10,
  KeyO: 13,
  KeyP: 15,
};

const BASE_NOTE = 60; // C4 at octave 5
const DEFAULT_OCTAVE = 5;
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 7;
const VELOCITY = 100;

/**
 * Wire computer keyboard → note on/off. Returns the current octave (for UI).
 * Callbacks receive a 0..127 velocity.
 */
export function attachKeyboard(
  onNoteOn: (note: number, velocity: number) => void,
  onNoteOff: (note: number) => void,
  onOctaveChange?: (octave: number) => void
): void {
  let octave = DEFAULT_OCTAVE;
  const held = new Set<string>();

  const noteForCode = (code: string): number | null => {
    const off = WHITE[code] ?? BLACK[code];
    if (off == null) return null;
    return BASE_NOTE + (octave - DEFAULT_OCTAVE) * 12 + off;
  };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "KeyZ") {
      octave = Math.max(MIN_OCTAVE, octave - 1);
      onOctaveChange?.(octave);
      return;
    }
    if (e.code === "KeyX") {
      octave = Math.min(MAX_OCTAVE, octave + 1);
      onOctaveChange?.(octave);
      return;
    }
    const note = noteForCode(e.code);
    if (note == null) return;
    if (held.has(e.code)) return;
    held.add(e.code);
    onNoteOn(note, VELOCITY);
  });

  window.addEventListener("keyup", (e) => {
    if (!held.has(e.code)) return;
    held.delete(e.code);
    const note = noteForCode(e.code);
    if (note != null) onNoteOff(note);
  });
}
