import { describe, it, expect } from 'vitest';
import {
  LLM_PRESET_MODELS,
  getDefaultBaseUrl,
  validateLlmConfig,
  type LlmConfig,
} from '../../src/services/llmConfig';

describe('llmConfig', () => {
  describe('LLM_PRESET_MODELS', () => {
    it('should have domestic models at top priority', () => {
      const domesticProviders = ['zhipu', 'deepseek', 'aliyun'];
      const firstThreeProviders = LLM_PRESET_MODELS.slice(0, 3).map((m) => m.provider);
      expect(firstThreeProviders).toEqual(domesticProviders);
    });

    it('should include all required providers', () => {
      const providers = LLM_PRESET_MODELS.map((m) => m.provider);
      expect(providers).toContain('zhipu');
      expect(providers).toContain('deepseek');
      expect(providers).toContain('aliyun');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('custom');
    });

    it('should have unique model ids', () => {
      const ids = LLM_PRESET_MODELS.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have default base URLs for all presets except custom', () => {
      for (const model of LLM_PRESET_MODELS) {
        if (model.provider !== 'custom') {
          expect(model.defaultBaseUrl).toBeTruthy();
          expect(model.defaultBaseUrl).toMatch(/^https?:\/\//);
        }
      }
    });
  });

  describe('getDefaultBaseUrl', () => {
    it('should return correct URL for zhipu', () => {
      expect(getDefaultBaseUrl('zhipu')).toBe('https://open.bigmodel.cn/api/paas/v4/');
    });

    it('should return correct URL for deepseek', () => {
      expect(getDefaultBaseUrl('deepseek')).toBe('https://api.deepseek.com/v1');
    });

    it('should return correct URL for aliyun', () => {
      expect(getDefaultBaseUrl('aliyun')).toContain('dashscope');
    });

    it('should return empty string for custom', () => {
      expect(getDefaultBaseUrl('custom')).toBe('');
    });

    it('should return empty string for unknown provider', () => {
      expect(getDefaultBaseUrl('unknown' as never)).toBe('');
    });
  });

  describe('validateLlmConfig', () => {
    it('should pass for valid config with all fields', () => {
      const config: LlmConfig = {
        provider: 'deepseek',
        apiKey: 'sk-test123',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      };
      const result = validateLlmConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when apiKey is missing', () => {
      const config = {
        provider: 'deepseek',
        apiKey: '',
        model: 'deepseek-chat',
      } as LlmConfig;
      const result = validateLlmConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API Key 不能为空');
    });

    it('should fail when model is missing', () => {
      const config = {
        provider: 'deepseek',
        apiKey: 'sk-test123',
        model: '',
      } as LlmConfig;
      const result = validateLlmConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('模型名称不能为空');
    });

    it('should pass with minimal required fields', () => {
      const config: LlmConfig = {
        provider: 'zhipu',
        apiKey: 'test-key',
        model: 'glm-4-flash',
      };
      const result = validateLlmConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should use default base URL when not provided', () => {
      const config: LlmConfig = {
        provider: 'deepseek',
        apiKey: 'sk-test',
        model: 'deepseek-chat',
      };
      const resolved = { ...config, baseUrl: config.baseUrl || getDefaultBaseUrl(config.provider) };
      expect(resolved.baseUrl).toBe('https://api.deepseek.com/v1');
    });
  });
});
