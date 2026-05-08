// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{Child, CommandBuilder, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentType {
    Claude,
    Codex,
    OpenCode,
    Custom,
}

impl AgentType {
    pub fn executable_name(&self) -> &str {
        match self {
            AgentType::Claude => "claude",
            AgentType::Codex => "codex",
            AgentType::OpenCode => "opencode",
            AgentType::Custom => "custom",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent_type: AgentType,
    pub command: Option<String>,        // 实际可执行文件路径
    pub working_dir: Option<String>,
    pub env_vars: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Stopped,
    Starting,
    Running,
    Error(String),
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentStatus::Stopped => write!(f, "Stopped"),
            AgentStatus::Starting => write!(f, "Starting"),
            AgentStatus::Running => write!(f, "Running"),
            AgentStatus::Error(msg) => write!(f, "Error: {}", msg),
        }
    }
}

pub struct AppState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub watched_path: Mutex<Option<String>>,
    pub agent_child: Mutex<Option<Box<dyn Child + Send>>>,
    pub agent_writer: Mutex<Option<Box<dyn std::io::Write + Send>>>,
    pub agent_status: Mutex<AgentStatus>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
            agent_child: Mutex::new(None),
            agent_writer: Mutex::new(None),
            agent_status: Mutex::new(AgentStatus::Stopped),
        }
    }
}

#[tauri::command]
async fn start_file_watcher(
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
async fn stop_file_watcher(state: State<'_, AppState>) -> Result<String, String> {
    let mut watcher_guard = state.watcher.lock().await;
    *watcher_guard = None;

    let mut path_guard = state.watched_path.lock().await;
    *path_guard = None;

    Ok("File watcher stopped".to_string())
}

#[tauri::command]
fn get_watched_path(state: State<'_, AppState>) -> Option<String> {
    state.watched_path.blocking_lock().clone()
}

#[tauri::command]
fn update_team_tasks(app: AppHandle, tasks: Vec<TeamTask>) -> Result<(), String> {
    app.emit("team-tasks-update", tasks)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn find_agent_in_path(agent_type: AgentType) -> Result<Option<String>, String> {
    let executable_name = agent_type.executable_name();
    log::info!("[Cospace] find_agent_in_path searching for: {}", executable_name);

    #[cfg(target_os = "windows")]
    {
        // Windows: 先搜几个常见位置
        let common_paths = vec![
            std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
                .join("claude"),
            std::path::PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default())
                .join(".local")
                .join("bin"),
            std::path::PathBuf::from(std::env::var("APPDATA").unwrap_or_default())
                .join("npm"),
        ];

        for base in &common_paths {
            for ext in &["", ".exe", ".cmd", ".bat"] {
                let candidate = base.join(format!("{}{}", executable_name, ext));
                let path_str = candidate.to_string_lossy();
                log::info!("[Cospace] checking: {}", path_str);
                if candidate.exists() {
                    log::info!("[Cospace] FOUND: {}", path_str);
                    return Ok(Some(path_str.to_string()));
                }
            }
        }
    }

    // 标准 PATH 搜索
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for ext in &["", ".exe", ".cmd", ".bat"] {
                let candidate = dir.join(format!("{}{}", executable_name, ext));
                let path_str = candidate.to_string_lossy();
                if candidate.exists() {
                    log::info!("[Cospace] FOUND in PATH: {}", path_str);
                    return Ok(Some(path_str.to_string()));
                }
            }
        }
    }

    log::warn!("[Cospace] agent not found: {}", executable_name);
    Ok(None)
}

#[tauri::command]
async fn start_agent(
    app: AppHandle,
    state: State<'_, AppState>,
    config: AgentConfig,
) -> Result<String, String> {
    // Check if agent is already running
    {
        let status = state.agent_status.lock().await;
        if *status != AgentStatus::Stopped {
            return Err(format!("Agent is already {}", status));
        }
    }

    // Set status to starting
    {
        let mut status = state.agent_status.lock().await;
        *status = AgentStatus::Starting;
    }

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // 使用传入的 command 路径（绝对路径），否则回退到 executable_name
    let executable = config.command.unwrap_or_else(|| config.agent_type.executable_name().to_string());
    log::info!("[Cospace] Starting agent: executable={}", executable);

    let mut cmd = CommandBuilder::new(executable);

    if let Some(working_dir) = config.working_dir {
        cmd.cwd(std::path::PathBuf::from(working_dir));
    }

    if let Some(env_vars) = config.env_vars {
        for (key, value) in env_vars {
            cmd.env(&key, &value);
        }
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        log::error!("[Cospace] Failed to spawn agent: {}", e);
        e.to_string()
    })?;

    log::info!("[Cospace] Agent child process spawned successfully");

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Store child process and writer
    {
        let mut child_guard = state.agent_child.lock().await;
        *child_guard = Some(child);
        let mut writer_guard = state.agent_writer.lock().await;
        *writer_guard = Some(writer);
    }

    // Set status to running
    {
        let mut status = state.agent_status.lock().await;
        *status = AgentStatus::Running;
    }

    let app_clone = app.clone();
    tokio::spawn(async move {
        use std::io::Read;
        let mut reader = reader;
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = app_clone.emit("agent-output", "");
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("agent-output", output);
                }
                Err(e) => {
                    let _ = app_clone.emit("agent-error", e.to_string());
                    break;
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }
        let _ = app_clone.emit("agent-exit", 0);
    });

    Ok(format!("Started agent: {}", config.agent_type.executable_name()))
}

#[tauri::command]
async fn stop_agent(state: State<'_, AppState>) -> Result<String, String> {
    {
        let mut child_guard = state.agent_child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill();
        }
    }
    {
        let mut writer_guard = state.agent_writer.lock().await;
        *writer_guard = None;
    }

    let mut status = state.agent_status.lock().await;
    *status = AgentStatus::Stopped;

    Ok("Agent stopped".to_string())
}

#[tauri::command]
async fn get_agent_status(state: State<'_, AppState>) -> Result<AgentStatus, String> {
    let status = state.agent_status.lock().await;
    Ok(status.clone())
}

#[tauri::command]
async fn write_to_agent(state: State<'_, AppState>, data: String) -> Result<(), String> {
    let mut writer_guard = state.agent_writer.lock().await;
    if let Some(ref mut writer) = *writer_guard {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Agent not running".to_string())
    }
}

fn main() {
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
            find_agent_in_path,
            start_agent,
            stop_agent,
            get_agent_status,
            write_to_agent,
        ])
        .setup(|_app| {
            log::info!("Cospace started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}