// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{Child, CommandBuilder, PtyPair, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

// Config module
mod commands;
use commands::config::{
    resolve_path_command,
    load_config_command,
    save_config_command,
    ensure_directory_command,
    get_global_config,
    save_global_config,
    init_global_config,
};
use commands::workflow::{
    parse_workflow_file,
    parse_workflow_content,
    validate_workflow_command,
    render_template_command,
    get_execution_order,
};

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
    pub command: Option<String>,
    pub working_dir: Option<String>,
    pub env_vars: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionOutput {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionExit {
    pub session_id: String,
    pub code: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConversation {
    pub id: String,
    pub name: String,
    pub updated_at: String,
    pub message_count: u32,
}

pub struct SessionSlot {
    pub pty_pair: Option<PtyPair>,
    pub child: Option<Box<dyn Child + Send>>,
    pub writer: Option<Box<dyn std::io::Write + Send>>,
}

pub struct AppState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub watched_path: Mutex<Option<String>>,
    pub sessions: Mutex<HashMap<String, SessionSlot>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
            sessions: Mutex::new(HashMap::new()),
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

fn get_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        let ps = std::env::var_os("PROGRAMFILES")
            .map(|p| {
                let mut path = std::path::PathBuf::from(p);
                path.push("PowerShell");
                path.push("7");
                path.push("pwsh.exe");
                if path.exists() {
                    return path.to_string_lossy().to_string();
                }
                let sys_root = std::env::var_os("SYSTEMROOT").unwrap_or_default();
                let mut win_ps = std::path::PathBuf::from(sys_root);
                win_ps.push("System32");
                win_ps.push("WindowsPowerShell");
                win_ps.push("v1.0");
                win_ps.push("powershell.exe");
                return win_ps.to_string_lossy().to_string();
            })
            .unwrap_or_else(|| "cmd.exe".to_string());
        ps
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}

/// Get the resource path where bundled assets are stored
#[tauri::command]
fn get_resource_path(app: AppHandle) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    Ok(resource_dir.to_string_lossy().to_string())
}

/// Get the current working directory
#[tauri::command]
fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

// ===== Multi-Session PTY Commands =====

#[tauri::command]
async fn create_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    working_dir: Option<String>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell_exe = get_default_shell();
    log::info!("[Cospace] create_session {} shell: {}", session_id, shell_exe);

    let mut cmd = CommandBuilder::new(&shell_exe);
    if let Some(dir) = &working_dir {
        cmd.cwd(std::path::PathBuf::from(dir));
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        log::error!("[Cospace] create_session {} spawn failed: {}", session_id, e);
        e.to_string()
    })?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let slot = SessionSlot {
        pty_pair: Some(pair),
        child: Some(child),
        writer: Some(writer),
    };

    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), slot);
    }

    let app_clone = app.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        use std::io::Read;
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    log::info!("[Cospace] session {} reader EOF", sid);
                    let _ = app_clone.emit(
                        "session-output",
                        SessionOutput {
                            session_id: sid.clone(),
                            data: String::new(),
                        },
                    );
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(
                        "session-output",
                        SessionOutput {
                            session_id: sid.clone(),
                            data: output,
                        },
                    );
                }
                Err(e) => {
                    log::error!("[Cospace] session {} reader error: {}", sid, e);
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let _ = app_clone.emit(
            "session-exit",
            SessionExit {
                session_id: sid,
                code: 0,
            },
        );
    });

    Ok(session_id)
}

#[tauri::command]
async fn destroy_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<String, String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(mut slot) = sessions.remove(&session_id) {
        if let Some(mut child) = slot.child.take() {
            let _ = child.kill();
        }
        slot.writer = None;
        slot.pty_pair = None;
        log::info!("[Cospace] Session {} destroyed", session_id);
        Ok(format!("Session {} destroyed", session_id))
    } else {
        Err(format!("Session {} not found", session_id))
    }
}

#[tauri::command]
async fn write_to_session(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    use std::io::Write;
    let mut sessions = state.sessions.lock().await;
    if let Some(slot) = sessions.get_mut(&session_id) {
        if let Some(ref mut writer) = slot.writer {
            writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Session writer not available".to_string())
        }
    } else {
        Err(format!("Session {} not found", session_id))
    }
}

#[tauri::command]
async fn resize_session(
    state: State<'_, AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(slot) = sessions.get_mut(&session_id) {
        if let Some(ref pair) = slot.pty_pair {
            pair.master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err(format!("Session {} not found", session_id))
}

#[tauri::command]
async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let sessions = state.sessions.lock().await;
    Ok(sessions.keys().cloned().collect())
}

