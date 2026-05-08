# Cospace Agent 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Cospace 能够检测、安装和启动 AI Agent（Claude Code / Codex / OpenCode），实现 Agent 进程与 xterm.js 终端的绑定。

**Architecture:**
- Rust 后端：使用 `portable-pty` 创建伪终端，管理 Agent 子进程
- 前端：扩展 appStore 管理 Agent 状态，通过 Tauri 命令控制启动/停止
- 事件驱动：PTY stdout/stderr 通过 Tauri 事件实时转发到 xterm.js

**Tech Stack:** Rust (`portable-pty`, `tokio-process`), TypeScript (React/xterm.js), Tauri 2.x

---

## 文件变更总览

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src-tauri/Cargo.toml` | 修改 | 添加 `portable-pty` 依赖 |
| `src-tauri/src/main.rs` | 修改 | 新增 Agent 生命周期管理命令 |
| `src/stores/appStore.ts` | 修改 | 添加 Agent 配置和状态 |
| `src/components/Terminal.tsx` | 修改 | 接入 PTY 数据流 |
| `src/services/agentService.ts` | 新增 | Tauri 命令封装 |

---

## Task 1: Rust PTY 基础设施

**Files:**
- Modify: `src-tauri/Cargo.toml` — 添加 portable-pty 依赖
- Modify: `src-tauri/src/main.rs` — 添加 Agent 管理命令

- [ ] **Step 1: 添加 portable-pty 依赖**

打开 `src-tauri/Cargo.toml`，在 `[dependencies]` 末尾添加：

```toml
portable-pty = "0.8"
```

- [ ] **Step 2: 定义 Agent 配置和状态结构**

在 `main.rs` 开头添加：

```rust
use portable_pty::{native_pty_system, Command, Child};
use std::collections::HashMap;

// Agent 类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentType {
    Claude,
    Codex,
    OpenCode,
    Custom,
}

// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent_type: AgentType,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
}

// Agent 运行状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentStatus {
    Stopped,
    Starting,
    Running,
    Error(String),
}

// AppState 扩展
pub struct AppState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub watched_path: Mutex<Option<String>>,
    pub agent_child: Mutex<Option<Box<dyn Child + Send>>>,  // 新增
    pub agent_status: Mutex<AgentStatus>,                  // 新增
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
            agent_child: Mutex::new(None),   // 新增
            agent_status: Mutex::new(AgentStatus::Stopped),  // 新增
        }
    }
}
```

- [ ] **Step 3: 实现 `find_agent_in_path` 命令**

```rust
#[tauri::command]
async fn find_agent_in_path(agent_type: String) -> Result<Option<String>, String> {
    let cmd_names = match agent_type.as_str() {
        "claude" => vec!["claude"],
        "codex" => vec!["codex"],
        "opencode" => vec!["opencode"],
        _ => return Ok(None),
    };

    if let Ok(path_var) = std::env::var("PATH") {
        for dir in path_var.split(if cfg!(windows) { ";" } else { ":" }) {
            for cmd_name in &cmd_names {
                let full_path = PathBuf::from(dir).join(cmd_name);
                if full_path.exists() {
                    return Ok(Some(full_path.to_string_lossy().to_string()));
                }
                if cfg!(windows) {
                    let exe_path = PathBuf::from(dir).join(format!("{}.exe", cmd_name));
                    if exe_path.exists() {
                        return Ok(Some(exe_path.to_string_lossy().to_string()));
                    }
                }
            }
        }
    }

    Ok(None)
}
```

- [ ] **Step 4: 实现 `start_agent` 命令**

```rust
#[tauri::command]
async fn start_agent(
    app: AppHandle,
    state: State<'_, AppState>,
    config: AgentConfig,
) -> Result<(), String> {
    {
        let mut status = state.agent_status.lock().await;
        *status = AgentStatus::Starting;
    }

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(0, 0).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&config.command);
    for arg in &config.args {
        cmd.arg(arg);
    }
    if let Some(cwd) = &config.cwd {
        cmd.cwd(cwd);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut child_guard = state.agent_child.lock().await;
    *child_guard = Some(child);

    {
        let mut status = state.agent_status.lock().await;
        *status = AgentStatus::Running;
    }

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let app_clone = app.clone();

    tokio::spawn(async move {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            if let Ok(output) = line {
                let _ = app_clone.emit("agent-output", output);
            }
        }
    });

    Ok(())
}
```

- [ ] **Step 5: 实现 `stop_agent` 命令**

```rust
#[tauri::command]
async fn stop_agent(state: State<'_, AppState>) -> Result<(), String> {
    let mut child_guard = state.agent_child.lock().await;
    if let Some(mut child) = child_guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }

    let mut status = state.agent_status.lock().await;
    *status = AgentStatus::Stopped;

    Ok(())
}
```

- [ ] **Step 6: 实现 `get_agent_status` 命令**

```rust
#[tauri::command]
async fn get_agent_status(state: State<'_, AppState>) -> Result<AgentStatus, String> {
    let status = state.agent_status.lock().await;
    Ok(status.clone())
}
```

- [ ] **Step 7: 注册新命令**

在 `invoke_handler` 中添加新命令：

```rust
.invoke_handler(tauri::generate_handler![
    start_file_watcher,
    stop_file_watcher,
    get_watched_path,
    update_team_tasks,
    find_agent_in_path,
    start_agent,
    stop_agent,
    get_agent_status,
])
```

- [ ] **Step 8: 编译验证**

Run: `cd src-tauri && cargo check`
Expected: 无编译错误

---

## Task 2: 前端 Agent 服务封装

**Files:**
- Create: `src/services/agentService.ts`

- [ ] **Step 1: 创建 agentService.ts**

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export type AgentType = 'claude' | 'codex' | 'opencode' | 'custom';

export interface AgentConfig {
  agent_type: AgentType;
  command: string;
  args: string[];
  cwd?: string;
}

export type AgentStatus = 'stopped' | 'starting' | 'running' | { error: string };

export async function findAgentInPath(agentType: AgentType): Promise<string | null> {
  return invoke('find_agent_in_path', { agentType });
}

export async function startAgent(config: AgentConfig): Promise<void> {
  return invoke('start_agent', { config });
}

export async function stopAgent(): Promise<void> {
  return invoke('stop_agent');
}

export async function getAgentStatus(): Promise<AgentStatus> {
  return invoke('get_agent_status');
}

export function onAgentOutput(callback: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>('agent-output', (event) => {
    callback(event.payload);
  });
}
```

