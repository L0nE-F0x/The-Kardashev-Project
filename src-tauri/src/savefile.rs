//! Files the player asks the game to keep: a photo, the Type I end card, an exported company, the playtest log.
//! The webview's own download path does nothing inside the app (a click on a download link is dropped), so the
//! page hands the bytes over and they are written into a folder named after the game: pictures under the user's
//! Pictures, everything else under Documents. Returns the full path, so the game can say where the file went.

use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::Manager;

const FOLDER: &str = "The Kardashev Project";
/// A 4K photo is a few megabytes; nothing the game saves comes near this.
const MAX_BYTES: usize = 64 * 1024 * 1024;

/// A file name with nothing in it that could leave the folder or upset a file system.
fn clean(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ' | '(' | ')') { c } else { '-' })
        .collect();
    let s = s.trim_matches(|c| c == '.' || c == ' ').to_string();
    if s.is_empty() { "kardashev".into() } else { s.chars().take(120).collect() }
}

/// `dir/name`, or `dir/name (2)`, `(3)`… when that file is already there: nothing is ever overwritten.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    (2..10_000).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|p| !p.exists()).unwrap_or(first)
}

/// The page sends the file's bytes as the request body, its name and kind ("picture" or "document") as headers.
#[tauri::command]
pub fn save_file(app: tauri::AppHandle, request: Request<'_>) -> Result<String, String> {
    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(b) => b.clone(),
        // the fallback channel (no custom protocol) delivers the bytes as a JSON array
        InvokeBody::Json(v) => serde_json::from_value(v.clone()).map_err(|_| "no file data".to_string())?,
    };
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("no file data".into());
    }
    let header = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let name = clean(&header("x-name"));
    let paths = app.path();
    let base = if header("x-kind") == "picture" { paths.picture_dir() } else { paths.document_dir() }
        .or_else(|_| paths.download_dir())
        .or_else(|_| paths.home_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join(FOLDER);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_stay_inside_the_folder() {
        assert_eq!(clean("../../etc/passwd"), "-..-etc-passwd");
        assert_eq!(clean("little-sun-day120.kardashev.json"), "little-sun-day120.kardashev.json");
        assert_eq!(clean("  .. "), "kardashev");
        assert!(!clean("a/b\\c:d").contains(['/', '\\', ':']));
    }

    #[test]
    fn nothing_is_overwritten() {
        let dir = std::env::temp_dir().join(format!("kp-savefile-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = free_path(&dir, "shot.png");
        std::fs::write(&a, b"1").unwrap();
        let b = free_path(&dir, "shot.png");
        assert_eq!(b.file_name().unwrap().to_str().unwrap(), "shot (2).png");
        std::fs::write(&b, b"2").unwrap();
        assert_eq!(free_path(&dir, "shot.png").file_name().unwrap().to_str().unwrap(), "shot (3).png");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