/// Quick line count for a file by counting newline bytes.
fn quick_line_count(path: &std::path::Path) -> u32 {
    use std::io::Read;
    if let Ok(mut f) = std::fs::File::open(path) {
        let mut buf = [0u8; 65536];
        let mut count = 0u32;
        loop {
            match f.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    count += buf[..n].iter().filter(|&&b| b == b'\n').count() as u32;
                }
                Err(_) => break,
            }
        }
        return count;
    }
    0
}

/// Format a SystemTime to ISO string for display.
fn fmt_time(t: std::time::SystemTime) -> String {
    let secs = t
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format as YYYY-MM-DD HH:MM
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let h = time_secs / 3600;
    let m = (time_secs % 3600) / 60;

    // Simple date from days since epoch
    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) {
            366
        } else {
            365
        };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let month_days = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut mo = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining < md as i64 {
            mo = i;
            break;
        }
        remaining -= md as i64;
    }
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:00Z",
        y,
        mo + 1,
        remaining + 1,
        h,
        m
    )
}

/// Scan a directory recursively for .jsonl files and return conversation metadata.
fn scan_jsonl_files(dir: &std::path::Path, conversations: &mut Vec<ClaudeConversation>) {
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Recurse into subdirectories (one level)
                if let Ok(sub_entries) = std::fs::read_dir(&path) {
                    for sub in sub_entries.flatten() {
                        let sub_path = sub.path();
                        if sub_path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                            process_jsonl_file(&sub_path, conversations);
                        }
                    }
                }
            } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                process_jsonl_file(&path, conversations);
            }
        }
    }
}

fn process_jsonl_file(path: &std::path::Path, conversations: &mut Vec<ClaudeConversation>) {
    let id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() {
        return;
    }

    // Skip if already added (dedup)
    if conversations.iter().any(|c| c.id == id) {
        return;
    }

    let updated_at = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(fmt_time)
        .unwrap_or_default();

    let message_count = quick_line_count(path);

    // Date-based name — user can rename in-app by double-clicking
    let name = if updated_at.len() >= 16 {
        format!("{} 对话", &updated_at[..16])
    } else {
        format!("对话 {}", &id[..8])
    };

    conversations.push(ClaudeConversation {
        id,
        name,
        updated_at,
        message_count,
    });
}

#[tauri::command]
async fn scan_conversations(
    workspace_path: Option<String>,
    additional_paths: Vec<String>,
) -> Result<Vec<ClaudeConversation>, String> {
    let mut all_ids = std::collections::HashSet::new();
    let mut conversations = Vec::new();

    // 1. Always scan ~/.claude/projects/ for Claude Code sessions
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let claude_projects = std::path::PathBuf::from(&home).join(".claude").join("projects");
        if claude_projects.exists() {
            if let Ok(entries) = std::fs::read_dir(&claude_projects) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        scan_jsonl_files(&path, &mut conversations);
                    } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                        process_jsonl_file(&path, &mut conversations);
                    }
                }
            }
        }
        // Also scan ~/.claude/ directly (some tools store sessions at top level)
        let claude_dir = std::path::PathBuf::from(&home).join(".claude");
        scan_jsonl_files(&claude_dir, &mut conversations);
    }

    // 2. Scan workspace path
    if let Some(wp) = &workspace_path {
        let wp_path = std::path::PathBuf::from(wp);
        if wp_path.exists() {
            // Scan workspace/.claude/
            scan_jsonl_files(&wp_path.join(".claude"), &mut conversations);
            // Scan workspace root for session files
            scan_jsonl_files(&wp_path, &mut conversations);
        }
    }

    // 3. Scan user-provided additional paths
    for p in &additional_paths {
        let ap = std::path::PathBuf::from(p);
        if ap.exists() {
            scan_jsonl_files(&ap, &mut conversations);
        }
    }

    // Deduplicate by id
    conversations.retain(|c| {
        if all_ids.contains(&c.id) {
            false
        } else {
            all_ids.insert(c.id.clone());
            true
        }
    });

    // Sort by updated_at descending
    conversations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    conversations.truncate(10);

    Ok(conversations)
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
            get_resource_path,
            get_cwd,
            create_session,
            destroy_session,
            write_to_session,
            resize_session,
            list_sessions,
            scan_conversations,
            // Config commands
            resolve_path_command,
            load_config_command,
            save_config_command,
            ensure_directory_command,
            get_global_config,
            save_global_config,
            init_global_config,
            // Workflow commands
            parse_workflow_file,
            parse_workflow_content,
            validate_workflow_command,
            render_template_command,
            get_execution_order,
        ])
        .setup(|_app| {
            log::info!("Cospace started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
