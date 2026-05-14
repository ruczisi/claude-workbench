import { describe, it, expect, vi } from 'vitest';
import {
  parseUserIntent,
  type UserIntent,
  type IntentType,
  type ParseContext,
} from '../../src/services/intentEngine';
import { callLlm } from '../../src/services/llmService';
import type { LlmConfig } from '../../src/services/llmConfig';
import type { Task } from '../../src/services/taskManager';

vi.mock('../../src/services/llmService', () => ({
  callLlm: vi.fn(),
}));

const mockConfig: LlmConfig = {
  provider: 'deepseek',
  apiKey: 'sk-test',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};

const createMockTask = (): Task => ({
  id: 'task-abc123',
  name: '贵港供销社方案',
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
    { id: 'demand', name: '需求确认', description: '确认需求', status: 'running', outputs: [] },
    { id: 'framework', name: '框架构思', description: '设计框架', status: 'pending', outputs: [] },
    { id: 'draft', name: '内容撰写', description: '撰写内容', status: 'pending', outputs: [] },
    { id: 'review', name: '审核定稿', description: '审核', status: 'pending', outputs: [] },
  ],
  currentStageId: 'demand',
  status: 'running',
  basePath: '/test/tasks/demo',
  createdAt: new Date().toISOString(),
});

describe('intentEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseUserIntent', () => {
    it('should parse create_task intent', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'create_task',
          confidence: 0.95,
          params: { name: '贵港供销社合作方案', description: '撰写贵港供销社南北大通道合作方案' },
        }),
      });

      const result = await parseUserIntent('帮我写个贵港供销社合作方案', {}, mockConfig);

      expect(result.type).toBe('create_task');
      expect(result.confidence).toBe(0.95);
      expect(result.params?.name).toBe('贵港供销社合作方案');
    });

    it('should parse start_stage intent', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'start_stage',
          confidence: 0.9,
          params: { stageId: 'demand' },
        }),
      });

      const task = createMockTask();
      const result = await parseUserIntent('开始需求确认阶段', { currentTask: task }, mockConfig);

      expect(result.type).toBe('start_stage');
      expect(result.params?.stageId).toBe('demand');
    });

    it('should parse advance_stage intent (next stage)', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'advance_stage',
          confidence: 0.92,
          params: {},
        }),
      });

      const task = createMockTask();
      const result = await parseUserIntent('下一阶段', { currentTask: task }, mockConfig);

      expect(result.type).toBe('advance_stage');
    });

    it('should return ask_question when confidence is low', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'create_task',
          confidence: 0.3,
          clarification: '请具体说明方案的主题和目标受众',
        }),
      });

      const result = await parseUserIntent('帮我写个方案', {}, mockConfig);

      expect(result.type).toBe('ask_question');
      expect(result.clarification).toBe('请具体说明方案的主题和目标受众');
    });

    it('should return general_chat for casual messages', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'general_chat',
          confidence: 0.98,
          response: '你好！我是 Cospace，有什么可以帮你的吗？',
        }),
      });

      const result = await parseUserIntent('你好', {}, mockConfig);

      expect(result.type).toBe('general_chat');
      expect(result.response).toBe('你好！我是 Cospace，有什么可以帮你的吗？');
    });

    it('should handle missing current task for stage-related intents', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'start_stage',
          confidence: 0.7,
          params: { stageId: 'demand' },
        }),
      });

      const result = await parseUserIntent('开始第一阶段', {}, mockConfig);

      // Should convert to ask_question since no task is active
      expect(result.type).toBe('ask_question');
      expect(result.clarification).toContain('没有活跃的任务');
    });

    it('should handle invalid LLM response gracefully', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: 'invalid json',
      });

      const result = await parseUserIntent('test', {}, mockConfig);

      expect(result.type).toBe('general_chat');
      expect(result.confidence).toBe(0);
      expect(result.response).toContain('抱歉');
    });

    it('should handle LLM call errors gracefully', async () => {
      vi.mocked(callLlm).mockRejectedValueOnce(new Error('Network error'));

      const result = await parseUserIntent('test', {}, mockConfig);

      expect(result.type).toBe('general_chat');
      expect(result.confidence).toBe(0);
      expect(result.response).toContain('抱歉');
    });

    it('should pass task context to LLM system prompt', async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'advance_stage',
          confidence: 0.9,
          params: {},
        }),
      });

      const task = createMockTask();
      await parseUserIntent('下一步', { currentTask: task, currentStageId: 'demand' }, mockConfig);

      expect(callLlm).toHaveBeenCalledTimes(1);
      const request = vi.mocked(callLlm).mock.calls[0][1];
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[0].content).toContain('任务解析器');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toContain('下一步');
    });
  });

  describe('intent type validation', () => {
    it('should accept all valid intent types', () => {
      const validTypes: IntentType[] = [
        'create_task',
        'start_stage',
        'complete_stage',
        'advance_stage',
        'jump_stage',
        'search_knowledge',
        'ask_question',
        'general_chat',
      ];
      // Type check only — if this compiles, the types are correct
      expect(validTypes.length).toBe(8);
    });
  });
});
