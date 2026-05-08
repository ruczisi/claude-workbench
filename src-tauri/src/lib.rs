use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEvent {
    pub path: String,
    pub event_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamTask {
    pub id: String,
    pub name: String,
    pub status: String,
    pub progress: f32,
    pub message: Option<String>,
}

pub struct AppState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub watched_path: Mutex<Option<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn start_file_watcher(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let app_clone = app.clone();

    let (tx, rx): (_, Receiver<Result<notify::Event, notify::Error>>) = channel();

    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default().with_poll_interval(Duration::from_secs(1)),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&path_buf, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut watcher_guard = state.watcher.lock().await;
    *watcher_guard = Some(watcher);

    let mut path_guard = state.watched_path.lock().await;
    *path_guard = Some(path.clone());

    tokio::spawn(async move {
        while let Ok(res) = rx.recv() {
            match res {
                Ok(event) => {
                    for event_path in event.paths {
                        let event_type = match event.kind {
                            notify::EventKind::Create(_) => "create",
                            notify::EventKind::Modify(_) => "modify",
                            notify::EventKind::Remove(_) => "remove",
                            _ => continue,
                        };

                        let file_event = FileEvent {
                            path: event_path.to_string_lossy().to_string(),
                            event_type: event_type.to_string(),
                        };

                        let _ = app_clone.emit("file-change", file_event);
                    }
                }
                Err(e) => {
                    log::error!("File watcher error: {:?}", e);
                }
            }
        }
    });

    Ok(format!("Started watching: {}", path))
}

#[tauri::command]
pub async fn stop_file_watcher(state: State<'_, AppState>) -> Result<String, String> {
    let mut watcher_guard = state.watcher.lock().await;
    *watcher_guard = None;

    let mut path_guard = state.watched_path.lock().await;
    *path_guard = None;

    Ok("File watcher stopped".to_string())
}

#[tauri::command]
pub fn get_watched_path(state: State<'_, AppState>) -> Option<String> {
    state.watched_path.blocking_lock().clone()
}

#[tauri::command]
pub async fn update_team_tasks(
    app: AppHandle,
    tasks: Vec<TeamTask>,
) -> Result<(), String> {
    app.emit("team-tasks-update", tasks)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_file_watcher,
            stop_file_watcher,
            get_watched_path,
            update_team_tasks,
        ])
        .setup(|app| {
            log::info!("Claude Workbench started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
