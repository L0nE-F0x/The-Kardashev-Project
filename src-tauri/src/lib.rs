pub fn run() {
    tauri::Builder::default()
        // in-app updates: signed releases from GitHub (see plugins.updater in tauri.conf.json)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running The Kardashev Project");
}
