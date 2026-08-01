const MIN_NOTE = 21; // A0
const MAX_NOTE = 108; // C8

/**
 * Map a MIDI note to a hue in [0,1]. Low notes → red, high notes → magenta/purple.
 * Spans 0..0.83 so we skip the green-yellow band — fancier spectrum for the viz.
 */
export function noteToHue(note: number): number {
  const t = Math.max(0, Math.min(1, (note - MIN_NOTE) / (MAX_NOTE - MIN_NOTE)));
  return t * 0.83;
}
