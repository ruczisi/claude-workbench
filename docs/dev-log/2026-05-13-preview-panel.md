# 开发记录：Preview 面板内容预览

> 日期：2026-05-13
> 版本：v0.2.0-alpha
> 任务：实现 Preview 面板内容预览

---

## 需求概述

实现右侧 Preview 面板，让用户能够在应用内直接查看已生成阶段输出文件的内容，支持 Markdown 渲染。

## 实现方案

### 1. Rust 后端 - 文件读取命令

在 `src-tauri/src/commands/config.rs` 中新增：

- `read_text_file()` 函数：解析路径并读取文件内容
- `read_text_file_command` Tauri 命令：供前端调用

### 2. 前端 - 纯逻辑提取

新建 `src/services/previewUtils.ts`：

- `getCompletedStageFiles(task)`：从任务中提取已完成阶段的输出文件列表
- `groupFilesByStage(entries)`：按阶段名称分组文件

**设计决策**：将纯逻辑从 React 组件中抽离，便于单元测试，避免 React 19 在 node 测试环境中的兼容性问题。

### 3. Preview 组件重写

`src/components/Preview.tsx`：

- 接收 `task` prop
- 左侧列出已完成阶段的输出文件（按阶段分组）
- 点击文件调用 `read_text_file_command` 读取内容
- 使用 `react-markdown` + `remark-gfm` 渲染 Markdown
- 支持加载状态、错误提示

### 4. App.tsx 连接

将 `currentTask` 传递给 Preview 组件。

---

## 测试策略

| 测试文件 | 类型 | 说明 |
|----------|------|------|
| `tests/unit/previewUtils.test.ts` | 单元测试 | 测试文件列表提取和分组逻辑（5 个测试） |
| `tests/e2e/preview-integration.test.ts` | 集成测试 | 测试文件写入后通过 read_text_file_command 读取（2 个测试） |
| `tests/e2e/file-generation.test.ts` | 集成测试 | 原有测试，验证文件生成（2 个测试） |
| `tests/unit/taskManager.test.ts` | 单元测试 | 原有测试，验证阶段管理（7 个测试） |

**测试结果**：17/17 全部通过

**遇到的问题**：
- React 19 与 jsdom/happy-dom 测试环境存在兼容性问题（`useState` 解析为 CJS 版本导致 null 错误）
- **解决方案**：将组件逻辑提取为纯函数进行测试，避免在 node 环境中渲染 React 组件

---

## 编译验证

- TypeScript：`tsc --noEmit` 零错误
- Rust：`cargo check` 通过（仅有未使用代码的警告，不影响功能）

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/src/commands/config.rs` | 新增 | `read_text_file()` 和 `read_text_file_command` |
| `src-tauri/src/main.rs` | 修改 | 注册 `read_text_file_command` |
| `src/services/previewUtils.ts` | 新增 | 文件列表提取和分组逻辑 |
| `src/components/Preview.tsx` | 重写 | 完整的预览面板功能 |
| `src/App.tsx` | 修改 | 传递 task 给 Preview |
| `tests/unit/previewUtils.test.ts` | 新增 | 单元测试 |
| `tests/e2e/preview-integration.test.ts` | 新增 | 集成测试 |
| `PROGRESS.md` | 更新 | 标记 Preview 完成为已完成 |

---

## 下一步

根据 PROGRESS.md，待实现功能：
1. Agent 上下文实际运行（调用 AI 生成阶段内容）
2. 设置面板功能实现
3. 自定义 workflow 加载 / 编辑
4. 任务历史列表
