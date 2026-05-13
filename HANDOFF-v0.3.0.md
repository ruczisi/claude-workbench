# Cospace v0.3.0 开发交接文档

> 创建时间：2026-05-14 07:29
> 分支：main
> 状态：Phase A 完成，Phase B/C/D UI 代理完成，App.tsx 集成进行中

---

## 已完成工作

### Phase A：基础设施（全部完成，测试通过）

| 任务 | 文件 | 状态 |
|------|------|------|
| 扩展 Rust GlobalConfig | `src-tauri/src/commands/config.rs` | 新增 `KnowledgeBaseConfig` 结构体 |
| Workflow 管理服务 | `src/services/workflowManager.ts` | 新增：导入/加载/删除/列出 workflow |
| 知识库检索服务 | `src/services/knowledgeBase.ts` | 新增：关键词搜索、标签搜索、文档读取 |
| TaskManager 持久化修复 | `src/services/taskManager.ts` | `serializeTasks()` 保存完整 workflow |
| AppStore 扩展 | `src/stores/appStore.ts` | `SidebarTab` 新增 `'workflows'` |
| IntentEngine 扩展 | `src/services/intentEngine.ts` | 新增 `search_knowledge` 意图类型 |
| AgentRunner 扩展 | `src/services/agentRunner.ts` | `startAgent()` 接受 `knowledgeResults` 参数 |
| PromptOptimizer 扩展 | `src/services/promptOptimizer.ts` | `buildPromptText()` 注入知识库上下文 |

### Phase B/C/D：UI 层（代理完成）

| 任务 | 文件 | 状态 |
|------|------|------|
| Sidebar 工作流标签页 | `src/components/Sidebar.tsx` | workflows 列表 + "使用此工作流"按钮 |
| Sidebar 知识库配置 | `src/components/Sidebar.tsx` | 设置面板新增知识库路径配置 |
| PromptOptimizer 测试 | `tests/unit/promptOptimizer.test.ts` | 3 个新测试全部通过 |
| KnowledgeBase 测试 | `tests/unit/knowledgeBase.test.ts` | 11 个测试全部通过 |
| WorkflowManager 测试 | `tests/unit/workflowManager.test.ts` | 9 个测试全部通过 |
| TaskHistory 测试更新 | `tests/unit/taskHistory.test.ts` | 适配新序列化格式 |

### 质量验证

- **单元测试**：10 个测试文件，96 个测试全部通过
- **TypeScript 编译**：`tsc --noEmit` 零错误
- **AgentRunner 类型安全**：`KnowledgeResult` 导入已添加

---

## 未完成工作：App.tsx 集成

**当前状态**：`src/App.tsx` 中的 workflow/knowledgeBase 导入已临时注释掉（避免 TS 未使用错误），集成逻辑尚未添加。

### 需要完成的事项

#### 1. App.tsx 状态管理
```typescript
// 需要添加的状态（当前已注释掉导入）
const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
const [knowledgeBasePath, setKnowledgeBasePath] = useState<string | null>(null);
const [kbStats, setKbStats] = useState<{ total: number }>({ total: 0 });
```

#### 2. App.tsx Effect：加载知识库配置
```typescript
// 在现有的 LLM config 加载 effect 中，同时加载 KB 配置
const cfg = await invoke<{ llm?: LlmConfig; knowledge_base?: KnowledgeBaseConfig }>('get_global_config');
if (cfg.knowledge_base?.root_path) {
  knowledgeBase.setRootPath(cfg.knowledge_base.root_path);
  setKnowledgeBasePath(cfg.knowledge_base.root_path);
  setKbStats(knowledgeBase.getStats());
}
```

#### 3. App.tsx Effect：扫描工作流目录
```typescript
// 当 watchedPath 变化时，扫描 {watchedPath}/workflows/ 目录
useEffect(() => {
  if (watchedPath) {
    const workflowsDir = `${watchedPath}/workflows`;
    workflowManager.loadWorkflows(workflowsDir).then(setWorkflows).catch(() => setWorkflows([]));
  }
}, [watchedPath]);
```

#### 4. App.tsx 事件处理器
```typescript
// 选择知识库目录
const handleSelectKnowledgeBase = async () => { ... };

// 使用工作流创建任务
const handleUseWorkflow = async (workflow: WorkflowConfig) => { ... };

// 修改 createTaskFromIntent 支持自定义 workflow
const createTaskFromIntent = useCallback(
  async (name: string, description?: string, workflow?: WorkflowConfig): Promise<Task | null> => {
    const wf = workflow || STANDARD_4STAGE_WORKFLOW;
    // ... 其余不变
  },
  [watchedPath, addMessage]
);
```

#### 5. App.tsx 修改 handleStartAgent 注入知识库
```typescript
const handleStartAgent = async () => {
  // ... 现有代码 ...
  
  // 新增：搜索知识库相关知识
  let knowledgeResults: KnowledgeResult[] = [];
  if (knowledgeBasePath && currentTask) {
    knowledgeResults = await knowledgeBase.searchForTask(currentTask);
  }
  
  await agentRunner.startAgent(currentTask, stage, agentConfig, knowledgeResults);
  // ... 其余不变
};
```

#### 6. App.tsx 添加 search_knowledge 意图处理
```typescript
case 'search_knowledge': {
  const query = intent.params?.query || message;
  const results = await knowledgeBase.search(query, { maxResults: 5 });
  // 格式化结果并添加到聊天消息
  break;
}
```

#### 7. Sidebar props 连接
```typescript
<Sidebar
  onCreateTask={handleCreateDemoTask}
  watchedPath={watchedPath}
  currentTask={currentTask}
  onSelectTask={handleSelectTask}
  workflows={workflows}
  onUseWorkflow={handleUseWorkflow}
  knowledgeBasePath={knowledgeBasePath}
  kbStats={kbStats}
  onSelectKnowledgeBase={handleSelectKnowledgeBase}
/>
```

#### 8. 测试补充
- `tests/unit/intentEngine.test.ts`：添加 `search_knowledge` 意图解析测试

---

## 快速恢复步骤

在另一台电脑上继续工作时：

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖（如有需要）
npm install

# 3. 运行测试验证
npx vitest run tests/unit/

# 4. TypeScript 检查
npx tsc --noEmit

# 5. 取消注释 App.tsx 中的导入（第15-18行）
# 然后继续完成上述"未完成工作"
```

---

## 关键文件清单

### 已完成且稳定
- `src-tauri/src/commands/config.rs`
- `src/services/workflowManager.ts`
- `src/services/knowledgeBase.ts`
- `src/services/taskManager.ts`
- `src/services/promptOptimizer.ts`
- `src/services/intentEngine.ts`
- `src/services/agentRunner.ts`
- `src/stores/appStore.ts`
- `src/components/Sidebar.tsx`
- `tests/unit/knowledgeBase.test.ts`
- `tests/unit/workflowManager.test.ts`
- `tests/unit/promptOptimizer.test.ts`
- `tests/unit/taskHistory.test.ts`

### 需要继续修改
- `src/App.tsx` — 集成 workflow + KB 状态管理（导入已注释）
- `tests/unit/intentEngine.test.ts` — 补充 search_knowledge 测试
