import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowManager, type SavedWorkflow } from '../../src/services/workflowManager';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
}));

describe('WorkflowManager', () => {
  let manager: WorkflowManager;

  beforeEach(() => {
    manager = new WorkflowManager();
    vi.clearAllMocks();
  });

  describe('importWorkflow', () => {
    it('should parse and import a workflow file successfully', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      const mockConfig = {
        name: 'Test Workflow',
        description: 'A test workflow',
        stages: [
          {
            id: 'stage1',
            name: 'Stage One',
            description: 'First stage',
            outputs: [{ name: 'out1', path: '01-out/file.md' }],
            agentContext: 'context',
          },
        ],
      };

      invokeMock.mockResolvedValueOnce(mockConfig);

      const result = await manager.importWorkflow('/workflows/test.md');

      expect(invokeMock).toHaveBeenCalledWith('parse_workflow_file', {
        path: '/workflows/test.md',
      });
      expect(result.name).toBe('Test Workflow');
      expect(result.description).toBe('A test workflow');
      expect(result.path).toBe('/workflows/test.md');
      expect(result.config).toEqual(mockConfig);
      expect(result.id).toMatch(/^workflow-\d+-[a-z0-9]+$/);
    });

    it('should throw when validation fails', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      const invalidConfig = {
        name: '',
        stages: [],
      };

      invokeMock.mockResolvedValueOnce(invalidConfig);

      await expect(manager.importWorkflow('/workflows/bad.md')).rejects.toThrow(
        'Workflow validation failed'
      );
    });

    it('should throw when invoke throws', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      invokeMock.mockRejectedValueOnce(new Error('File not found'));

      await expect(manager.importWorkflow('/workflows/missing.md')).rejects.toThrow(
        'File not found'
      );
    });
  });

  describe('loadWorkflows', () => {
    it('should scan directory and load all .md files', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');
      const readDirMock = vi.mocked(readDir);
      const invokeMock = vi.mocked(invoke);

      readDirMock.mockResolvedValueOnce([
        { name: 'workflow1.md', isFile: true, isDirectory: false, isSymlink: false },
        { name: 'workflow2.md', isFile: true, isDirectory: false, isSymlink: false },
        { name: 'readme.txt', isFile: true, isDirectory: false, isSymlink: false },
        { name: 'subfolder', isFile: false, isDirectory: true, isSymlink: false },
      ] as any);

      invokeMock
        .mockResolvedValueOnce({
          name: 'Workflow One',
          stages: [{ id: 's1', name: 'Stage 1', description: 'desc', outputs: [], agentContext: '' }],
        })
        .mockResolvedValueOnce({
          name: 'Workflow Two',
          stages: [{ id: 's2', name: 'Stage 2', description: 'desc', outputs: [], agentContext: '' }],
        });

      const results = await manager.loadWorkflows('/workflows');

      expect(readDirMock).toHaveBeenCalledWith('/workflows');
      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Workflow One');
      expect(results[1].name).toBe('Workflow Two');
    });

    it('should skip files that fail to parse', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');
      const readDirMock = vi.mocked(readDir);
      const invokeMock = vi.mocked(invoke);

      readDirMock.mockResolvedValueOnce([
        { name: 'good.md', isFile: true, isDirectory: false, isSymlink: false },
        { name: 'bad.md', isFile: true, isDirectory: false, isSymlink: false },
      ] as any);

      invokeMock
        .mockResolvedValueOnce({
          name: 'Good Workflow',
          stages: [{ id: 's1', name: 'Stage 1', description: 'desc', outputs: [], agentContext: '' }],
        })
        .mockResolvedValueOnce({
          name: '',
          stages: [],
        });

      const results = await manager.loadWorkflows('/workflows');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Good Workflow');
    });

    it('should return empty array for empty directory', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const readDirMock = vi.mocked(readDir);

      readDirMock.mockResolvedValueOnce([]);

      const results = await manager.loadWorkflows('/empty');

      expect(results).toEqual([]);
    });
  });

  describe('getWorkflow', () => {
    it('should return the workflow with the given id', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      const mockConfig = {
        name: 'My Workflow',
        stages: [
          {
            id: 's1',
            name: 'Stage 1',
            description: 'desc',
            outputs: [],
            agentContext: 'ctx',
          },
        ],
      };

      invokeMock.mockResolvedValueOnce(mockConfig);

      const imported = await manager.importWorkflow('/workflows/my.md');
      const found = manager.getWorkflow(imported.id);

      expect(found).toBeDefined();
      expect(found!.name).toBe('My Workflow');
      expect(found!.id).toBe(imported.id);
    });

    it('should return undefined for unknown id', () => {
      const result = manager.getWorkflow('workflow-999-unknown');
      expect(result).toBeUndefined();
    });
  });

  describe('getAllWorkflows', () => {
    it('should return all imported workflows', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      invokeMock
        .mockResolvedValueOnce({
          name: 'First',
          stages: [{ id: 's1', name: 'S1', description: 'd', outputs: [], agentContext: '' }],
        })
        .mockResolvedValueOnce({
          name: 'Second',
          stages: [{ id: 's2', name: 'S2', description: 'd', outputs: [], agentContext: '' }],
        });

      await manager.importWorkflow('/workflows/first.md');
      await manager.importWorkflow('/workflows/second.md');

      const all = manager.getAllWorkflows();

      expect(all).toHaveLength(2);
      expect(all.map((w) => w.name)).toContain('First');
      expect(all.map((w) => w.name)).toContain('Second');
    });

    it('should return empty array when no workflows loaded', () => {
      expect(manager.getAllWorkflows()).toEqual([]);
    });
  });

  describe('deleteWorkflow', () => {
    it('should remove workflow from memory', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      invokeMock.mockResolvedValueOnce({
        name: 'To Delete',
        stages: [{ id: 's1', name: 'S1', description: 'd', outputs: [], agentContext: '' }],
      });

      const imported = await manager.importWorkflow('/workflows/del.md');
      expect(manager.getWorkflow(imported.id)).toBeDefined();

      await manager.deleteWorkflow(imported.id);
      expect(manager.getWorkflow(imported.id)).toBeUndefined();
    });

    it('should not throw for unknown id', async () => {
      await expect(manager.deleteWorkflow('unknown')).resolves.not.toThrow();
    });
  });
});
