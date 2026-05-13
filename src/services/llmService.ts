/**
 * LLM API 调用服务
 *
 * 使用 OpenAI 兼容格式，支持国内模型（智谱、DeepSeek、通义等）
 */

import type { LlmConfig } from './llmConfig';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  model?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 调用 LLM API（OpenAI 兼容格式）
 */
export async function callLlm(
  config: LlmConfig,
  request: LlmRequest
): Promise<LlmResponse> {
  const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
  const url = baseUrl
    ? `${baseUrl}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const body = {
    model: request.model || config.model,
    messages: request.messages,
    temperature: request.temperature ?? 0.3,
    max_tokens: request.maxTokens ?? 2000,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined;

    return { content, usage };
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(String(err));
  }
}
