# 开发记录：Phase 2 - 自然语言输入 + 意图解析

> 日期：2026-05-14
> 版本：v0.2.1-alpha
> 任务：Phase 2 - 自然语言交互与意图解析

---

## 需求概述

实现用户通过自然语言与 Cospace 交流，自动解析意图并执行对应操作：
1. 自然语言创建任务（"帮我写个贵港供销社合作方案"）
2. 自然语言推进阶段（"开始需求确认"、"下一阶段"）
3. 对话式澄清（信息不足时主动提问）
4. 一般闲聊回应

---

## 实现方案

### 1. 意图解析引擎

新建 `src/services/intentEngine.ts`：

- `IntentType`：6 种意图类型
  - `create_task` — 创建新任务
  - `start_stage` — 开始某个阶段
  - `complete_stage` — 完成当前阶段
  - `advance_stage` — 推进到下一阶段
  - `ask_question` — 需要澄清
  - `general_chat` — 一般对话
- `parseUserIntent(input, context, config)` — 调用 LLM 解析用户输入
  - 构建结构化 system prompt，包含当前任务上下文
  - LLM 返回 JSON，解析为结构化意图
  - 后处理：低置信度转澄清、无任务时阶段指令转澄清
  - 错误兜底：LLM 调用失败/返回无效 JSON 时返回 general_chat

### 2. 聊天 UI 组件

新建 `src/components/ChatMessage.tsx`：
- 消息气泡（用户右对齐、助手左对齐、系统居中）
- 头像标识、时间戳
- 支持 user/assistant/system 三种角色

新建 `src/components/ChatInput.tsx`：
- 底部输入栏
- Enter 发送
- 发送按钮 + 加载状态
- 占位提示语

修改 `src/components/Workbench.tsx`：
- 新增 "对话" / "Agent 指令" 标签页切换
- 对话标签：消息列表 + 输入栏
- Agent 指令标签：保留原有的 agentContext 显示 + 复制按钮
- 阶段列表保留在底部

修改 `src/App.tsx`：
- 新增 `chatMessages`、`chatLoading`、`llmConfig` 状态
- `handleSendChat`：接收消息 → 解析意图 → 执行动作 → 添加回复
- `createTaskFromIntent`：从聊天意图创建任务
- 集成 LLM 配置加载（从全局配置读取，回退默认）
- 切换任务时清空聊天记录

### 3. 意图执行逻辑

| 意图 | 执行动作 | 回复示例 |
|------|----------|----------|
| create_task | 自动创建工作流任务 | "已创建任务「xxx」。当前阶段：需求确认" |
| start_stage | 调用 taskManager.startStage | "已启动阶段「需求确认」。切换到 Agent 指令标签页复制提示词" |
| complete_stage | 调用 taskManager.completeStage | "阶段完成！已自动推进到「框架构思」" |
| advance_stage | 完成当前 + 自动推进 | 同上 |
| ask_question | 仅回复澄清问题 | "请具体说明方案的主题和目标受众" |
| general_chat | 仅回复对话内容 | "你好！我是 Cospace..." |

---

## 测试策略

| 测试文件 | 类型 | 数量 | 说明 |
|----------|------|------|------|
| `tests/unit/intentEngine.test.ts` | 单元测试 | 10 | 意图解析、参数提取、澄清处理、错误兜底、context 传递 |
| `tests/unit/llmService.test.ts` | 单元测试 | 7 | API 调用、错误处理、URL 处理 |

**测试结果**：17/17 新增测试全部通过，全库 61/61 通过

---

## 编译验证

- TypeScript：`tsc --noEmit` 零错误
- 全量测试：61/61 通过

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/intentEngine.ts` | 新增 | 意图解析引擎 |
| `src/components/ChatMessage.tsx` | 新增 | 消息气泡组件 |
| `src/components/ChatInput.tsx` | 新增 | 聊天输入组件 |
| `src/components/Workbench.tsx` | 重写 | 集成标签页（对话/Agent 指令） |
| `src/App.tsx` | 修改 | 聊天状态管理 + 意图执行 |
| `tests/unit/intentEngine.test.ts` | 新增 | 10 个单元测试 |
| `tests/unit/llmService.test.ts` | 新增 | 7 个单元测试（Phase 1） |

---

## 验收标准检查

- [x] 用户输入"帮我写个贵港供销社合作方案" → 自动创建任务
- [x] 用户输入"开始阶段" → 自动启动当前阶段
- [x] 用户输入"下一阶段" → 自动完成当前并推进
- [x] 模糊输入 → 主动澄清
- [x] Agent 指令标签页保留，支持一键复制
- [x] 聊天历史实时显示

---

## 已知限制

- LLM 配置需要用户在设置面板填写 API Key 才能实际调用
- 未配置 LLM 时，意图解析将使用默认配置（可能调用失败）
- 实际 LLM 调用测试需在设置面板配置后手动验证

---

## 下一步

根据 v2.5 计划，Phase 3：提示词优化 + Agent 桥接（PTY）
- `src/services/promptOptimizer.ts` — 根据上下文生成优化提示词
- `src/services/agentRunner.ts` — Agent 工具调用管理
- `src/components/AgentOutputPanel.tsx` — Agent 输出展示
- Rust PTY 集成：自动 spawn Claude Code，注入提示词，过滤关键输出
