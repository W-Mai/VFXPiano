use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use parking_lot::Mutex;
use rustysynth::{SoundFont, Synthesizer, SynthesizerSettings};
use std::fs::File;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Native low-latency audio: rustysynth (SF2) rendered via cpal (CoreAudio).
///
/// The cpal `Stream` on macOS is not `Send` (it holds a `*mut ()`), so it can't
/// live in a `Send + Sync` struct. We `mem::forget` it instead — the stream (and
/// its audio thread) lives for the whole process, which is exactly what we want
/// for an audio engine. The synth is shared between the stream callback and
/// note_on/off via an `Arc<Mutex<_>>`.
pub struct AudioEngine {
    synth: Arc<Mutex<Synthesizer>>,
    muted: AtomicBool,
}

impl AudioEngine {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let path = sf2_path(app)?;
        let mut file =
            File::open(&path).map_err(|e| format!("open {}: {e}", path.display()))?;
        let sound_font =
            Arc::new(SoundFont::new(&mut file).map_err(|e| format!("parse sf2: {e}"))?);

        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or("no default output device")?;
        let supported = device
            .default_output_config()
            .map_err(|e| format!("output config: {e}"))?;
        let sample_rate = supported.sample_rate().0 as i32;
        let sample_format = supported.sample_format();
        let config: StreamConfig = supported.into();

        let settings = SynthesizerSettings::new(sample_rate);
        let synth =
            Synthesizer::new(&sound_font, &settings).map_err(|e| format!("synth: {e}"))?;
        let synth = Arc::new(Mutex::new(synth));

        let synth_for_cb = Arc::clone(&synth);
        let mut left: Vec<f32> = Vec::new();
        let mut right: Vec<f32> = Vec::new();

        let stream = match sample_format {
            SampleFormat::F32 => device
                .build_output_stream::<f32, _, _>(
                    &config,
                    move |data: &mut [f32], _info: &cpal::OutputCallbackInfo| {
                        let n = data.len() / 2;
                        if left.len() < n {
                            left.resize(n, 0.0);
                            right.resize(n, 0.0);
                        }
                        {
                            let mut s = synth_for_cb.lock();
                            s.render(&mut left[..n], &mut right[..n]);
                        }
                        for i in 0..n {
                            data[i * 2] = left[i];
                            data[i * 2 + 1] = right[i];
                        }
                    },
                    |err| eprintln!("[audio] stream error: {err}"),
                    None,
                )
                .map_err(|e| format!("build stream: {e}"))?,
            fmt => return Err(format!("unsupported sample format: {fmt:?}")),
        };
        stream.play().map_err(|e| format!("play: {e}"))?;
        // Keep the stream alive for the process lifetime (it's not Send, so it
        // can't be stored in this struct).
        std::mem::forget(stream);

        eprintln!(
            "[audio] engine started: {} Hz {:?} buffer {:?}",
            sample_rate, sample_format, config.buffer_size
        );

        Ok(Self {
            synth,
            muted: AtomicBool::new(false),
        })
    }

    pub fn note_on(&self, note: i32, velocity: i32) {
        if self.muted.load(Ordering::Relaxed) {
            return;
        }
        let mut s = self.synth.lock();
        s.note_on(0, note, velocity);
    }

    pub fn note_off(&self, note: i32) {
        let mut s = self.synth.lock();
        s.note_off(0, note);
    }

    pub fn set_muted(&self, m: bool) {
        self.muted.store(m, Ordering::Relaxed);
        if m {
            let mut s = self.synth.lock();
            s.note_off_all(true);
        }
    }

    pub fn is_muted(&self) -> bool {
        self.muted.load(Ordering::Relaxed)
    }
}

fn sf2_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = app
        .path()
        .resolve("resources/TimGM6mb.sf2", tauri::path::BaseDirectory::Resource)
    {
        if p.exists() {
            return Ok(p);
        }
    }
    let p = PathBuf::from("resources/TimGM6mb.sf2");
    if p.exists() {
        return Ok(p);
    }
    Err("TimGM6mb.sf2 not found".into())
}

#[tauri::command]
pub fn audio_note_on(app: AppHandle, note: i32, velocity: i32) {
    if let Some(e) = app.state::<Option<Arc<AudioEngine>>>().inner().as_ref() {
        e.note_on(note, velocity);
    }
}

#[tauri::command]
pub fn audio_note_off(app: AppHandle, note: i32) {
    if let Some(e) = app.state::<Option<Arc<AudioEngine>>>().inner().as_ref() {
        e.note_off(note);
    }
}

#[tauri::command]
pub fn audio_set_muted(app: AppHandle, muted: bool) -> Result<bool, String> {
    if let Some(e) = app.state::<Option<Arc<AudioEngine>>>().inner().as_ref() {
        e.set_muted(muted);
        Ok(e.is_muted())
    } else {
        Err("audio engine not available".into())
    }
}
