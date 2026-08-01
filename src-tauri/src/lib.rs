mod midi;

use midi::MidiState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(MidiState::default())
        .invoke_handler(tauri::generate_handler![
            midi::list_midi_inputs,
            midi::open_midi_input,
            midi::close_midi_input,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
