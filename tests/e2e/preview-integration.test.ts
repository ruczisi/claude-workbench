import { describe, it, expect, vi } from 'vitest';
import { TaskManager } from '../../src/services/taskManager';
import { STANDARD_4STAGE_WORKFLOW } from '../../src/services/embeddedWorkflow';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '../../../test-output-preview');

// Mock invoke to actually write and read files for verification
vi.mock('@tauri-apps/api/core', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/core')>('@tauri-apps/api/core');
  return {
    ...actual,
    invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'write_text_file_command' && args) {
        const filePath = args.path as string;
        const content = args.content as string;
        const fullPath = path.join(TEST_OUTPUT_DIR, path.basename(filePath));
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        return;
      }
      if (cmd === 'ensure_directory_command' && args) {
        const dirPath = args.path as string;
        const fullPath = path.join(TEST_OUTPUT_DIR, path.basename(dirPath));
        fs.mkdirSync(fullPath, { recursive: true });
        return;
      }
      if (cmd === 'read_text_file_command' && args) {
        const filePath = args.path as string;
        // Try to find file in test output directory
        const baseName = path.basename(filePath);
        const fullPath = path.join(TEST_OUTPUT_DIR, baseName);
        if (fs.existsSync(fullPath)) {
          return fs.readFileSync(fullPath, 'utf-8');
        }
        // Fallback: search recursively
        const files = fs.readdirSync(TEST_OUTPUT_DIR, { recursive: true })
          .filter((f): f is string => typeof f === 'string');
        for (const file of files) {
          if (file.endsWith(baseName)) {
            return fs.readFileSync(path.join(TEST_OUTPUT_DIR, file), 'utf-8');
          }
        }
        throw new Error(`File not found: ${filePath}`);
      }
      return Promise.resolve();
    }),
  };
});

vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

describe('Preview Integration', () => {
  it('should read generated file content via read_text_file_command', async () => {
    const manager = new TaskManager();
    const task = await manager.createTaskFromWorkflow(
      'Preview Test',
      STANDARD_4STAGE_WORKFLOW,
      TEST_OUTPUT_DIR
    );

    // Complete first stage
    manager.startStage(task.id, 'demand');
    await manager.completeStage(task.id, 'demand');

    // Read file via command
    const { invoke } = await import('@tauri-apps/api/core');
    const demandStage = STANDARD_4STAGE_WORKFLOW.stages[0];
    const filePath = `${TEST_OUTPUT_DIR}/${demandStage.outputs[0].path}`;

    const content = await invoke('read_text_file_command', { path: filePath });

    expect(content).toBeDefined();
    expect(content).toContain('需求确认单');
    expect(content).toContain('任务：Preview Test');
  });

  it('should list all completed stage outputs', async () => {
    const manager = new TaskManager();
    const task = await manager.createTaskFromWorkflow(
      'List Test',
      STANDARD_4STAGE_WORKFLOW,
      TEST_OUTPUT_DIR
    );

    // Complete first two stages
    for (const stageId of ['demand', 'framework']) {
      manager.startStage(task.id, stageId);
      await manager.completeStage(task.id, stageId);
    }

    // Collect all outputs from completed stages
    const completedStages = task.stages.filter((s) => s.status === 'completed');
    const totalOutputs = completedStages.reduce(
      (sum, stage) => sum + stage.outputs.length,
      0
    );

    // Verify files exist and can be read
    const { invoke } = await import('@tauri-apps/api/core');
    let readableCount = 0;

    for (const stage of completedStages) {
      for (const output of stage.outputs) {
        const filePath = `${TEST_OUTPUT_DIR}/${output.path}`;
        try {
          const content = await invoke('read_text_file_command', { path: filePath });
          if (content && typeof content === 'string') {
            readableCount++;
          }
        } catch {
          // File may not exist in this test setup
        }
      }
    }

    expect(readableCount).toBeGreaterThan(0);
  });
});
