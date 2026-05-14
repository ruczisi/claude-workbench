import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { readDir, type DirEntry } from '@tauri-apps/plugin-fs';

export interface KnowledgeResult {
  title: string;
  description: string;
  type: string;
  tags: string[];
  path: string;
  relevance: number;
}

interface ParsedFrontmatter {
  title: string;
  description: string;
  type: string;
  tags: string[];
  domain: string;
  [key: string]: unknown;
}

export class KnowledgeBase {
  private rootPath: string | null = null;
  private conceptsDir: string = '20-Wiki/Concepts';
  private projectsDir: string = '20-Wiki/Projects';
  private cache: Map<string, KnowledgeResult> = new Map();

  setRootPath(
    path: string,
    options?: { conceptsDir?: string; projectsDir?: string }
  ): void {
    this.rootPath = path;
    if (options?.conceptsDir) {
      this.conceptsDir = options.conceptsDir;
    }
    if (options?.projectsDir) {
      this.projectsDir = options.projectsDir;
    }
    this.cache.clear();
  }

  private ensureRootPath(): string {
    if (!this.rootPath) {
      throw new Error('KnowledgeBase root path not set. Call setRootPath() first.');
    }
    return this.rootPath;
  }

  private parseFrontmatter(content: string): ParsedFrontmatter | null {
    const lines = content.split('\n');
    if (lines.length < 3 || lines[0].trim() !== '---') {
      return null;
    }

    const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
    if (endIndex === -1) {
      return null;
    }

    const yamlLines = lines.slice(1, endIndex + 1);
    const result: Record<string, unknown> = {};

    for (const line of yamlLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (key === 'tags') {
        const match = value.match(/\[\s*"([^"]*)"\s*(?:,\s*"([^"]*)"\s*)*\]/);
        if (match) {
          const allMatches = value.match(/"([^"]*)"/g);
          result[key] = allMatches
            ? allMatches.map((m) => m.replace(/"/g, ''))
            : [];
        } else {
          result[key] = [];
        }
      } else {
        result[key] = value.replace(/^"|"$/g, '');
      }
    }

    return {
      title: String(result.title || ''),
      description: String(result.description || ''),
      type: String(result.type || ''),
      tags: Array.isArray(result.tags) ? result.tags : [],
      domain: String(result.domain || ''),
      ...result,
    };
  }

  private async scanDirectory(dirPath: string): Promise<KnowledgeResult[]> {
    const results: KnowledgeResult[] = [];

    try {
      const entries: DirEntry[] = await readDir(dirPath);
      for (const entry of entries) {
        if (entry.isDirectory) {
          const subPath = await join(dirPath, entry.name);
          const subResults = await this.scanDirectory(subPath);
          results.push(...subResults);
        } else if (entry.isFile && entry.name.endsWith('.md')) {
          const filePath = await join(dirPath, entry.name);
          const relativePath = this.rootPath
            ? filePath.replace(this.rootPath + '/', '')
            : filePath;

          try {
            const content = await invoke<string>('read_text_file_command', {
              path: filePath,
            });
            const frontmatter = this.parseFrontmatter(content);
            if (frontmatter) {
              const result: KnowledgeResult = {
                title: frontmatter.title || entry.name.replace('.md', ''),
                description: frontmatter.description || '',
                type: frontmatter.type || 'unknown',
                tags: frontmatter.tags || [],
                path: relativePath,
                relevance: 0,
              };
              results.push(result);
              this.cache.set(relativePath, result);
            }
          } catch {
            // Skip files that fail to read
          }
        }
      }
    } catch {
      // Directory may not exist
    }

    return results;
  }

  private async ensureCache(): Promise<KnowledgeResult[]> {
    if (this.cache.size > 0) {
      return Array.from(this.cache.values());
    }

    const root = this.ensureRootPath();
    const allResults: KnowledgeResult[] = [];

    const conceptsPath = await join(root, this.conceptsDir);
    const conceptResults = await this.scanDirectory(conceptsPath);
    allResults.push(...conceptResults);

    const projectsPath = await join(root, this.projectsDir);
    const projectResults = await this.scanDirectory(projectsPath);
    allResults.push(...projectResults);

    return allResults;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,，]+/)
      .filter((t) => t.length > 0);
  }

  private calculateRelevance(
    item: KnowledgeResult,
    keywords: string[]
  ): number {
    const weights = {
      title: 3,
      tags: 2,
      description: 1,
      domain: 2,
    };

    let matchedWeight = 0;
    const maxWeight = keywords.length * Math.max(...Object.values(weights));

    for (const keyword of keywords) {
      if (item.title.toLowerCase().includes(keyword)) {
        matchedWeight += weights.title;
      }
      if (item.tags.some((tag) => tag.toLowerCase().includes(keyword))) {
        matchedWeight += weights.tags;
      }
      if (item.description.toLowerCase().includes(keyword)) {
        matchedWeight += weights.description;
      }
    }

    return maxWeight > 0 ? matchedWeight / maxWeight : 0;
  }

  async search(
    query: string,
    options?: { maxResults?: number; types?: string[] }
  ): Promise<KnowledgeResult[]> {
    if (!this.rootPath) {
      return [];
    }

    const items = await this.ensureCache();
    const keywords = this.tokenize(query);

    if (keywords.length === 0) {
      return [];
    }

    let results = items.map((item) => ({
      ...item,
      relevance: this.calculateRelevance(item, keywords),
    }));

    results = results.filter((item) => item.relevance > 0);

    if (options?.types && options.types.length > 0) {
      results = results.filter((item) =>
        options.types!.includes(item.type)
      );
    }

    results.sort((a, b) => b.relevance - a.relevance);

    const maxResults = options?.maxResults ?? 10;
    return results.slice(0, maxResults);
  }

  async searchByTags(
    tags: string[],
    options?: { maxResults?: number }
  ): Promise<KnowledgeResult[]> {
    if (!this.rootPath || tags.length === 0) {
      return [];
    }

    const items = await this.ensureCache();
    const normalizedTags = tags.map((t) => t.toLowerCase());

    const results = items
      .filter((item) =>
        normalizedTags.some((tag) =>
          item.tags.some((itemTag) => itemTag.toLowerCase() === tag)
        )
      )
      .map((item) => ({ ...item, relevance: 1 }));

    const maxResults = options?.maxResults ?? 10;
    return results.slice(0, maxResults);
  }

  async readDocument(relativePath: string): Promise<string> {
    if (!this.rootPath) {
      return '';
    }

    const fullPath = await join(this.rootPath, relativePath);
    try {
      return await invoke<string>('read_text_file_command', {
        path: fullPath,
      });
    } catch {
      return '';
    }
  }

  async searchForTask(task: {
    name: string;
    description?: string;
  }): Promise<KnowledgeResult[]> {
    if (!this.rootPath) {
      return [];
    }

    const query = `${task.name} ${task.description || ''}`.trim();
    return this.search(query, { maxResults: 10 });
  }

  getStats(): { total: number; byType: Record<string, number> } {
    const items = Array.from(this.cache.values());
    const byType: Record<string, number> = {};

    for (const item of items) {
      byType[item.type] = (byType[item.type] || 0) + 1;
    }

    return {
      total: items.length,
      byType,
    };
  }

  /** Get all template-type documents from knowledge base */
  async getTemplates(): Promise<KnowledgeResult[]> {
    if (!this.rootPath) return [];
    const items = await this.ensureCache();
    return items
      .filter((item) => item.type === 'template' || item.tags.includes('template'))
      .slice(0, 20);
  }
}

export const knowledgeBase = new KnowledgeBase();
