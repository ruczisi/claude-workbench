import { callLlm } from './llmService';
import type { LlmConfig } from './llmConfig';
import type { Task } from './taskManager';

export type IntentType =
  | 'create_task'
  | 'start_stage'
  | 'complete_stage'
  | 'advance_stage'
  | 'jump_stage'
  | 'search_knowledge'
  | 'ask_question'
  | 'general_chat';

export interface UserIntent {
  type: IntentType;
  confidence: number;
  params?: Record<string, string>;
  clarification?: string;
  response?: string;
}

export interface ParseContext {
  currentTask?: Task;
  currentStageId?: string;
}

const CLARIFICATION_THRESHOLD = 0.6;

function buildSystemPrompt(context: ParseContext): string {
  let prompt = `你是 Cospace 任务解析器。你的职责是将用户的自然语言输入解析为结构化的意图。

支持的动作类型：
- create_task: 创建新任务（如"帮我写个方案"）
- start_stage: 开始某个阶段（如"开始需求确认"）
- complete_stage: 完成当前阶段（如"这一阶段完成了"）
- advance_stage: 推进到下一阶段（如"下一阶段"、"继续"）
- jump_stage: 跳转到指定阶段（如"跳到框架构思"、"阶段2"）
- search_knowledge: 搜索知识库（如"搜索知识库中关于XX的内容"）
- ask_question: 需要向用户澄清（当信息不足时）
- general_chat: 一般对话（问候、闲聊等）

输出格式：严格返回 JSON，不要包含 markdown 代码块标记。
{
  "type": "<意图类型>",
  "confidence": <置信度 0-1>,
  "params": {<可选参数>},
  "clarification": "<当 confidence < 0.6 时的澄清问题>",
  "response": "<当 general_chat 时的回复内容>"
}`;

  if (context.currentTask) {
    prompt += `\n\n当前活跃任务：${context.currentTask.name}\n当前阶段：${context.currentTask.currentStageId || '无'}\n阶段列表：${context.currentTask.stages.map((s) => s.name).join(', ')}`;
  } else {
    prompt += '\n\n当前没有活跃的任务。任何阶段相关指令都应视为需要创建任务或澄清。';
  }

  return prompt;
}

export function isLlmConfigValid(config: LlmConfig): { valid: boolean; message?: string } {
  if (!config.apiKey || config.apiKey.trim() === '') {
    return { valid: false, message: '请先配置 LLM（侧边栏 → 设置）' };
  }
  if (!config.model || config.model.trim() === '') {
    return { valid: false, message: 'LLM 模型名称未配置' };
  }
  if (!config.baseUrl || config.baseUrl.trim() === '') {
    return { valid: false, message: 'LLM Base URL 未配置' };
  }
  return { valid: true };
}

/**
 * 解析用户输入为结构化意图
 */
export async function parseUserIntent(
  input: string,
  context: ParseContext,
  config: LlmConfig
): Promise<UserIntent> {
  // Pre-check LLM config
  const configCheck = isLlmConfigValid(config);
  if (!configCheck.valid) {
    return {
      type: 'general_chat',
      confidence: 0,
      response: configCheck.message,
    };
  }

  try {
    const result = await callLlm(config, {
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        { role: 'user', content: input },
      ],
      temperature: 0.1,
      maxTokens: 500,
    });

    const parsed = parseLlmResponse(result.content);
    return postProcessIntent(parsed, context);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return {
        type: 'general_chat',
        confidence: 0,
        response: 'LLM API 认证失败，请检查 API Key 是否正确配置（侧边栏 → 设置）。',
      };
    }
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return {
        type: 'general_chat',
        confidence: 0,
        response: 'LLM API 请求过于频繁，请稍后再试。',
      };
    }
    return {
      type: 'general_chat',
      confidence: 0,
      response: `抱歉，解析请求时出了点问题：${errorMessage}`,
    };
  }
}

function parseLlmResponse(content: string): UserIntent {
  try {
    const cleaned = content.trim();
    const jsonStr = cleaned.startsWith('```')
      ? cleaned.replace(/```json\n?/, '').replace(/```$/, '').trim()
      : cleaned;

    const data = JSON.parse(jsonStr);

    return {
      type: validateIntentType(data.type),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
      params: data.params && typeof data.params === 'object' ? data.params : undefined,
      clarification: data.clarification,
      response: data.response,
    };
  } catch {
    return { type: 'general_chat', confidence: 0 };
  }
}

function validateIntentType(type: unknown): IntentType {
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
  return validTypes.includes(type as IntentType) ? (type as IntentType) : 'general_chat';
}

function postProcessIntent(
  intent: UserIntent,
  context: ParseContext
): UserIntent {
  // Parse failure fallback: confidence 0 with no fields means LLM response was invalid
  if (
    intent.type === 'general_chat' &&
    intent.confidence === 0 &&
    !intent.clarification &&
    !intent.response
  ) {
    return {
      type: 'general_chat',
      confidence: 0,
      response: '抱歉，解析请求时出了点问题，请再试一次。',
    };
  }

  // If confidence is low, convert to ask_question
  if (intent.confidence < CLARIFICATION_THRESHOLD) {
    return {
      type: 'ask_question',
      confidence: intent.confidence,
      clarification: intent.clarification || '能否再说具体一些？',
    };
  }

  // If stage-related intent but no active task, ask for task creation
  if (
    !context.currentTask &&
    (intent.type === 'start_stage' ||
      intent.type === 'complete_stage' ||
      intent.type === 'advance_stage' ||
      intent.type === 'jump_stage')
  ) {
    return {
      type: 'ask_question',
      confidence: 0.5,
      clarification: '没有活跃的任务，请先创建任务或选择一个已有任务。',
    };
  }

  return intent;
}
