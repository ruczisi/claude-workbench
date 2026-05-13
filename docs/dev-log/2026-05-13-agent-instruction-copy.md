# 开发记录：Agent 指令复制功能

> 日期：2026-05-13
> 版本：v0.2.0-alpha
> 任务：实现 Agent 指令一键复制

---

## 需求概述

在 Workbench 中新增"复制 Agent 指令"按钮，让创作者可以一键复制当前阶段的完整指令，粘贴到外部 Agent 客户端（Claude Code、Cursor 等）执行。

**设计原则**：Cospace 不直接调用 LLM API，而是作为工作流编排工具，生成结构化指令供外部 Agent 使用。

---

## 实现方案

### 1. 指令格式化工具

新建 `src/services/agentInstructionUtils.ts`：

- `formatAgentInstructions(task, stage)`：纯函数，生成标准化的 Agent 指令文本
- 包含任务信息、阶段目标、Agent 角色定义、预期输出文件列表
- 输出 Markdown 格式，便于 Agent 解析

### 2. Workbench UI 扩展

修改 `src/components/Workbench.tsx`：

- Agent 上下文区域新增"复制 Agent 指令"按钮
- 点击时调用 `navigator.clipboard.writeText()`
- 复制成功后提示用户粘贴到 Agent 客户端
- 仅在当前阶段存在时显示按钮

### 3. 指令格式示例

```markdown
# Cospace Agent 任务指令

## 任务信息

- **任务名称**：贵港供销社方案
- **任务描述**：贵港供销社南北大通道合作方案
- **当前阶段**：框架构思
- **阶段目标**：设计方案整体结构、章节安排与逻辑主线

---

## 你的角色与任务

你是方案架构师。基于需求确认的结果，设计方案的整体框架。
...

---

## 预期输出

请将生成的内容写入以下文件：

- **方案大纲**：`02-框架构思/方案大纲.md`
- **逻辑结构图**：`02-框架构思/逻辑结构图.md`

---

## 输出规范

1. 使用 Markdown 格式
2. 内容专业、简洁、有说服力
3. 关键数据需标注来源
4. 完成后告知创作者
```

---

## 测试策略

| 测试文件 | 类型 | 数量 | 说明 |
|----------|------|------|------|
| `tests/unit/agentInstructionUtils.test.ts` | 单元测试 | 7 | 格式化内容覆盖、边界情况 |

**测试结果**：7/7 全部通过

---

## 编译验证

- TypeScript：`tsc --noEmit` 零错误
- 全量测试：34/34 通过

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/agentInstructionUtils.ts` | 新增 | 指令格式化纯函数 |
| `src/components/Workbench.tsx` | 修改 | 添加复制按钮和剪贴板交互 |
| `tests/unit/agentInstructionUtils.test.ts` | 新增 | 7 个单元测试 |

---

## 下一步

根据 PROGRESS.md，待实现功能：
1. 设置面板功能实现
2. 自定义 workflow 加载 / 编辑
