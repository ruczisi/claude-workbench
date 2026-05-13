import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeBase, type KnowledgeResult } from '../../src/services/knowledgeBase';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
}));

describe('KnowledgeBase', () => {
  let kb: KnowledgeBase;

  beforeEach(() => {
    kb = new KnowledgeBase();
    vi.clearAllMocks();
  });

  describe('search', () => {
    it('should return empty array when root path not set', async () => {
      const results = await kb.search('supply chain');
      expect(results).toEqual([]);
    });

    it('should search by keywords and return ranked results', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');
      const readDirMock = vi.mocked(readDir);
      const invokeMock = vi.mocked(invoke);

      kb.setRootPath('/notebook');

      readDirMock.mockResolvedValueOnce([
        { name: '供应链数字化.md', isFile: true, isDirectory: false, isSymlink: false },
        { name: '集采集配.md', isFile: true, isDirectory: false, isSymlink: false },
      ] as any);

      readDirMock.mockResolvedValueOnce([]);

      invokeMock
        .mockResolvedValueOnce(`---\ntitle: "供应链数字化"\ndescription: "数字化供应链转型"\ntype: concept\ntags: ["supply-chain", "digital"]\ndomain: "supply-chain"\n---\n\n# 供应链数字化`)
        .mockResolvedValueOnce(`---\ntitle: "集采集配"\ndescription: "集中采购与配送"\ntype: concept\ntags: ["procurement", "distribution"]\ndomain: "supply-chain"\n---\n\n# 集采集配`);

      const results = await kb.search('supply chain');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('供应链数字化');
      expect(results[0].relevance).toBeGreaterThan(0);
    });

    it('should filter by type when specified', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');
      const readDirMock = vi.mocked(readDir);
      const invokeMock = vi.mocked(invoke);

      kb.setRootPath('/notebook');

      readDirMock.mockResolvedValueOnce([
        { name: '概念.md', isFile: true, isDirectory: false, isSymlink: false },
      ] as any);
      readDirMock.mockResolvedValueOnce([
        { name: '项目.md', isFile: true, isDirectory: false, isSymlink: false },
      ] as any);

      invokeMock
        .mockResolvedValueOnce(`---\ntitle: "概念A"\ndescription: "一个概念"\ntype: concept\ntags: ["test"]\n---\n`)
        .mockResolvedValueOnce(`---\ntitle: "项目A"\ndescription: "一个项目"\ntype: project\ntags: ["test"]\n---\n`);

      const results = await kb.search('test', { types: ['concept'] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('concept');
    });

    it('should respect maxResults option', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');
      const readDirMock = vi.mocked(readDir);
      const invokeMock = vi.mocked(invoke);

      kb.setRootPath('/notebook');

      readDirMock.mockResolvedValueOnce([
        { name: 'a.md', isFile: true, isDirectory: false, isSymlink: false },
        { name: 'b.md', isFile: true, isDirectory: false, isSymlink: false },
        { name: 'c.md', isFile: true, isDirectory: false, isSymlink: false },
      ] as any);
      readDirMock.mockResolvedValueOnce([]);

      invokeMock
        .mockResolvedValueOnce(`---\ntitle: "AAA"\ndescription: "test"\ntype: concept\ntags: ["test"]\n---\n`)
        .mockResolvedValueOnce(`---\ntitle: "BBB"\ndescription: "test"\ntype: concept\ntags: ["test"]\n---\n`)
        .mockResolvedValueOnce(`---\ntitle: "CCC"\ndescription: "test"\ntype: concept\ntags: ["test"]\n---\n`);

      const results = await kb.search('test', { maxResults: 2 });

      expect(results).toHaveLength(2);
    });
  });

  describe('searchByTags', () => {
    it('should return empty array when no tags provided', async () => {
      kb.setRootPath('/notebook');
      const results = await kb.searchByTags([]);
      expect(results).toEqual([]);
    });

    it('should match exact tags', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');
      const readDirMock = vi.mocked(readDir);
      const invokeMock = vi.mocked(invoke);

      kb.setRootPath('/notebook');

      readDirMock.mockResolvedValueOnce([
        { name: 'match.md', isFile: true, isDirectory: false, isSymlink: false },
        { name: 'nomatch.md', isFile: true, isDirectory: false, isSymlink: false },
      ] as any);
      readDirMock.mockResolvedValueOnce([]);

      invokeMock
        .mockResolvedValueOnce(`---\ntitle: "Match"\ndescription: ""\ntype: concept\ntags: ["supply-chain", "guigang"]\n---\n`)
        .mockResolvedValueOnce(`---\ntitle: "No Match"\ndescription: ""\ntype: concept\ntags: ["other"]\n---\n`);

      const results = await kb.searchByTags(['guigang']);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Match');
    });
  });

  describe('searchForTask', () => {
    it('should return empty array when root path not set', async () => {
      const results = await kb.searchForTask({ name: '贵港供销社' });
      expect(results).toEqual([]);
    });

    it('should search using task name and description', async () => {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');
      const readDirMock = vi.mocked(readDir);
      const invokeMock = vi.mocked(invoke);

      kb.setRootPath('/notebook');

      readDirMock.mockResolvedValueOnce([
        { name: '贵港.md', isFile: true, isDirectory: false, isSymlink: false },
      ] as any);
      readDirMock.mockResolvedValueOnce([]);

      invokeMock.mockResolvedValueOnce(`---\ntitle: "贵港供销社"\ndescription: "贵港市供销合作社"\ntype: concept\ntags: ["guigang", "cooperative"]\n---\n`);

      const results = await kb.searchForTask({
        name: '贵港供销社',
        description: '南北大通道',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('贵港供销社');
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no cache', () => {
      const stats = kb.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
    });
  });

  describe('readDocument', () => {
    it('should return empty string when root path not set', async () => {
      const content = await kb.readDocument('test.md');
      expect(content).toBe('');
    });

    it('should read document via invoke', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);

      kb.setRootPath('/notebook');
      invokeMock.mockResolvedValueOnce('Document content');

      const content = await kb.readDocument('20-Wiki/Concepts/test.md');
      expect(content).toBe('Document content');
    });
  });
});
