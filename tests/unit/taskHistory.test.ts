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

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('TaskManager - Task History', () => {
  let manager: TaskManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new TaskManager();
  });

  describe('serialization', () => {
    it('should serialize tasks to plain objects', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test Task',
        STANDARD_4STAGE_WORKFLOW,
        '/test/path'
      );

      const serialized = manager.serializeTasks();
      expect(Array.isArray(serialized)).toBe(true);
      expect(serialized).toHaveLength(1);
      expect(serialized[0].id).toBe(task.id);
      expect(serialized[0].name).toBe('Test Task');
      expect(serialized[0].status).toBe('idle');
      expect(serialized[0].basePath).toBe('/test/path');
      expect(serialized[0].stages).toHaveLength(4);
    });

    it('should include full workflow in serialization', async () => {
      await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      const serialized = manager.serializeTasks();
      expect(serialized[0].workflow).toBeDefined();
      expect(serialized[0].workflow.name).toBe('标准四阶段工作流');
      expect(serialized[0].workflow.stages).toHaveLength(4);
    });

    it('should include stage statuses in serialization', async () => {
      const task = await manager.createTaskFromWorkflow(
        'Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      manager.startStage(task.id, 'demand');
      await manager.completeStage(task.id, 'demand');

      const serialized = manager.serializeTasks();
      expect(serialized[0].stages[0].status).toBe('completed');
      expect(serialized[0].stages[1].status).toBe('pending');
    });
  });

  describe('deserialization', () => {
    it('should restore tasks from serialized data', () => {
      const mockData = [
        {
          id: 'task-abc',
          name: 'Restored Task',
          description: 'Test desc',
          status: 'running',
          basePath: '/restored/path',
          createdAt: '2026-05-13T00:00:00Z',
          currentStageId: 'demand',
          workflow: STANDARD_4STAGE_WORKFLOW,
          stages: [
            { id: 'demand', name: '需求确认', status: 'completed' },
            { id: 'framework', name: '框架构思', status: 'running' },
            { id: 'draft', name: '内容撰写', status: 'pending' },
            { id: 'review', name: '审核定稿', status: 'pending' },
          ],
        },
      ];

      manager.loadTasks(mockData as Task[]);
      const tasks = manager.getAllTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-abc');
      expect(tasks[0].name).toBe('Restored Task');
      expect(tasks[0].status).toBe('running');
      expect(tasks[0].stages[0].status).toBe('completed');
    });

    it('should handle empty data', () => {
      manager.loadTasks([]);
      expect(manager.getAllTasks()).toHaveLength(0);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist tasks to localStorage', async () => {
      await manager.createTaskFromWorkflow(
        'Persist Test',
        STANDARD_4STAGE_WORKFLOW,
        '/test'
      );

      manager.saveToStorage();
      const stored = localStorage.getItem('cospace-tasks');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('Persist Test');
    });

    it('should load tasks from localStorage', async () => {
      const mockData = [
        {
          id: 'task-xyz',
          name: 'Loaded Task',
          description: null,
          status: 'idle',
          basePath: '/loaded',
          createdAt: '2026-05-13T00:00:00Z',
          currentStageId: undefined,
          workflowName: '标准四阶段工作流',
          stages: STANDARD_4STAGE_WORKFLOW.stages.map((s) => ({
            id: s.id,
            name: s.name,
            status: 'pending',
          })),
        },
      ];

      localStorage.setItem('cospace-tasks', JSON.stringify(mockData));

      manager.loadFromStorage();
      const tasks = manager.getAllTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('Loaded Task');
    });

    it('should handle missing localStorage data', () => {
      manager.loadFromStorage();
      expect(manager.getAllTasks()).toHaveLength(0);
    });
  });

  describe('task filtering', () => {
    it('should sort tasks by creation time descending', async () => {
      const task1 = await manager.createTaskFromWorkflow(
        'Task 1',
        STANDARD_4STAGE_WORKFLOW,
        '/test1'
      );

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));

      const task2 = await manager.createTaskFromWorkflow(
        'Task 2',
        STANDARD_4STAGE_WORKFLOW,
        '/test2'
      );

      const tasks = manager.getAllTasks();
      expect(tasks[0].id).toBe(task2.id);
      expect(tasks[1].id).toBe(task1.id);
    });

    it('should filter tasks by status', async () => {
      const task1 = await manager.createTaskFromWorkflow(
        'Running Task',
        STANDARD_4STAGE_WORKFLOW,
        '/test1'
      );
      const task2 = await manager.createTaskFromWorkflow(
        'Pending Task',
        STANDARD_4STAGE_WORKFLOW,
        '/test2'
      );

      manager.startStage(task1.id, 'demand');

      const runningTasks = manager.getTasksByStatus('running');
      expect(runningTasks).toHaveLength(1);
      expect(runningTasks[0].id).toBe(task1.id);
    });
  });
});
