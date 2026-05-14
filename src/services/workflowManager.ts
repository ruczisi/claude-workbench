import { invoke } from '@tauri-apps/api/core';
import { readDir, type DirEntry } from '@tauri-apps/plugin-fs';
import { validateWorkflow, type WorkflowConfig } from './workflowParser';

export interface SavedWorkflow {
  id: string;
  name: string;
  description?: string;
  path: string;
  config: WorkflowConfig;
}

function generateId(): string {
  const random = Math.random().toString(36).substring(2, 8);
  return `workflow-${Date.now()}-${random}`;
}

export class WorkflowManager {
  private workflows: Map<string, SavedWorkflow> = new Map();

  async loadWorkflows(workflowsDir: string): Promise<SavedWorkflow[]> {
    const entries: DirEntry[] = await readDir(workflowsDir);
    const mdFiles = entries.filter(
      (entry) => entry.isFile && entry.name.endsWith('.md')
    );

    const loaded: SavedWorkflow[] = [];
    for (const file of mdFiles) {
      const filePath = `${workflowsDir}/${file.name}`;
      try {
        const workflow = await this.importWorkflow(filePath);
        loaded.push(workflow);
      } catch {
        // Skip files that fail to parse
      }
    }

    return loaded;
  }

  async importWorkflow(filePath: string): Promise<SavedWorkflow> {
    const config: WorkflowConfig = await invoke('parse_workflow_file', { path: filePath });

    const validation = validateWorkflow(config);
    if (!validation.valid) {
      throw new Error(
        `Workflow validation failed: ${validation.errors.join(', ')}`
      );
    }

    const workflow: SavedWorkflow = {
      id: generateId(),
      name: config.name,
      description: config.description,
      path: filePath,
      config,
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async deleteWorkflow(id: string): Promise<void> {
    this.workflows.delete(id);
  }

  getAllWorkflows(): SavedWorkflow[] {
    return Array.from(this.workflows.values());
  }

  getWorkflow(id: string): SavedWorkflow | undefined {
    return this.workflows.get(id);
  }

  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    const markdown = serializeWorkflowToMarkdown(workflow.config);
    await invoke('write_text_file_command', { path: workflow.path, content: markdown });
    this.workflows.set(workflow.id, workflow);
  }
}

export const workflowManager = new WorkflowManager();

/** 将 WorkflowConfig 序列化为 Markdown 格式 */
function serializeWorkflowToMarkdown(config: WorkflowConfig): string {
  const lines: string[] = [];
  lines.push(`# ${config.name}`);
  if (config.description) {
    lines.push('');
    lines.push(config.description);
  }
  lines.push('');
  lines.push('## 阶段定义');
  lines.push('');

  for (let i = 0; i < config.stages.length; i++) {
    const stage = config.stages[i];
    lines.push(`### 阶段${i + 1}：${stage.name}`);
    lines.push(`- id: ${stage.id}`);
    lines.push(`- name: ${stage.name}`);
    if (stage.description) {
      lines.push(`- description: ${stage.description}`);
    }
    if (stage.depends) {
      lines.push(`- depends: ${stage.depends}`);
    }
    if (stage.outputs.length > 0) {
      lines.push('- outputs:');
      for (const output of stage.outputs) {
        lines.push(`    - name: ${output.name}`);
        lines.push(`      path: ${output.path}`);
      }
    }
    lines.push('- agent_context: |');
    const contextLines = stage.agentContext.split('\n');
    for (const line of contextLines) {
      lines.push(`    ${line}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
