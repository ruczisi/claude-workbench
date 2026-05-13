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
}

export const workflowManager = new WorkflowManager();
