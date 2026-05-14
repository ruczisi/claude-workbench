import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { readDir, readTextFile, type DirEntry } from '@tauri-apps/plugin-fs';
import { parseWorkflowContent, validateWorkflow, type WorkflowConfig } from './workflowParser';
import { STANDARD_4STAGE_WORKFLOW } from './embeddedWorkflow';

export interface TaskStage {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'error';
  outputs: Array<{ name: string; path: string }>;
  agentContext: string;
  errorMessage?: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  workflow: WorkflowConfig;
  stages: TaskStage[];
  currentStageId?: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  basePath: string;
  createdAt: string;
}

export class TaskManager {
  private tasks: Map<string, Task> = new Map();

  async createTaskFromWorkflow(
    name: string,
    workflow: WorkflowConfig,
    basePath: string,
    description?: string
  ): Promise<Task> {
    // 1. Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`工作流验证失败: ${validation.errors.join(', ')}`);
    }

    // 2. Generate task ID
    const id = this.generateTaskId();

    // 3. Build task stages
    const stages: TaskStage[] = workflow.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      description: stage.description,
      status: 'pending' as const,
      outputs: stage.outputs.map(o => ({ name: o.name, path: o.path })),
      agentContext: stage.agentContext,
    }));

    const task: Task = {
      id,
      name,
      description,
      workflow,
      stages,
      status: 'idle',
      basePath,
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(id, task);

    // 4. Create base directory via Rust backend (bypasses FS permission restrictions)
    await invoke('ensure_directory_command', { path: basePath });

    // 4.5 Persist task config to disk
    await this.writeTaskConfig(task);

    // 5. Create stage directories
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageDir = await join(basePath, `00-阶段${i + 1}-${stage.name}`);
      await invoke('ensure_directory_command', { path: stageDir });
    }

    return task;
  }

  async createTask(
    name: string,
    workflowPath: string,
    basePath: string,
    description?: string
  ): Promise<Task> {
    const content = await readTextFile(workflowPath);
    const workflow = parseWorkflowContent(content);
    return this.createTaskFromWorkflow(name, workflow, basePath, description);
  }

  private generateTaskId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `task-${timestamp}-${random}`;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getTasksByStatus(status: Task['status']): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /** Write task config to .cospace/task.json */
  async writeTaskConfig(task: Task): Promise<void> {
    const configDir = await join(task.basePath, '.cospace');
    await invoke('ensure_directory_command', { path: configDir });
    const configPath = await join(configDir, 'task.json');
    const data = {
      id: task.id,
      name: task.name,
      description: task.description,
      status: task.status,
      basePath: task.basePath,
      createdAt: task.createdAt,
      currentStageId: task.currentStageId,
      workflow: task.workflow,
      stages: task.stages.map((s) => ({ id: s.id, name: s.name, status: s.status })),
    };
    await invoke('write_text_file_command', {
      path: configPath,
      content: JSON.stringify(data, null, 2),
    });
  }

  /** Load a single task from .cospace/task.json */
  async loadTaskConfig(basePath: string): Promise<Task | null> {
    try {
      const configPath = await join(basePath, '.cospace', 'task.json');
      const content = await invoke<string>('read_text_file_command', { path: configPath });
      const data = JSON.parse(content);
      this.loadTasks([data]);
      return this.getTask(data.id) || null;
    } catch {
      return null;
    }
  }

  /** Scan tasks directory and load all task configs from disk */
  async loadTasksFromDisk(tasksDir: string): Promise<void> {
    try {
      const entries: DirEntry[] = await readDir(tasksDir);
      for (const entry of entries) {
        if (entry.isDirectory) {
          const taskPath = await join(tasksDir, entry.name);
          await this.loadTaskConfig(taskPath);
        }
      }
    } catch {
      // tasks directory may not exist
    }
  }

  /** Serialize tasks to plain objects for storage */
  serializeTasks(): Array<{
    id: string;
    name: string;
    description?: string;
    status: Task['status'];
    basePath: string;
    createdAt: string;
    currentStageId?: string;
    workflow: WorkflowConfig;
    stages: Array<{
      id: string;
      name: string;
      status: TaskStage['status'];
    }>;
  }> {
    return this.getAllTasks().map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      status: task.status,
      basePath: task.basePath,
      createdAt: task.createdAt,
      currentStageId: task.currentStageId,
      workflow: task.workflow,
      stages: task.stages.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
      })),
    }));
  }

  /** Restore tasks from serialized data (minimal reconstruction) */
  loadTasks(data: Array<Record<string, unknown>>): void {
    for (const item of data) {
      const id = String(item.id);
      if (this.tasks.has(id)) continue; // disk takes precedence over localStorage

      // Restore workflow: prefer saved full workflow, fall back to standard
      let workflow: WorkflowConfig = STANDARD_4STAGE_WORKFLOW;
      if (item.workflow && typeof item.workflow === 'object') {
        const w = item.workflow as Record<string, unknown>;
        if (Array.isArray(w.stages) && typeof w.name === 'string') {
          workflow = w as unknown as WorkflowConfig;
        }
      }

      // Reconstruct stage statuses from saved data
      const stageStatuses = new Map<string, string>();
      if (Array.isArray(item.stages)) {
        for (const s of item.stages as Array<{ id: string; status: string }>) {
          stageStatuses.set(s.id, s.status);
        }
      }

      const task: Task = {
        id: String(item.id),
        name: String(item.name),
        description: item.description ? String(item.description) : undefined,
        status: String(item.status) as Task['status'],
        basePath: String(item.basePath),
        createdAt: String(item.createdAt),
        currentStageId: item.currentStageId ? String(item.currentStageId) : undefined,
        workflow,
        stages: workflow.stages.map((ws) => ({
          id: ws.id,
          name: ws.name,
          description: ws.description,
          outputs: ws.outputs,
          agentContext: ws.agentContext,
          status: (stageStatuses.get(ws.id) || 'pending') as TaskStage['status'],
        })),
      };
      this.tasks.set(task.id, task);
    }
  }

  /** Persist to localStorage */
  saveToStorage(): void {
    const data = this.serializeTasks();
    localStorage.setItem('cospace-tasks', JSON.stringify(data));
  }

  /** Load from localStorage */
  loadFromStorage(): void {
    const stored = localStorage.getItem('cospace-tasks');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.loadTasks(data);
      } catch {
        // Invalid data, ignore
      }
    }
  }

  // Start a stage: set it to 'running' and mark as current
  startStage(taskId: string, stageId: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const stage = task.stages.find((s) => s.id === stageId);
    if (!stage || stage.status !== 'pending') return undefined;

    stage.status = 'running';
    task.currentStageId = stageId;
    task.status = 'running';

    this.writeTaskConfig(task).catch((err) => console.error('[Cospace] Failed to persist task:', err));

    return { ...task, stages: [...task.stages] };
  }

  // Complete a stage: mark as completed, advance to next pending stage
  async completeStage(taskId: string, stageId: string): Promise<Task | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const stageIndex = task.stages.findIndex((s) => s.id === stageId);
    if (stageIndex === -1) return undefined;

    const stage = task.stages[stageIndex];
    if (stage.status !== 'running') return undefined;

    stage.status = 'completed';

    // Generate output documents for this stage
    await this.generateStageOutputs(task, stage);

    // Persist updated task state
    await this.writeTaskConfig(task);

    // Find next pending stage
    const nextStage = task.stages.slice(stageIndex + 1).find((s) => s.status === 'pending');
    if (nextStage) {
      task.currentStageId = nextStage.id;
    } else {
      // All stages completed
      task.currentStageId = undefined;
      task.status = 'completed';
    }

    return { ...task, stages: [...task.stages] };
  }

  // Generate Markdown output files for a stage (structured for Agent execution)
  private async generateStageOutputs(task: Task, stage: TaskStage): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];

    for (const output of stage.outputs) {
      const filePath = await join(task.basePath, output.path);

      const content = `# ${output.name}

> 任务：${task.name}
> 阶段：${stage.name}
> 输出文件：${output.name}
> 生成时间：${timestamp}

---

## Agent 指令

${stage.agentContext}

---

## 任务信息

- **项目名称**：${task.name}
- **当前阶段**：${stage.name}
- **阶段目标**：${stage.description}
- **预期输出**：${output.name}

---

## 输出区域

<!-- 请将 Agent 生成的内容写在此区域下方 -->

`;

      try {
        await invoke('write_text_file_command', { path: filePath, content });
      } catch (err) {
        console.error(`[Cospace] Failed to write output file ${filePath}:`, err);
      }
    }
  }
}

// Singleton instance
export const taskManager = new TaskManager();