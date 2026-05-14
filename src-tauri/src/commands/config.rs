use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 路径解析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathResolution {
    pub original: String,
    pub resolved: String,
    pub exists: bool,
}

/// 知识库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBaseConfig {
    pub root_path: String,
    pub concepts_dir: String,
    pub projects_dir: String,
    pub auto_inject: bool,
    pub max_results: u32,
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
    pub knowledge_base: Option<KnowledgeBaseConfig>,
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


/// 默认全局配置
pub fn default_global_config() -> GlobalConfig {
    GlobalConfig {
        assets: AssetPaths {
            templates: "".to_string(),
            data: "".to_string(),
            references: "".to_string(),
            cases: "".to_string(),
            scripts: Some("".to_string()),
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
        knowledge_base: None,
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

/// 检测结果结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedLlmConfig {
    pub provider: String,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub source: String,
}

/// 在 JSON 值中递归搜索指定键，返回找到的第一个字符串值
fn find_json_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                if keys.contains(&k.as_str()) {
                    if let Some(s) = v.as_str() {
                        return Some(s.to_string());
                    }
                }
                if let Some(found) = find_json_string(v, keys) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                if let Some(found) = find_json_string(v, keys) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

/// 尝试从指定路径的 JSON 配置文件中读取 LLM 配置
fn try_read_agent_config(path: &std::path::Path) -> Option<DetectedLlmConfig> {
    let content = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;

    let api_key = find_json_string(&json, &[
        "apiKey", "api_key", "anthropicApiKey", "openaiApiKey",
        "deepseekApiKey", "zhipuApiKey", "dashscopeApiKey",
    ])?;
    if api_key.is_empty() {
        return None;
    }

    let base_url = find_json_string(&json, &[
        "baseUrl", "base_url", "apiBaseUrl", "api_base_url",
    ]);
    let model = find_json_string(&json, &[
        "model", "defaultModel", "default_model",
    ]);
    let provider = find_json_string(&json, &[
        "provider", "apiProvider", "api_provider",
    ]);

    // 根据 API key 前缀或配置路径推断 provider
    let inferred_provider = if let Some(ref p) = provider {
        p.to_lowercase()
    } else if api_key.starts_with("sk-ant-") || api_key.starts_with("sk-ant-api03-") {
        "anthropic".to_string()
    } else if path.to_string_lossy().to_lowercase().contains("claude") {
        "anthropic".to_string()
    } else if api_key.starts_with("sk-ds-") || api_key.starts_with("sk-or-v1-") {
        "deepseek".to_string()
    } else if path.to_string_lossy().to_lowercase().contains("deepseek") {
        "deepseek".to_string()
    } else if api_key.starts_with("sk-zhipu-") || api_key.starts_with("zhipu-") {
        "zhipu".to_string()
    } else if path.to_string_lossy().to_lowercase().contains("zhipu")
        || path.to_string_lossy().to_lowercase().contains("bigmodel")
    {
        "zhipu".to_string()
    } else if api_key.starts_with("sk-") {
        // 通用 OpenAI 格式 key
        if path.to_string_lossy().to_lowercase().contains("openai") {
            "openai".to_string()
        } else if path.to_string_lossy().to_lowercase().contains("codex") {
            "openai".to_string()
        } else {
            "openai".to_string() // 默认
        }
    } else {
        "openai".to_string() // 兜底
    };

    let (default_base_url, default_model) = match inferred_provider.as_str() {
        "anthropic" => ("https://api.anthropic.com", "claude-3-haiku"),
        "deepseek" => ("https://api.deepseek.com/v1", "deepseek-v3"),
        "zhipu" => ("https://open.bigmodel.cn/api/paas/v4/", "glm-4-flash"),
        "aliyun" | "dashscope" => ("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-turbo"),
        _ => ("https://api.openai.com/v1", "gpt-4o-mini"),
    };

    Some(DetectedLlmConfig {
        provider: inferred_provider,
        api_key,
        base_url: base_url.unwrap_or_else(|| default_base_url.to_string()),
        model: model.unwrap_or_else(|| default_model.to_string()),
        source: format!("Agent 配置文件: {}", path.display()),
    })
}

/// 从环境变量自动检测 LLM 配置（降级方案）
fn detect_llm_from_env() -> Option<DetectedLlmConfig> {
    let env_configs = [
        ("ZHIPU_API_KEY", "zhipu", "https://open.bigmodel.cn/api/paas/v4/", "glm-4-flash"),
        ("DEEPSEEK_API_KEY", "deepseek", "https://api.deepseek.com/v1", "deepseek-v3"),
        ("OPENAI_API_KEY", "openai", "https://api.openai.com/v1", "gpt-4o-mini"),
        ("ANTHROPIC_API_KEY", "anthropic", "https://api.anthropic.com", "claude-3-haiku"),
        ("DASHSCOPE_API_KEY", "aliyun", "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-turbo"),
    ];

    for (env_var, provider, base_url, model) in &env_configs {
        if let Ok(api_key) = std::env::var(env_var) {
            if !api_key.is_empty() {
                return Some(DetectedLlmConfig {
                    provider: provider.to_string(),
                    api_key,
                    base_url: base_url.to_string(),
                    model: model.to_string(),
                    source: format!("环境变量 {}", env_var),
                });
            }
        }
    }
    None
}

/// 从 Agent 工具配置文件自动检测 LLM 配置
#[tauri::command]
pub fn detect_llm_config() -> Result<Option<DetectedLlmConfig>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot find home directory")?;

    // 1. 扫描 Claude Code 配置文件
    let claude_paths = [
        std::path::PathBuf::from(&home).join(".claude").join("settings.json"),
        std::path::PathBuf::from(&home).join(".claude").join("config.json"),
    ];
    #[cfg(target_os = "windows")]
    let claude_paths_win: Vec<std::path::PathBuf> = {
        let mut paths = vec![];
        if let Ok(appdata) = std::env::var("APPDATA") {
            paths.push(std::path::PathBuf::from(&appdata).join("Claude").join("settings.json"));
        }
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            paths.push(std::path::PathBuf::from(&localappdata).join("Claude").join("settings.json"));
        }
        paths
    };
    #[cfg(not(target_os = "windows"))]
    let claude_paths_win: Vec<std::path::PathBuf> = vec![];

    for path in claude_paths.iter().chain(claude_paths_win.iter()) {
        if let Some(config) = try_read_agent_config(path) {
            return Ok(Some(config));
        }
    }

    // 2. 扫描 Codex 配置文件
    let codex_paths = [
        std::path::PathBuf::from(&home).join(".codex").join("config.json"),
        std::path::PathBuf::from(&home).join(".codex").join("settings.json"),
    ];
    #[cfg(target_os = "windows")]
    let codex_paths_win: Vec<std::path::PathBuf> = {
        let mut paths = vec![];
        if let Ok(appdata) = std::env::var("APPDATA") {
            paths.push(std::path::PathBuf::from(&appdata).join("Codex").join("config.json"));
        }
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            paths.push(std::path::PathBuf::from(&localappdata).join("Codex").join("config.json"));
        }
        paths
    };
    #[cfg(not(target_os = "windows"))]
    let codex_paths_win: Vec<std::path::PathBuf> = vec![];

    for path in codex_paths.iter().chain(codex_paths_win.iter()) {
        if let Some(config) = try_read_agent_config(path) {
            return Ok(Some(config));
        }
    }

    // 3. 扫描通用 AI 工具配置目录
    let generic_paths = [
        std::path::PathBuf::from(&home).join(".config").join("ai").join("config.json"),
        std::path::PathBuf::from(&home).join(".ai").join("config.json"),
    ];
    for path in &generic_paths {
        if let Some(config) = try_read_agent_config(path) {
            return Ok(Some(config));
        }
    }

    // 4. 降级：从环境变量检测
    if let Some(config) = detect_llm_from_env() {
        return Ok(Some(config));
    }

    Ok(None)
}

/// 读取文本文件（绕过前端权限限制）
pub fn read_text_file(path: &str) -> Result<String, String> {
    let resolved = resolve_path(path)?;

    std::fs::read_to_string(&resolved)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 追加文本到文件（绕过前端权限限制）
pub fn append_text_file(path: &str, content: &str) -> Result<(), String> {
    let resolved = resolve_path(path)?;

    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&resolved)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to file: {}", e))?;
    Ok(())
}

/// 写入文本文件（绕过前端权限限制）
#[tauri::command]
pub fn write_text_file_command(path: String, content: String) -> Result<(), String> {
    write_text_file(&path, &content)?;
    Ok(())
}

/// 追加文本到文件（绕过前端权限限制）
#[tauri::command]
pub fn append_text_file_command(path: String, content: String) -> Result<(), String> {
    append_text_file(&path, &content)?;
    Ok(())
}

/// 读取文本文件（绕过前端权限限制）
#[tauri::command]
pub fn read_text_file_command(path: String) -> Result<String, String> {
    read_text_file(&path)
}
