// Mobile entry point (iOS and Android).
// Desktop uses main.rs which calls this run() function.
use std::io::Write;

/// Write raw image bytes to the OS temp dir and return the absolute path.
/// Used by the iOS "save to Photos" flow (the Photos plugin takes file paths).
#[tauri::command]
fn save_temp_image(name: String, bytes: Vec<u8>) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' { ch } else { '_' })
        .collect();
    let mut path = std::env::temp_dir();
    path.push(if safe.is_empty() { "image.jpg".to_string() } else { safe });
    let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_temp_image]);

    #[cfg(target_os = "ios")]
    {
        builder = builder.plugin(tauri_plugin_ios_photos::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
