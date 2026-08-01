# VFXPiano

A dazzling piano visualizer — play via MIDI or computer keyboard to trigger a
three-layer GPU particle bloom rising from each key, over an 88-key keyboard
that ripples with a live wave simulation.

Built with **Tauri 2 · Three.js (WebGL2 + Bloom) · Rust midir · Web Audio**.

## Features

- **88-key 3D piano** with per-key emissive glow tinted by pitch (rainbow
  spectrum, low → red, high → magenta).
- **Three-layer GPU particle effects** per note: soft rising smoke (curl-noise
  turbulence), pulsing light orbs, and sharp sparks — additive blending + Bloom.
- **Live wave simulation** along the keyboard: each press injects momentum that
  ripples outward to both sides; repeated presses build amplitude. Both ends are
  rigidly fixed and a restoring "string tension" always returns the keyboard to
  rest.
- **MIDI input** selection (cross-platform via Rust `midir`).
- **Computer-keyboard fallback** (Musical-Typing layout) so you can play without
  a MIDI device.
- **Sampled piano sound** via `smplr`'s SplendidGrandPiano (Steinway, 4 velocity
  layers) + reverb. Samples are fetched online on first load.

## Controls

| Input | Action |
|---|---|
| `A S D F G H J K L` | white keys (C–E) |
| `W E T Y U O P` | black keys |
| `Z` / `X` | octave down / up |
| MIDI device | select in the top-left panel → Connect |

## Develop

```bash
pnpm install
pnpm tauri dev
```

Requires Node, pnpm, and a Rust toolchain. On first run, Rust crates and the
piano samples are downloaded.

## Tech

| Layer | Choice |
|---|---|
| Desktop shell | Tauri 2 |
| MIDI capture | Rust `midir` (CoreMIDI / WinMM / ALSA) |
| Rendering | Three.js + WebGL2, `EffectComposer` + `UnrealBloomPass` |
| Particles | custom `THREE.Points` + GLSL, CPU physics, additive blending |
| Audio | Web Audio API + `smplr` SplendidGrandPiano |
| Wave | discretized Klein–Gordon (coupled springs + ground tension), fixed ends |
