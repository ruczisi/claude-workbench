# 开发记录：设置面板 + LLM/Agent 配置

> 日期：2026-05-13
> 版本：v0.2.0-alpha
> 任务：Phase 1 - 设置面板与 LLM/Agent 配置

---

## 需求概述

实现完整的设置面板，支持：
1. LLM 配置（提供商选择、API Key、Base URL、模型名称）
2. Agent 工具配置（类型选择、自定义命令）
3. 配置持久化到 `~/.cospace/config.json`

**设计原则**：国内模型优先，OpenAI 兼容格式，复用 Agent 工具配置。

---

## 实现方案

### 1. LLM 配置服务

新建 `src/services/llmConfig.ts`：

- `LLM_PRESET_MODELS`：预设模型列表（国内优先）
  - 智谱 GLM-4-Flash（免费）
  - DeepSeek-V3（便宜、推理强）
  - 通义千问 qwen-turbo（中文优化）
  - Claude 3 Haiku / GPT-4o-mini（国外模型，需代理）
  - 自定义（任意 OpenAI 兼容模型）
- `getDefaultBaseUrl(provider)`：获取提供商默认 Base URL
- `validateLlmConfig(config)`：验证配置完整性
- `resolveLlmConfig(config)`：填充默认值
- `createDefaultLlmConfig()`：创建默认配置（GLM-4-Flash）

### 2. 配置类型扩展

修改 `src/types/config.ts`：
- GlobalConfig 新增 `llm` 字段
- DEFAULT_GLOBAL_CONFIG 包含默认 LLM 配置

修改 `src-tauri/src/commands/config.rs`：
- 新增 `LlmConfig` Rust struct
- GlobalConfig 新增 `llm: Option<LlmConfig>` 字段
- `default_global_config()` 包含 `llm: None`

修改 `src-tauri/templates/default-config.json`：
- 添加默认 LLM 配置（智谱 GLM-4-Flash）

### 3. 设置面板 UI

重写 `src/components/Sidebar.tsx` 设置标签页：

- **LLM 配置区域**：
  - 提供商下拉框（国内模型优先排列）
  - 模型名称输入（根据提供商自动填充默认值）
  - API Key 密码输入
  - Base URL 输入（根据提供商自动填充，可修改）
  - 测试连接按钮（Phase 2 实现实际测试）
  - 提供商描述提示

- **Agent 工具配置区域**：
  - Agent 类型选择（Claude Code / Codex / 自定义）
  - 自定义命令输入（选择 custom 时显示）

- **保存按钮**：调用 `save_global_config` Tauri command

---

## 测试策略

| 测试文件 | 类型 | 数量 | 说明 |
|----------|------|------|------|
| `tests/unit/llmConfig.test.ts` | 单元测试 | 14 | 预设模型、URL 获取、配置验证 |

**测试结果**：14/14 全部通过

---

## 编译验证

- TypeScript：`tsc --noEmit` 零错误
- Rust：`cargo check` 通过（4 个原有警告，非本次引入）
- 全量测试：48/48 通过

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/llmConfig.ts` | 新增 | LLM 配置服务 |
| `src/types/config.ts` | 修改 | 扩展 GlobalConfig 类型 |
| `src-tauri/src/commands/config.rs` | 修改 | 新增 LlmConfig struct |
| `src-tauri/templates/default-config.json` | 修改 | 添加默认 LLM 配置 |
| `src/components/Sidebar.tsx` | 重写 | 设置面板 UI |
| `tests/unit/llmConfig.test.ts` | 新增 | 14 个单元测试 |

---

## 下一步

根据 v2.5 计划，Phase 2：自然语言输入 + 意图解析
- Workbench 底部添加聊天输入栏
- 集成 LLM API 调用实现意图解析
- 支持自然语言创建任务、推进阶段