---

## Task 3: 扩展 appStore 的 Agent 状态

**Files:**
- Modify: `src/stores/appStore.ts`

- [ ] **Step 1: 添加 Agent 状态**

在 appStore 中添加：
```typescript
agentStatus: AgentStatus;
setAgentStatus: (status: AgentStatus) => void;
agentPath: string | null;
setAgentPath: (path: string | null) => void;
```

初始值：
```typescript
agentStatus: 'stopped',
setAgentStatus: (status: AgentStatus) => set({ agentStatus: status }),
agentPath: null,
setAgentPath: (path: string | null) => set({ agentPath: path }),
```

---

## Task 4: Terminal 组件接入 PTY 数据流

**Files:**
- Modify: `src/components/Terminal.tsx`

- [ ] **Step 1: 添加 Agent 输出监听**

在 `useEffect` 中添加：
```typescript
import { onAgentOutput } from '../services/agentService';

// 订阅 Agent 输出
let unlistenAgentOutput: (() => void) | null = null;
onAgentOutput((line) => {
  if (xtermRef.current) {
    xtermRef.current.writeln(line);
  }
}).then((unlisten) => {
  unlistenAgentOutput = unlisten;
});
```

---

## Task 5: Sidebar Agent 启动集成

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: 修改 handleSelectFolder**

添加 Agent 启动逻辑：
```typescript
if (autoStartAgent) {
  const agentPath = await findAgentInPath(activeAgent);
  if (agentPath) {
    await startAgent({
      agent_type: activeAgent,
      command: agentPath,
      args: [],
      cwd: selected,
    });
    useAppStore.getState().setAgentPath(agentPath);
    useAppStore.getState().setAgentStatus('running');
  }
}
```

---

## Task 6: 完整构建验证

- [ ] **Step 1: Rust 编译** — `cd src-tauri && cargo build --release`
- [ ] **Step 2: 前端构建** — `npm run build`
- [ ] **Step 3: 测试运行** — `npm run tauri dev`

---

## 验收标准

- [ ] `find_agent_in_path` 能检测 PATH 中的 claude/codex/opencode
- [ ] Sidebar 选择工作区后触发 Agent 启动
- [ ] Agent stdout 输出能显示在 xterm.js 终端
- [ ] Agent 异常退出时状态正确更新