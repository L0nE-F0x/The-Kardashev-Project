mod fastdl;
mod savefile;

pub fn run() {
    tauri::Builder::default()
        // in-app updates: signed releases from GitHub (see plugins.updater in tauri.conf.json)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // "Built by ApexForge" opens in the system browser (the capability allows only that page)
        .plugin(tauri_plugin_opener::init())
        // the update download in pieces over several connections (src/fastdl.rs); the updater installs it
        // files the player saves (photos, the end card, exported companies): src/savefile.rs
        .invoke_handler(tauri::generate_handler![fastdl::update_fast, savefile::save_file])
        .run(tauri::generate_context!())
        .expect("error while running The Kardashev Project");
}
