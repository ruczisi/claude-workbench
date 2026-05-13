# 开发记录：Phase 3 - 提示词优化 + Agent 桥接（PTY）

> 日期：2026-05-14
> 版本：v0.2.2-alpha
> 任务：Phase 3 - Agent 自动化桥接

---

## 需求概述

实现自动生成优化提示词并通过 PTY 与外部 Agent 工具（Claude Code、Codex 等）交互：
1. 根据任务上下文动态生成优化后的 Agent 提示词
2. 自动检测系统中安装的 Agent 工具
3. 通过 PTY spawn Agent 进程，自动注入工作目录和提示词
4. 解析 Agent 输出，提取关键信息（文件路径、完成状态）
5. 冗余输出放入可折叠详情区域

---

## 实现方案

### 1. 提示词优化器

新建 `src/services/promptOptimizer.ts`：

- `optimizeAgentPrompt(context)` — 根据任务 + 阶段上下文生成优化提示词
  - 包含任务名称、描述、当前阶段信息
  - 包含工作目录路径
  - 包含预期输出文件列表（带路径）
  - 包含原始 agentContext（工作流阶段定义的系统提示）
  - 附加输出格式要求（Markdown、标注来源、报告文件路径）
- `extractKeyInstructions(agentContext)` — 从原始 agentContext 中提取关键指令
- 返回 `OptimizedPrompt` 结构：text（完整提示词）、keyInstructions、expectedOutputs、stageName

### 2. Agent 运行器

新建 `src/services/agentRunner.ts`：

- `AgentRunner` 类（单例）— 管理 PTY 会话生命周期
  - `startAgent(task, stage, agentConfig)`：
    1. 调用 `optimizeAgentPrompt` 生成优化提示词
    2. 调用 Rust `create_session` Tauri command（工作目录设为任务目录）
    3. 监听 `session-output` 和 `session-exit` Tauri 事件
    4. 向 PTY 写入 Agent 启动命令（`claude`/`codex`/自定义）
    5. 等待 2 秒初始化后注入提示词（逐行发送）
  - `stopAgent()`：调用 `destroy_session`，清理事件监听
  - `sendInput(input)`：向运行中的 Agent 发送交互输入
  - 输出解析：`extractKeyInfo` 检测文件写入、完成信号、错误信息

支持的 Agent 工具：
| 类型 | 启动命令 | 说明 |
|------|----------|------|
| Claude Code | `claude` | 启动交互式 Claude Code 会话 |
| Codex | `codex` | 启动 Codex 会话 |
| 自定义 | 用户配置 | 任意命令 |

### 3. Agent 输出面板

新建 `src/components/AgentOutputPanel.tsx`：

- **顶部控制栏**：运行状态指示器、启动/停止按钮、显示/隐藏详情按钮
- **关键信息区**：提取的文件写入、完成确认、错误信息（带图标和颜色）
- **详情区**（可折叠）：完整终端输出流（monospace 字体）
- **交互输入**（运行时显示）：向 Agent 发送额外指令

### 4. Workbench 集成

修改 `src/components/Workbench.tsx`：
- 三标签页布局：对话 / Agent 运行 / Agent 指令
- "Agent 运行" 标签：嵌入 AgentOutputPanel
- "Agent 指令" 标签：保留原有 agentContext 显示 + 复制按钮

修改 `src/App.tsx`：
- 新增 agent runner 状态：session、running、output、keyInfos
- Agent 启动/停止/输入处理器
- 切换任务时清理 agent 状态
- Agent 退出时向聊天添加系统消息

---

## 测试策略

| 测试文件 | 类型 | 数量 | 说明 |
|----------|------|------|------|
| `tests/unit/promptOptimizer.test.ts` | 单元测试 | 9 | 提示词生成、输出提取、边界条件 |

**测试结果**：79/79 全库测试通过（含 Phase 1、2、3）

---

## 编译验证

- TypeScript：`tsc --noEmit` 零错误
- 全量测试：70/70 通过（新增 9 个 promptOptimizer 测试）

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/promptOptimizer.ts` | 新增 | 提示词优化器 |
| `src/services/agentRunner.ts` | 新增 | Agent PTY 运行器 |
| `src/components/AgentOutputPanel.tsx` | 新增 | Agent 输出展示面板 |
| `src/components/Workbench.tsx` | 修改 | 三标签页（对话/Agent运行/Agent指令） |
| `src/App.tsx` | 修改 | Agent runner 状态管理和事件处理 |
| `tests/unit/promptOptimizer.test.ts` | 新增 | 9 个单元测试 |

---

## 验收标准检查

- [x] 根据任务上下文动态生成优化后的 Agent 提示词
- [x] 自动检测 Agent 工具配置（Claude Code / Codex / 自定义）
- [x] 通过 PTY spawn Agent 进程，自动注入工作目录和提示词
- [x] 解析 Agent 输出，提取关键信息（文件路径、完成状态）显示
- [x] 冗余输出放入可折叠详情区域
- [x] 用户可与运行中的 Agent 交互（发送额外输入）

---

## 已知限制

- Agent 启动命令假设 `claude`/`codex` 已在系统 PATH 中
- Claude Code 初始化需要约 2 秒等待时间（硬编码）
- 提示词逐行注入可能有输入速度限制
- 实际 Agent 输出解析依赖正则匹配，可能漏检某些输出格式

---

## 下一步

根据 v2.5 计划，Phase 4：任务自动推进（闭环）
- 文件监听检测到阶段输出文件更新 → 提示用户确认完成
- 用户确认后自动推进到下一阶段
- 自动为下一阶段生成并注入新提示词
- 全任务完成后总结报告
