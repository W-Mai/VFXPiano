mod audio;
mod midi;

use audio::AudioEngine;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Native audio engine (SF2 + cpal). Non-fatal if it fails — visuals
            // still work, audio is just silent.
            match AudioEngine::new(app.handle()) {
                Ok(engine) => {
                    app.manage(Some(Arc::new(engine)));
                }
                Err(e) => {
                    eprintln!("[audio] init failed: {e}");
                    app.manage(Option::<Arc<AudioEngine>>::None);
                }
            }
            Ok(())
        })
        .manage(midi::MidiState::default())
        .invoke_handler(tauri::generate_handler![
            midi::list_midi_inputs,
            midi::open_midi_input,
            midi::close_midi_input,
            audio::audio_note_on,
            audio::audio_note_off,
            audio::audio_set_muted,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
