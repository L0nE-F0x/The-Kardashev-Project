//! Settings → Display → Graphics card: run the game on the stronger GPU of a laptop that has two.
//!
//! The webview picks its GPU when its processes start, so the choice has to be made before the window exists:
//! it lives in a small file next to the app's other settings, read first thing in `run()`.
//! - Linux: the offload switches the drivers understand (`DRI_PRIME` for Mesa; NVIDIA's own driver has its own).
//! - Windows: WebView2 runs Chromium, which only moves to the discrete GPU when told to on its command line.
//! - macOS: nothing to do (the system honours the page's own "high-performance" request).
//!
//! A wrong GPU setup can leave a black window with no way to reach Settings, so the switch is on trial until the
//! player says the picture is fine (`gpu_keep`): a start that finds the last trial unconfirmed goes back to
//! automatic by itself.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

#[derive(Serialize, Deserialize, Clone)]
struct Saved {
    /// "auto" | "strong"
    prefer: String,
    /// "ok" | "new" (chosen, not started with yet) | "trying" (started with, not confirmed) | "failed"
    state: String,
}

impl Default for Saved {
    fn default() -> Self {
        Saved { prefer: "auto".into(), state: "ok".into() }
    }
}

/// What the game's Settings screen shows.
#[derive(Serialize)]
pub struct GpuStatus {
    os: &'static str,
    /// Graphics cards found (Linux), or null where the app can't count them.
    gpus: Option<u32>,
    prefer: String,
    state: String,
    /// The switches were applied when this run started.
    active: bool,
}

static FILE: OnceLock<Option<PathBuf>> = OnceLock::new();
static ACTIVE: AtomicBool = AtomicBool::new(false);

fn file() -> Option<&'static PathBuf> {
    FILE.get().and_then(|f| f.as_ref())
}

