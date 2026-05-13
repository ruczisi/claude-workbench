import { describe, it, expect } from 'vitest';
import { formatAgentInstructions } from '../../src/services/agentInstructionUtils';
import type { Task, TaskStage } from '../../src/services/taskManager';

const mockStage: TaskStage = {
  id: 'framework',
  name: '框架构思',
  description: '设计方案整体结构、章节安排与逻辑主线',
  status: 'running',
  agentContext: '你是方案架构师。基于需求确认的结果，设计方案的整体框架。',
  outputs: [
    { name: '方案大纲', path: '02-框架构思/方案大纲.md' },
    { name: '逻辑结构图', path: '02-框架构思/逻辑结构图.md' },
  ],
};

const mockTask: Task = {
  id: 'task-123',
  name: '贵港供销社方案',
  description: '贵港供销社南北大通道合作方案',
  status: 'running',
  basePath: '/test/workspace/tasks/demo-task',
  createdAt: '2026-05-13T00:00:00Z',
  currentStageId: 'framework',
  workflow: {
    name: '标准四阶段工作流',
    description: 'Standard workflow',
    stages: [],
  },
  stages: [mockStage],
};

describe('formatAgentInstructions', () => {
  it('should include task name and description', () => {
    const result = formatAgentInstructions(mockTask, mockStage);
    expect(result).toContain('**任务名称**：贵港供销社方案');
    expect(result).toContain('贵港供销社南北大通道合作方案');
  });

  it('should include stage name and description', () => {
    const result = formatAgentInstructions(mockTask, mockStage);
    expect(result).toContain('**当前阶段**：框架构思');
    expect(result).toContain('设计方案整体结构、章节安排与逻辑主线');
  });

  it('should include agent context', () => {
    const result = formatAgentInstructions(mockTask, mockStage);
    expect(result).toContain('你是方案架构师');
    expect(result).toContain('基于需求确认的结果，设计方案的整体框架');
  });

  it('should list all expected outputs', () => {
    const result = formatAgentInstructions(mockTask, mockStage);
    expect(result).toContain('方案大纲');
    expect(result).toContain('逻辑结构图');
    expect(result).toContain('02-框架构思/方案大纲.md');
    expect(result).toContain('02-框架构思/逻辑结构图.md');
  });

  it('should include output file instruction', () => {
    const result = formatAgentInstructions(mockTask, mockStage);
    expect(result).toContain('请将生成的内容写入以下文件');
  });

  it('should handle task without description', () => {
    const taskNoDesc = { ...mockTask, description: undefined };
    const result = formatAgentInstructions(taskNoDesc, mockStage);
    expect(result).toContain('**任务名称**：贵港供销社方案');
    expect(result).not.toContain('undefined');
  });

  it('should handle stage with single output', () => {
    const singleOutputStage: TaskStage = {
      ...mockStage,
      outputs: [{ name: '需求确认单', path: '01-需求确认/需求确认单.md' }],
    };
    const result = formatAgentInstructions(mockTask, singleOutputStage);
    expect(result).toContain('需求确认单');
    expect(result).not.toContain('逻辑结构图');
  });
});
