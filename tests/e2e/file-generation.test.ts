import { describe, it, expect, vi } from 'vitest';
import { TaskManager } from '../../src/services/taskManager';
import { STANDARD_4STAGE_WORKFLOW } from '../../src/services/embeddedWorkflow';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '../../../test-output');

// Mock invoke to actually write files for verification
vi.mock('@tauri-apps/api/core', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/core')>('@tauri-apps/api/core');
  return {
    ...actual,
    invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'write_text_file_command' && args) {
        const filePath = args.path as string;
        const content = args.content as string;
        // Actually write the file for verification
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
      return Promise.resolve();
    }),
  };
});

vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

describe('File Generation Integration', () => {
  it('should generate correct number of output files', async () => {
    const manager = new TaskManager();
    const task = await manager.createTaskFromWorkflow(
      'Integration Test',
      STANDARD_4STAGE_WORKFLOW,
      TEST_OUTPUT_DIR
    );

    // Complete all stages
    for (const stage of task.stages) {
      manager.startStage(task.id, stage.id);
      await manager.completeStage(task.id, stage.id);
    }

    // Count total expected outputs
    const totalOutputs = STANDARD_4STAGE_WORKFLOW.stages.reduce(
      (sum, stage) => sum + stage.outputs.length,
      0
    );

    // Count generated files
    const files = fs.readdirSync(TEST_OUTPUT_DIR, { recursive: true })
      .filter((f): f is string => typeof f === 'string')
      .filter(f => f.endsWith('.md'));

    expect(files.length).toBe(totalOutputs);
  });

  it('should generate files with correct content structure', async () => {
    const manager = new TaskManager();
    const task = await manager.createTaskFromWorkflow(
      'Content Test',
      STANDARD_4STAGE_WORKFLOW,
      TEST_OUTPUT_DIR
    );

    // Complete first stage
    manager.startStage(task.id, 'demand');
    await manager.completeStage(task.id, 'demand');

    // Find generated files
    const files = fs.readdirSync(TEST_OUTPUT_DIR, { recursive: true })
      .filter((f): f is string => typeof f === 'string')
      .filter(f => f.endsWith('.md'));

    expect(files.length).toBeGreaterThan(0);

    // Verify content structure
    for (const file of files) {
      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, file), 'utf-8');
      expect(content).toContain('#');
      expect(content).toContain('任务：');
      expect(content).toContain('阶段：');
      expect(content).toContain('Agent 指令');
      expect(content).toContain('输出区域');
    }
  });
});