fn load() -> Saved {
    file()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn store(s: &Saved) -> Result<(), String> {
    let f = file().ok_or("no settings folder")?;
    if let Some(dir) = f.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(f, serde_json::to_string(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// What a start does with the saved choice: whether to apply the switches, and what to write back.
fn step(saved: &Saved) -> (bool, Option<Saved>) {
    if saved.prefer != "strong" {
        return (false, None);
    }
    match saved.state.as_str() {
        // the last start tried it and nobody confirmed the picture: back to automatic
        "trying" => (false, Some(Saved { prefer: "auto".into(), state: "failed".into() })),
        "new" => (true, Some(Saved { prefer: "strong".into(), state: "trying".into() })),
        "ok" => (true, None),
        _ => (false, None),
    }
}

/// Call before the window is built. `identifier` is the app's (its settings folder is named after it).
pub fn apply_at_start(identifier: &str) {
    FILE.get_or_init(|| dirs::config_dir().map(|d| d.join(identifier).join("gpu.json")));
    let (apply, write) = step(&load());
    if let Some(next) = write {
        // if the note can't be written, a bad trial could repeat forever: don't start one
        if store(&next).is_err() {
            return;
        }
    }
    if apply {
        switches();
        set_env(MARK, "1");
        ACTIVE.store(true, Ordering::Relaxed);
    } else if std::env::var_os(MARK).is_some() {
        // the game restarted itself out of the stronger card: a restart inherits the old run's environment
        unswitch();
        remove_env(MARK);
    }
}

/// Set with the switches, so a restart can tell the game's own switches from ones the player set by hand.
const MARK: &str = "KARDASHEV_GPU_SWITCHED";

/// `apply_at_start` runs first thing in `run()`, before Tauri starts any thread, so nothing else is reading the
/// environment while it changes.
fn set_env(key: &str, value: impl AsRef<std::ffi::OsStr>) {
    // SAFETY: single-threaded at this point (see above).
    unsafe { std::env::set_var(key, value) }
}

fn remove_env(key: &str) {
    // SAFETY: as in `set_env`.
    unsafe { std::env::remove_var(key) }
}

#[cfg(target_os = "linux")]
fn switches() {
    if std::path::Path::new("/proc/driver/nvidia/version").exists() {
        // NVIDIA's own driver: PRIME render offload (setting these without the driver would break GL)
        set_env("__NV_PRIME_RENDER_OFFLOAD", "1");
        set_env("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
        set_env("__VK_LAYER_NV_optimus", "NVIDIA_only");
        // Without this, WebKitGTK 2.5x on Wayland dies at start with "Error 71 (Protocol error)" on the offloaded
        // card. (Turning WebKit's DMABUF renderer off also starts, but draws about one frame a second.)
        // Measured on an Intel + RTX 4050 laptop, a campus at High, 2010×2208: Intel 17 frames/s, RTX 30 (the cap).
        set_env("__NV_DISABLE_EXPLICIT_SYNC", "1");
    } else {
        // Mesa drivers (AMD, Intel, nouveau): render on the other GPU
        set_env("DRI_PRIME", "1");
    }
}

#[cfg(target_os = "linux")]
fn unswitch() {
    for key in ["DRI_PRIME", "__NV_PRIME_RENDER_OFFLOAD", "__GLX_VENDOR_LIBRARY_NAME", "__VK_LAYER_NV_optimus", "__NV_DISABLE_EXPLICIT_SYNC"] {
        remove_env(key);
    }
}

#[cfg(target_os = "windows")]
fn switches() {
    // WebView2 appends this to its browser arguments; Chromium then renders everything on the discrete GPU
    let mut args = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    if !args.contains("force_high_performance_gpu") {
        if !args.is_empty() {
            args.push(' ');
        }
        args.push_str("--force_high_performance_gpu");
    }
    set_env("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args);
}

#[cfg(target_os = "windows")]
fn unswitch() {
    let args = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    let rest: Vec<&str> = args.split_whitespace().filter(|a| *a != "--force_high_performance_gpu").collect();
    if rest.is_empty() {
        remove_env("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
    } else {
        set_env("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", rest.join(" "));
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn switches() {}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn unswitch() {}

/// How many graphics cards the system shows (Linux: one render node each).
#[cfg(target_os = "linux")]
fn count_gpus() -> Option<u32> {
    let n = std::fs::read_dir("/dev/dri")
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("renderD"))
        .count();
    Some(n as u32)
}

#[cfg(not(target_os = "linux"))]
fn count_gpus() -> Option<u32> {
    None
}

#[tauri::command]
pub fn gpu_get() -> GpuStatus {
    let s = load();
    GpuStatus {
        os: if cfg!(target_os = "linux") { "linux" } else if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "other" },
        gpus: count_gpus(),
        prefer: s.prefer,
        state: s.state,
        active: ACTIVE.load(Ordering::Relaxed),
    }
}

/// Choose "strong" or "auto"; it takes effect at the next start (the game restarts itself).
#[tauri::command]
pub fn gpu_set(prefer: String) -> Result<(), String> {
    let strong = prefer == "strong";
    store(&Saved { prefer: if strong { "strong" } else { "auto" }.into(), state: if strong { "new" } else { "ok" }.into() })
}

/// The player looked at the picture on the stronger GPU and kept it.
#[tauri::command]
pub fn gpu_keep() -> Result<(), String> {
    let s = load();
    if s.prefer == "strong" {
        store(&Saved { prefer: s.prefer, state: "ok".into() })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(prefer: &str, state: &str) -> Saved {
        Saved { prefer: prefer.into(), state: state.into() }
    }

    #[test]
    fn automatic_never_applies() {
        assert!(!step(&Saved::default()).0);
        assert!(!step(&s("auto", "failed")).0);
    }

    #[test]
    fn a_new_choice_is_a_trial() {
        let (apply, next) = step(&s("strong", "new"));
        assert!(apply);
        assert_eq!(next.unwrap().state, "trying");
    }

    #[test]
    fn an_unconfirmed_trial_goes_back_to_automatic() {
        let (apply, next) = step(&s("strong", "trying"));
        assert!(!apply);
        let next = next.unwrap();
        assert_eq!((next.prefer.as_str(), next.state.as_str()), ("auto", "failed"));
    }

    #[test]
    fn a_kept_choice_applies_quietly() {
        let (apply, next) = step(&s("strong", "ok"));
        assert!(apply);
        assert!(next.is_none());
    }
}
