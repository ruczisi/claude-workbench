use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 路径解析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathResolution {
    pub original: String,
    pub resolved: String,
    pub exists: bool,
}

/// 全局配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {
    pub assets: AssetPaths,
    pub workflows: Option<String>,
    pub default_workflow: Option<String>,
    pub agent: Option<AgentConfig>,
    pub llm: Option<LlmConfig>,
    pub search: Option<SearchConfig>,
    pub ui: Option<UiConfig>,
}

/// 知识资产路径配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetPaths {
    pub templates: String,
    pub data: String,
    pub references: String,
    pub cases: String,
    pub scripts: Option<String>,
}

/// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub r#type: String,
    pub auto_start: bool,
    pub custom_command: Option<String>,
}

/// LLM 配置（用于意图解析和提示词优化）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
}

/// 搜索配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    pub providers: Vec<SearchProvider>,
}

/// 搜索提供者
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchProvider {
    pub name: String,
    pub r#type: String,
    pub path: Option<String>,
    pub url: Option<String>,
}

/// UI 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    pub theme: Option<String>,
    pub sidebar_width: Option<u32>,
    pub preview_width: Option<u32>,
}

/// 任务级配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskConfig {
    #[serde(flatten)]
    pub global_overrides: Option<GlobalConfig>,
    pub workflow: Option<String>,
    pub metadata: Option<TaskMetadata>,
}

/// 任务元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMetadata {
    pub name: String,
    pub r#type: String,
    pub description: Option<String>,
    pub created_at: Option<u64>,
}

/// 解析路径（处理 ~ 和环境变量）
pub fn resolve_path(path: &str) -> Result<PathBuf, String> {
    let path_str = if path.starts_with("~/") {
        // 展开 ~ 为 home 目录
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "Cannot find home directory")?;
        path.replacen("~/", &format!("{}/", home), 1)
    } else {
        path.to_string()
    };

    // 展开环境变量
    let expanded = if path_str.starts_with('$') || path_str.contains("${") {
        // 简单的环境变量展开
        path_str
            .replace("$HOME", &std::env::var("HOME").unwrap_or_default())
            .replace("${HOME}", &std::env::var("HOME").unwrap_or_default())
            .replace("$USERPROFILE", &std::env::var("USERPROFILE").unwrap_or_default())
            .replace("${USERPROFILE}", &std::env::var("USERPROFILE").unwrap_or_default())
    } else {
        path_str
    };

    Ok(PathBuf::from(expanded))
}

/// 获取全局配置路径
pub fn get_global_config_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot find home directory")?;

    Ok(PathBuf::from(home).join(".cospace").join("config.json"))
}

/// 读取配置文件
pub fn load_config<T>(path: &str) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
{
    let resolved = resolve_path(path)?;

    if !resolved.exists() {
        return Err(format!("Config file not found: {}", path));
    }

    let content = std::fs::read_to_string(&resolved)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: T = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}

/// 保存配置文件
pub fn save_config<T>(path: &str, config: &T) -> Result<(), String>
where
    T: serde::Serialize,
{
    let resolved = resolve_path(path)?;

    // 确保父目录存在
    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&resolved, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// 确保目录存在
pub fn ensure_directory(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path)?;

    std::fs::create_dir_all(&resolved)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    Ok(())
}

/// 写入文本文件
pub fn write_text_file(path: &str, content: &str) -> Result<(), String> {
    let resolved = resolve_path(path)?;

    // 确保父目录存在
    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::write(&resolved, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

/// 路径是否存在
pub fn path_exists(path: &str) -> bool {
    match resolve_path(path) {
        Ok(resolved) => resolved.exists(),
        Err(_) => false,
    }
}

/// 默认全局配置
pub fn default_global_config() -> GlobalConfig {
    GlobalConfig {
        assets: AssetPaths {
            templates: "~/notebook/templates".to_string(),
            data: "~/notebook/data".to_string(),
            references: "~/notebook/references".to_string(),
            cases: "~/notebook/cases".to_string(),
            scripts: Some("~/notebook/scripts".to_string()),
        },
        workflows: Some("~/.cospace/workflows".to_string()),
        default_workflow: Some("standard-4stage".to_string()),
        agent: Some(AgentConfig {
            r#type: "claude".to_string(),
            auto_start: true,
            custom_command: None,
        }),
        llm: None,
        search: None,
        ui: Some(UiConfig {
            theme: Some("dark".to_string()),
            sidebar_width: Some(200),
            preview_width: Some(450),
        }),
    }
}

// ==================== Tauri Commands ====================

/// 解析路径（处理 ~ 和环境变量）
#[tauri::command]
pub fn resolve_path_command(path: String) -> Result<PathResolution, String> {
    let resolved = resolve_path(&path)?;
    let exists = resolved.exists();

    Ok(PathResolution {
        original: path,
        resolved: resolved.to_string_lossy().to_string(),
        exists,
    })
}

/// 加载配置文件
#[tauri::command]
pub fn load_config_command(path: String) -> Result<serde_json::Value, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}

/// 保存配置文件
#[tauri::command]
pub fn save_config_command(path: String, config: serde_json::Value) -> Result<(), String> {
    let resolved = resolve_path(&path)?;

    // 确保父目录存在
    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&resolved, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// 确保目录存在
#[tauri::command]
pub fn ensure_directory_command(path: String) -> Result<(), String> {
    ensure_directory(&path)?;
    Ok(())
}

/// 获取全局配置
#[tauri::command]
pub fn get_global_config() -> Result<GlobalConfig, String> {
    let path = get_global_config_path()?;

    if path.exists() {
        load_config::<GlobalConfig>(path.to_str().unwrap_or(""))
    } else {
        // 返回默认配置
        Ok(default_global_config())
    }
}

/// 保存全局配置
#[tauri::command]
pub fn save_global_config(config: GlobalConfig) -> Result<(), String> {
    let path = get_global_config_path()?;
    save_config(path.to_str().unwrap_or(""), &config)?;
    Ok(())
}

/// 初始化全局配置（如果不存在）
#[tauri::command]
pub fn init_global_config() -> Result<GlobalConfig, String> {
    let path = get_global_config_path()?;

    if !path.exists() {
        // 确保目录存在
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        // 保存默认配置
        let config = default_global_config();
        save_config(path.to_str().unwrap_or(""), &config)?;
        Ok(config)
    } else {
        load_config::<GlobalConfig>(path.to_str().unwrap_or(""))
    }
}

/// 读取文本文件（绕过前端权限限制）
pub fn read_text_file(path: &str) -> Result<String, String> {
    let resolved = resolve_path(path)?;

    std::fs::read_to_string(&resolved)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 写入文本文件（绕过前端权限限制）
#[tauri::command]
pub fn write_text_file_command(path: String, content: String) -> Result<(), String> {
    write_text_file(&path, &content)?;
    Ok(())
}

/// 读取文本文件（绕过前端权限限制）
#[tauri::command]
pub fn read_text_file_command(path: String) -> Result<String, String> {
    read_text_file(&path)
}
