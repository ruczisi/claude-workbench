import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { parseWorkflowContent, validateWorkflow, type WorkflowConfig } from './workflowParser';

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
    return Array.from(this.tasks.values());
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

  // Generate Markdown output files for a stage
  private async generateStageOutputs(task: Task, stage: TaskStage): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];

    for (const output of stage.outputs) {
      const filePath = await join(task.basePath, output.path);
      const content = `# ${output.name}

> 任务：${task.name}
> 阶段：${stage.name}
> 生成时间：${timestamp}

---

${stage.agentContext}

---

*此文档由 Cospace 自动生成，请在上方补充具体内容。*
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