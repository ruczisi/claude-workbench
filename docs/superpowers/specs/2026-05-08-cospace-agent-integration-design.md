# Cospace Agent 集成设计方案 v1.0

> 日期：2026-05-08
> 状态：待实现

---

## 1. 目标

让 Cospace 能够真正启动和运行 AI Agent（Claude Code / Codex / OpenCode / 自定义），实现 Agent 进程与终端的绑定，完成第一阶段"先把 Agent 跑起来"的目标。

---

## 2. 核心架构

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript)                        │
├─────────────────────────────────────────────────────────┤
│  AgentConfig     AgentLauncher     PTYBridge           │
│  (配置存储)  →   (启动管理)   →   (进程通信)            │
└─────────────────────────────────────────────────────────┘
                            ↕ Tauri Commands
┌─────────────────────────────────────────────────────────┐
│  Backend (Rust)                                        │
├─────────────────────────────────────────────────────────┤
│  find_agent_in_path()   PTYProcess   FileWatcher        │
│  (PATH检索)              (进程管理)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 模块设计

### 3.1 配置层 `AgentConfig`

存储位置：`appStore.ts`（Zustand）

```typescript
interface AgentConfig {
  type: 'claude' | 'codex' | 'opencode' | 'custom';
  command: string;           // 实际执行的命令，如 "claude"
  args: string[];           // 启动参数，如 ["--workdir", path]
  cwd?: string;             // 工作目录（当前工作区路径）
  env?: Record<string, string>;  // 环境变量
}
```

**Agent 类型 → 默认命令映射：**

| 类型 | 默认命令 | 说明 |
|------|---------|------|
| claude | `claude` | Claude Code |
| codex | `codex` | Codex (ChatGPT) |
| opencode | `opencode` | OpenCode |
| custom | 用户配置 | 自定义命令 |

### 3.2 启动管理层 `AgentLauncher` (Rust)

**职责：**
- `find_agent_in_path(type)` — 检索 PATH 中是否存在该 Agent
- `start_agent(config)` — 启动 Agent 进程
- `stop_agent()` — 停止 Agent 进程
- `get_agent_status()` — 查询 Agent 运行状态

**Rust 端新增命令：**

```rust
#[tauri::command]
async fn find_agent_in_path(agent_type: String) -> Result<Option<String>, String>

#[tauri::command]
async fn start_agent(config: AgentConfig) -> Result<(), String>

#[tauri::command]
async fn stop_agent() -> Result<(), String>

#[tauri::command]
async fn get_agent_status() -> Result<AgentStatus, String>
```

### 3.3 PTY 进程层 `PTYProcess` (Rust)

**职责：**
- 创建伪终端（PTY）
- 绑定 Agent 子进程到 PTY
- 实时转发 stdout/stderr 到前端事件
- 处理终端输入（键盘事件）
- 进程生命周期管理

**依赖：** `portable-pty` crate

### 3.4 前端终端桥接 `PTYBridge` (React)

**职责：**
- 监听 Rust 传来的 stdout/stderr，写入 xterm.js
- 将 xterm.js 的键盘输入发给 Rust
- 处理终端 resize 事件
- 管理 Agent 会话状态

---

## 4. 工作流程

### 4.1 Agent 启动流程

```
用户选择 Agent 类型
       ↓
Sidebar 触发 startAgent
       ↓
Tauri 命令: find_agent_in_path(type)
       ↓
   找到?
   /    \
 是      否 → 尝试配置的 command
  ↓         ↓
启动进程   找到?
           /    \
         是      否 → 提示: 未找到 Agent，请配置路径
          ↓
     启动进程
```

### 4.2 PTY 数据流

```
┌────────────┐     PTY      ┌────────────┐    Tauri Event    ┌────────────┐
│  Agent     │ ←───────→   │  Rust PTY  │ ←──────────────→  │  xterm.js  │
│  Process   │   stdin/    │  Process   │    file-change    │  Terminal  │
└────────────┘   stdout     └────────────┘    样式事件        └────────────┘
```

---

## 5. 文件变更计划

### 5.1 Rust 后端 (`src-tauri/src/`)

| 文件 | 变更内容 |
|------|---------|
| `main.rs` | 新增 `find_agent_in_path`, `start_agent`, `stop_agent`, `get_agent_status` 命令 |
| `Cargo.toml` | 新增依赖 `portable-pty`, `tokio-process-manager` |

### 5.2 前端 (`src/`)

| 文件 | 变更内容 |
|------|---------|
| `stores/appStore.ts` | 扩展 AgentConfig 类型，新增 agentStatus 状态 |
| `components/Terminal.tsx` | 接入 PTYBridge，接收 Agent 输出 |
| `components/Sidebar.tsx` | Agent 选择触发启动逻辑 |

### 5.3 新增文件

| 文件 | 说明 |
|------|------|
| `src/hooks/useAgent.ts` | Agent 生命周期管理 hook |
| `src/services/agentService.ts` | Tauri 命令封装 |

---

## 6. 错误处理

| 场景 | 处理方式 |
|------|---------|
| Agent 未安装 | 提示用户安装或配置路径 |
| Agent 启动失败 | 显示错误信息到终端，提供重试选项 |
| Agent 进程异常退出 | 监听退出事件，提示用户并记录日志 |
| PTY 创建失败 | 回退到普通管道（降级方案） |

---

## 7. 验收标准

- [ ] `find_agent_in_path` 能正确检测 PATH 中的 claude/codex/opencode
- [ ] 选择 Agent 类型后，终端能显示 Agent 启动信息
- [ ] Agent 进程stdout/stderr 能实时显示在 xterm.js
- [ ] 用户输入能传递给 Agent 进程
- [ ] Agent 异常退出时有明确提示
- [ ] 切换工作区时 Agent 能正确重启

---

## 8. 后续扩展预留

- Agent 会话历史保存和恢复
- 多 Agent 并行运行
- Agent 输出自动整理成文档
- 工作流自动化触发

---

**下一步：** 实现 Agent 发现和启动功能