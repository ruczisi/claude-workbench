import { describe, it, expect } from 'vitest';
import {
  optimizeAgentPrompt,
  type OptimizedPrompt,
  type PromptContext,
} from '../../src/services/promptOptimizer';
import type { Task } from '../../src/services/taskManager';

const createMockTask = (): Task => ({
  id: 'task-abc',
  name: '贵港供销社合作方案',
  description: '贵港供销社南北大通道合作方案',
  workflow: {
    name: '标准四阶段工作流',
    description: '测试',
    stages: [
      { id: 'demand', name: '需求确认', description: '确认需求', outputs: [], agentContext: '' },
      { id: 'framework', name: '框架构思', description: '设计框架', outputs: [], agentContext: '' },
      { id: 'draft', name: '内容撰写', description: '撰写内容', outputs: [], agentContext: '' },
      { id: 'review', name: '审核定稿', description: '审核', outputs: [], agentContext: '' },
    ],
  },
  stages: [
    { id: 'demand', name: '需求确认', description: '明确方案目标、受众、核心诉求', status: 'running', outputs: [
      { name: '需求确认单', path: '01-需求确认/需求确认单.md' },
    ], agentContext: '你是需求分析专家...' },
    { id: 'framework', name: '框架构思', description: '设计整体结构', status: 'pending', outputs: [], agentContext: '' },
    { id: 'draft', name: '内容撰写', description: '撰写内容', status: 'pending', outputs: [], agentContext: '' },
    { id: 'review', name: '审核定稿', description: '检查审核', status: 'pending', outputs: [], agentContext: '' },
  ],
  currentStageId: 'demand',
  status: 'running',
  basePath: '/workspace/tasks/demo',
  createdAt: new Date().toISOString(),
});

describe('promptOptimizer', () => {
  describe('optimizeAgentPrompt', () => {
    it('should generate prompt with task name and stage name', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result.text).toContain(task.name);
      expect(result.text).toContain(task.stages[0].name);
      expect(result.keyInstructions.length).toBeGreaterThan(0);
    });

    it('should include stage description in prompt', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result.text).toContain(task.stages[0].description);
    });

    it('should include expected outputs', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result.expectedOutputs.length).toBe(1);
      expect(result.expectedOutputs[0].name).toBe('需求确认单');
    });

    it('should include file paths for outputs', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result.expectedOutputs[0].path).toContain('需求确认单.md');
    });

    it('should include working directory hint', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result.text).toContain(task.basePath);
    });

    it('should handle stage without outputs gracefully', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[1], // framework stage has no outputs in mock
      };

      const result = optimizeAgentPrompt(context);

      expect(result.expectedOutputs).toEqual([]);
      expect(result.text).toContain(task.stages[1].name);
    });

    it('should include original agent context', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result.text).toContain('需求分析专家');
    });

    it('should return structured result with text and metadata', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('keyInstructions');
      expect(result).toHaveProperty('expectedOutputs');
      expect(result).toHaveProperty('stageName');
      expect(result.stageName).toBe('需求确认');
    });

    it('should include task description when available', () => {
      const task = createMockTask();
      const context: PromptContext = {
        task,
        stage: task.stages[0],
      };

      const result = optimizeAgentPrompt(context);

      expect(result.text).toContain(task.description);
    });
  });
});
