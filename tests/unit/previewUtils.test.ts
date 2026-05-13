import { describe, it, expect } from 'vitest';
import { getCompletedStageFiles, groupFilesByStage } from '../../src/services/previewUtils';
import type { Task } from '../../src/services/taskManager';

const mockTask: Task = {
  id: 'task-123',
  name: 'Test Task',
  description: 'Test description',
  status: 'running',
  basePath: '/test/workspace/tasks/demo-task',
  createdAt: '2026-05-13T00:00:00Z',
  currentStageId: 'framework',
  workflow: {
    name: 'Standard',
    description: 'Standard workflow',
    stages: [],
  },
  stages: [
    {
      id: 'demand',
      name: '需求确认',
      description: 'Confirm requirements',
      status: 'completed',
      agentContext: 'Demand agent context',
      outputs: [
        { name: '需求确认单', path: '01-需求确认/需求确认单.md' },
        { name: '信息采集表', path: '01-需求确认/信息采集表.md' },
      ],
    },
    {
      id: 'framework',
      name: '框架构思',
      description: 'Design framework',
      status: 'running',
      agentContext: 'Framework agent context',
      outputs: [
        { name: '方案大纲', path: '02-框架构思/方案大纲.md' },
      ],
    },
    {
      id: 'draft',
      name: '内容撰写',
      description: 'Draft content',
      status: 'pending',
      agentContext: 'Draft agent context',
      outputs: [
        { name: '方案正文', path: '03-内容撰写/方案正文.md' },
      ],
    },
  ],
};

describe('previewUtils', () => {
  describe('getCompletedStageFiles', () => {
    it('should return empty array for null task', () => {
      expect(getCompletedStageFiles(null)).toEqual([]);
    });

    it('should return only completed stage outputs', () => {
      const files = getCompletedStageFiles(mockTask);
      expect(files).toHaveLength(2);
      expect(files[0].fileName).toBe('需求确认单');
      expect(files[0].stageName).toBe('需求确认');
      expect(files[1].fileName).toBe('信息采集表');
      expect(files[1].stageName).toBe('需求确认');
    });

    it('should include file paths', () => {
      const files = getCompletedStageFiles(mockTask);
      expect(files[0].filePath).toBe('01-需求确认/需求确认单.md');
    });
  });

  describe('groupFilesByStage', () => {
    it('should group files by stage name', () => {
      const files = getCompletedStageFiles(mockTask);
      const groups = groupFilesByStage(files);

      expect(groups.size).toBe(1);
      expect(groups.has('需求确认')).toBe(true);
      expect(groups.get('需求确认')).toHaveLength(2);
    });

    it('should handle multiple completed stages', () => {
      const multiStageTask: Task = {
        ...mockTask,
        stages: mockTask.stages.map((s, i) =>
          i <= 1 ? { ...s, status: 'completed' as const } : s
        ),
      };

      const files = getCompletedStageFiles(multiStageTask);
      const groups = groupFilesByStage(files);

      expect(groups.size).toBe(2);
      expect(groups.has('需求确认')).toBe(true);
      expect(groups.has('框架构思')).toBe(true);
      expect(groups.get('框架构思')).toHaveLength(1);
    });

    it('should return empty map for empty entries', () => {
      const groups = groupFilesByStage([]);
      expect(groups.size).toBe(0);
    });
  });
});
