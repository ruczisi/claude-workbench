import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callLlm, type LlmMessage } from '../../src/services/llmService';
import type { LlmConfig } from '../../src/services/llmConfig';

const mockConfig: LlmConfig = {
  provider: 'deepseek',
  apiKey: 'sk-test123',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('llmService', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('callLlm', () => {
    it('should send correct request format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ];

      await callLlm(mockConfig, { messages });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test123',
      });

      const body = JSON.parse(options.body);
      expect(body.model).toBe('deepseek-chat');
      expect(body.messages).toEqual(messages);
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(2000);
    });

    it('should return parsed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Task created' } }],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        }),
      });

      const result = await callLlm(mockConfig, {
        messages: [{ role: 'user', content: 'create task' }],
      });

      expect(result.content).toBe('Task created');
      expect(result.usage).toEqual({
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
      });
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        callLlm(mockConfig, { messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toThrow('LLM API error: 401');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        callLlm(mockConfig, { messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toThrow('Network failure');
    });

    it('should handle empty choices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      });

      const result = await callLlm(mockConfig, {
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result.content).toBe('');
    });

    it('should use custom base URL without trailing slash', async () => {
      const customConfig: LlmConfig = {
        ...mockConfig,
        baseUrl: 'https://custom.example.com',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OK' } }],
        }),
      });

      await callLlm(customConfig, { messages: [{ role: 'user', content: 'hi' }] });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.example.com/chat/completions');
    });

    it('should handle base URL with trailing slash', async () => {
      const customConfig: LlmConfig = {
        ...mockConfig,
        baseUrl: 'https://custom.example.com/',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OK' } }],
        }),
      });

      await callLlm(customConfig, { messages: [{ role: 'user', content: 'hi' }] });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.example.com/chat/completions');
    });
  });
});
