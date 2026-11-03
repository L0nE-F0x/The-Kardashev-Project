//! The desktop shell is deliberately thin: one window running the same web build as the
//! site (`play/index.html`). Game code only talks to `src/platform/platform.ts`, so this
//! wrapper can be swapped (e.g. for Electron + Steamworks) without touching the game.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running The Kardashev Project");
}
