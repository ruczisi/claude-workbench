/**
 * LLM 配置管理
 *
 * 设计原则：
 * 1. 国内模型优先，降低使用门槛
 * 2. OpenAI 兼容格式统一，减少客户端复杂度
 * 3. 支持自定义 Base URL（代理/中转服务）
 */

export type LlmProvider =
  | 'zhipu'
  | 'deepseek'
  | 'aliyun'
  | 'anthropic'
  | 'openai'
  | 'custom';

export interface LlmConfig {
  /** LLM 提供商 */
  provider: LlmProvider;
  /** API Key */
  apiKey: string;
  /** 自定义 Base URL（可选，默认使用预设） */
  baseUrl?: string;
  /** 模型名称 */
  model: string;
}

export interface LlmModelOption {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 提供商 */
  provider: LlmProvider;
  /** 描述 */
  description: string;
  /** 默认 Base URL */
  defaultBaseUrl: string;
}

/** 预设模型列表（国内优先） */
export const LLM_PRESET_MODELS: LlmModelOption[] = [
  {
    id: 'glm-4-flash',
    name: '智谱 GLM-4-Flash',
    provider: 'zhipu',
    description: '免费，中文理解好，适合意图解析',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek-V3',
    provider: 'deepseek',
    description: '国内、便宜、推理能力强',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
  },
  {
    id: 'qwen-turbo',
    name: '通义千问 qwen-turbo',
    provider: 'aliyun',
    description: '阿里云，中文优化，性价比高',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    description: 'Anthropic 轻量模型，需代理访问',
    defaultBaseUrl: 'https://api.anthropic.com',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o-mini',
    provider: 'openai',
    description: 'OpenAI 轻量模型，需代理访问',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'custom',
    name: '自定义',
    provider: 'custom',
    description: '通过自定义 Base URL 使用任意 OpenAI 兼容模型',
    defaultBaseUrl: '',
  },
];

/** 提供商显示名称映射 */
export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  zhipu: '智谱 AI',
  deepseek: 'DeepSeek',
  aliyun: '阿里云',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  custom: '自定义',
};

/**
 * 获取提供商默认 Base URL
 */
export function getDefaultBaseUrl(provider: LlmProvider): string {
  const model = LLM_PRESET_MODELS.find((m) => m.provider === provider);
  return model?.defaultBaseUrl || '';
}

/**
 * 根据模型 ID 获取预设模型信息
 */
export function getPresetModelById(id: string): LlmModelOption | undefined {
  return LLM_PRESET_MODELS.find((m) => m.id === id);
}

/**
 * 验证 LLM 配置
 */
export function validateLlmConfig(
  config: LlmConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.apiKey || config.apiKey.trim() === '') {
    errors.push('API Key 不能为空');
  }

  if (!config.model || config.model.trim() === '') {
    errors.push('模型名称不能为空');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 解析完整配置（填充默认值）
 */
export function resolveLlmConfig(config: LlmConfig): LlmConfig {
  return {
    ...config,
    baseUrl: config.baseUrl || getDefaultBaseUrl(config.provider),
  };
}

/**
 * 创建默认 LLM 配置（智谱 GLM-4-Flash，免费）
 */
export function createDefaultLlmConfig(): LlmConfig {
  const defaultModel = LLM_PRESET_MODELS[0]; // GLM-4-Flash
  return {
    provider: defaultModel.provider,
    apiKey: '',
    baseUrl: defaultModel.defaultBaseUrl,
    model: defaultModel.id,
  };
}
