# 开发记录：任务历史列表

> 日期：2026-05-13
> 版本：v0.2.0-alpha
> 任务：实现任务历史列表功能

---

## 需求概述

在 Sidebar 中实现任务历史列表，支持：
1. 显示所有已创建的任务（名称、状态、创建时间）
2. 点击任务切换到对应工作流
3. 任务状态实时更新
4. 使用 localStorage 持久化任务列表

## 实现方案

### 1. TaskManager 扩展

在 `src/services/taskManager.ts` 中新增：

- `getAllTasks()`：按创建时间降序返回任务列表（已修改）
- `getTasksByStatus(status)`：按状态筛选任务
- `serializeTasks()`：将任务序列化为纯对象（排除不可序列化的 workflow 对象，保留 workflowName）
- `loadTasks(data)`：从序列化数据恢复任务（使用标准工作流重建完整阶段信息）
- `saveToStorage()`：保存到 localStorage（键名：`cospace-tasks`）
- `loadFromStorage()`：从 localStorage 加载

**设计决策**：序列化时排除完整的 workflow 对象（避免冗余存储），只保存 workflowName。恢复时重新关联标准工作流配置。

### 2. Sidebar 组件扩展

`src/components/Sidebar.tsx`：

- 新增 "历史" 标签（📜）
- 历史标签页显示任务列表：
  - 任务名称（截断显示）
  - 状态标签（带颜色：已完成/进行中/待开始/出错）
  - 创建日期
- 当前选中任务高亮显示
- 点击任务触发 `onSelectTask` 回调

### 3. App.tsx 集成

- 启动时调用 `taskManager.loadFromStorage()` 加载历史
- 创建任务后调用 `taskManager.saveToStorage()` 保存
- 阶段状态变化后保存（startStage / completeStage）
- 新增 `handleSelectTask` 回调，切换当前任务

---

## 测试策略

| 测试文件 | 类型 | 数量 | 说明 |
|----------|------|------|------|
| `tests/unit/taskHistory.test.ts` | 单元测试 | 10 | 序列化、反序列化、localStorage、筛选排序 |
| `tests/unit/previewUtils.test.ts` | 单元测试 | 5 | Preview 逻辑（原有） |
| `tests/unit/taskManager.test.ts` | 单元测试 | 7 | TaskManager 核心（原有） |
| `tests/e2e/preview-integration.test.ts` | 集成测试 | 2 | 文件读取（原有） |
| `tests/e2e/file-generation.test.ts` | 集成测试 | 2 | 文件生成（原有） |

**测试结果**：27/27 全部通过

**遇到的问题**：
- `loadTasks` 最初参数类型为 `Task[]`，但序列化后的数据结构不完全匹配
- **解决方案**：改为 `Array<Record<string, unknown>>`，在方法内部通过字段名安全地提取数据并重建任务

---

## 编译验证

- TypeScript：`tsc --noEmit` 零错误
- Rust：`cargo check` 通过
- Release：`cargo build --release` 成功

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/taskManager.ts` | 修改 | 添加序列化/反序列化/存储方法 |
| `src/components/Sidebar.tsx` | 重写 | 添加历史标签和任务列表 UI |
| `src/App.tsx` | 修改 | 集成任务历史加载/保存/切换 |
| `tests/unit/taskHistory.test.ts` | 新增 | 10 个单元测试 |
| `PROGRESS.md` | 更新 | 标记任务历史为已完成 |

---

## 下一步

根据 PROGRESS.md，待实现功能：
1. Agent 上下文实际运行（调用 AI 生成阶段内容）
2. 设置面板功能实现
3. 自定义 workflow 加载 / 编辑
