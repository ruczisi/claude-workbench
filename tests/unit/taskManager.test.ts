import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskManager, type Task } from '../../src/services/taskManager';
import { STANDARD_4STAGE_WORKFLOW } from '../../src/services/embeddedWorkflow';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  describe('createTaskFromWorkflow', () => {
    it('should create a task with correct structure', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test Task',
        STANDARD_4STAGE_WORKFLOW,
        '/test/path'
      );

      expect(task.name).toBe('Test Task');
      expect(task.status).toBe('idle');
      expect(task.stages).toHaveLength(4);
      expect(task.stages[0].name).toBe('需求确认');
      expect(task.stages[1].name).toBe('框架构思');
      expect(task.stages[2].name).toBe('内容撰写');
      expect(task.stages[3].name).toBe('审核定稿');
    });

    it('should set all stages to pending initially', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      for (const stage of task.stages) {
        expect(stage.status).toBe('pending');
      }
      expect(task.currentStageId).toBeUndefined();
    });
  });

  describe('startStage', () => {
    it('should change stage status to running', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      const updated = manager.startStage(task.id, 'demand');
      expect(updated).toBeDefined();
      expect(updated!.stages[0].status).toBe('running');
      expect(updated!.currentStageId).toBe('demand');
      expect(updated!.status).toBe('running');
    });

    it('should not start a non-pending stage', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      manager.startStage(task.id, 'demand');
      const secondStart = manager.startStage(task.id, 'demand');
      expect(secondStart).toBeUndefined();
    });
  });

  describe('completeStage', () => {
    it('should mark stage as completed and advance to next', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      manager.startStage(task.id, 'demand');
      const updated = await manager.completeStage(task.id, 'demand');

      expect(updated).toBeDefined();
      expect(updated!.stages[0].status).toBe('completed');
      expect(updated!.currentStageId).toBe('framework');
    });

    it('should complete task when all stages done', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      // Complete all stages
      for (const stage of task.stages) {
        manager.startStage(task.id, stage.id);
        await manager.completeStage(task.id, stage.id);
      }

      const final = manager.getTask(task.id);
      expect(final!.status).toBe('completed');
      expect(final!.currentStageId).toBeUndefined();
    });

    it('should generate output files for each completed stage', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      const task = await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      manager.startStage(task.id, 'demand');
      await manager.completeStage(task.id, 'demand');

      // Should call write_text_file_command for each output
      const demandStage = STANDARD_4STAGE_WORKFLOW.stages[0];
      expect(invokeMock).toHaveBeenCalledWith(
        'write_text_file_command',
        expect.objectContaining({
          path: expect.stringContaining(demandStage.outputs[0].path),
        })
      );
    });
  });
});
