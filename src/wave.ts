const N = 88;
const MIN_NOTE = 21; // A0

const COUPLING = 6.0; // neighbor spring stiffness → wave speed
const RESTORE = 5.0; // ground spring pulling each key back to rest (the string's tension)
const DRAG = 1.5; // velocity damping per second
const IMPULSE = 5.5; // momentum injected per press (scaled by velocity)

/**
 * 1D wave simulation along the 88 keys (indexed by pitch, left→right).
 * A press injects momentum at that key's node; the ripple propagates to both
 * neighbors and decays. Repeated presses accumulate velocity → larger amplitude.
 *
 * Both ends are rigidly fixed (u = 0), and each key is also pulled toward its
 * rest position by a ground spring (RESTORE) — this is the "string tension"
 * that prevents the whole keyboard from sagging under rapid playing and always
 * returns it to rest.
 *
 * Discretized Klein–Gordon: u_tt = c² u_xx − ω₀² u, with fixed-end boundaries.
 */
export class KeyWave {
  private readonly u = new Float32Array(N); // displacement
  private readonly v = new Float32Array(N); // velocity
  private readonly a = new Float32Array(N); // acceleration (scratch)

  /** Inject a downward impulse at `note` (like dropping a stone into water). */
  impulse(note: number, velocity: number) {
    const i = note - MIN_NOTE;
    if (i < 0 || i >= N) return;
    this.v[i] -= (velocity / 127) * IMPULSE;
  }

  update(dt: number) {
    const k = COUPLING;
    const r = RESTORE;
    const drag = Math.max(0, 1 - DRAG * dt);
    // Interior nodes: neighbor coupling (traveling wave) + ground spring (restoring tension).
    for (let i = 1; i < N - 1; i++) {
      this.a[i] = k * (this.u[i - 1] + this.u[i + 1] - 2 * this.u[i]) - r * this.u[i];
    }
    for (let i = 1; i < N - 1; i++) {
      this.v[i] = this.v[i] * drag + this.a[i] * dt;
      this.u[i] += this.v[i] * dt;
    }
    // Pin both ends rigidly.
    this.u[0] = 0;
    this.v[0] = 0;
    this.u[N - 1] = 0;
    this.v[N - 1] = 0;
  }

  /** Current vertical displacement (wave units) for a key. */
  displacement(note: number): number {
    const i = note - MIN_NOTE;
    if (i < 0 || i >= N) return 0;
    return this.u[i];
  }
}
