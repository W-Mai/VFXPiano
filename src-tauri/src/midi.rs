use std::sync::Arc;
use midir::{MidiInput, MidiInputConnection};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::audio::AudioEngine;

#[derive(Clone, Serialize)]
pub struct MidiEvent {
    pub kind: String, // "on" | "off"
    pub note: u8,
    pub velocity: u8,
    pub channel: u8,
}

/// Holds the live MIDI input connection so it isn't dropped (which would close it).
pub struct MidiState {
    pub conn: Mutex<Option<MidiInputConnection<()>>>,
}

use std::sync::Mutex;

impl Default for MidiState {
    fn default() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn list_midi_inputs() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("vfxpiano-enumerator").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    let mut names = Vec::with_capacity(ports.len());
    for p in &ports {
        names.push(midi_in.port_name(p).map_err(|e| e.to_string())?);
    }
    Ok(names)
}

#[tauri::command]
pub fn open_midi_input(app: AppHandle, port: usize) -> Result<(), String> {
    close_inner(&app);

    let midi_in = MidiInput::new("vfxpiano").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    let port_obj = ports
        .get(port)
        .ok_or_else(|| format!("port {port} out of range"))?;
    let port_name = midi_in.port_name(port_obj).map_err(|e| e.to_string())?;

    let handle = app.clone();
    let conn = midi_in
        .connect(
            port_obj,
            "vfxpiano-in",
            move |_stamp, message, _| {
                if message.is_empty() {
                    return;
                }
                let status = message[0];
                let channel = status & 0x0f;
                match status & 0xf0 {
                    0x90 => {
                        let note = *message.get(1).unwrap_or(&0);
                        let velocity = *message.get(2).unwrap_or(&0);
                        let kind = if velocity == 0 { "off" } else { "on" };
                        let _ = handle.emit(
                            "midi-event",
                            MidiEvent {
                                kind: kind.into(),
                                note,
                                velocity,
                                channel,
                            },
                        );
                        // Route straight to the native synth (no IPC) for low latency.
                        if let Some(e) = handle
                            .state::<Option<Arc<AudioEngine>>>()
                            .inner()
                            .as_ref()
                        {
                            if velocity == 0 {
                                e.note_off(note as i32);
                            } else {
                                e.note_on(note as i32, velocity as i32);
                            }
                        }
                    }
                    0x80 => {
                        let note = *message.get(1).unwrap_or(&0);
                        let velocity = *message.get(2).unwrap_or(&0);
                        let _ = handle.emit(
                            "midi-event",
                            MidiEvent {
                                kind: "off".into(),
                                note,
                                velocity,
                                channel,
                            },
                        );
                        if let Some(e) = handle
                            .state::<Option<Arc<AudioEngine>>>()
                            .inner()
                            .as_ref()
                        {
                            e.note_off(note as i32);
                        }
                    }
                    _ => {}
                }
            },
            (),
        )
        .map_err(|e| e.to_string())?;

    let state = app.state::<MidiState>();
    *state.conn.lock().unwrap() = Some(conn);
    let _ = app.emit(
        "midi-status",
        serde_json::json!({ "connected": true, "port": port, "name": port_name }),
    );
    Ok(())
}

#[tauri::command]
pub fn close_midi_input(app: AppHandle) -> Result<(), String> {
    close_inner(&app);
    let _ = app.emit("midi-status", serde_json::json!({ "connected": false }));
    Ok(())
}

fn close_inner(app: &AppHandle) {
    let state = app.state::<MidiState>();
    let mut guard = state.conn.lock().unwrap();
    if let Some(conn) = guard.take() {
        drop(conn); // dropping closes the connection
    }
}
