import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';

export interface ContextEntry {
  timestamp: string;
  role: 'user' | 'agent' | 'system';
  content: string;
}

/**
 * Agent 会话历史管理器
 * 读写 .cospace/context.jsonl（JSON Lines 格式）
 */
export class ContextHistoryManager {
  /** 追加一条记录到任务的 context.jsonl */
  async append(taskBasePath: string, entry: ContextEntry): Promise<void> {
    const cospaceDir = await join(taskBasePath, '.cospace');
    const filePath = await join(cospaceDir, 'context.jsonl');
    const line = JSON.stringify(entry) + '\n';
    try {
      await invoke('append_text_file_command', { path: filePath, content: line });
    } catch {
      // 文件可能不存在，尝试创建后写入
      await invoke('write_text_file_command', { path: filePath, content: line });
    }
  }

  /** 读取任务的完整会话历史 */
  async load(taskBasePath: string): Promise<ContextEntry[]> {
    try {
      const filePath = await join(taskBasePath, '.cospace', 'context.jsonl');
      const content = await invoke<string>('read_text_file_command', { path: filePath });
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as ContextEntry);
    } catch {
      return [];
    }
  }

  /** 记录 Agent 输出 */
  async logAgentOutput(taskBasePath: string, content: string): Promise<void> {
    await this.append(taskBasePath, { timestamp: new Date().toISOString(), role: 'agent', content });
  }

  /** 记录用户输入 */
  async logUserInput(taskBasePath: string, content: string): Promise<void> {
    await this.append(taskBasePath, { timestamp: new Date().toISOString(), role: 'user', content });
  }

  /** 记录系统事件 */
  async logSystem(taskBasePath: string, content: string): Promise<void> {
    await this.append(taskBasePath, { timestamp: new Date().toISOString(), role: 'system', content });
  }
}

export const contextHistory = new ContextHistoryManager();
