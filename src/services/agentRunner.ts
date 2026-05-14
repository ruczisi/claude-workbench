import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { optimizeAgentPrompt, type OptimizedPrompt } from './promptOptimizer';
import type { Task, TaskStage } from './taskManager';
import type { KnowledgeResult } from './knowledgeBase';
import { contextHistory } from './contextHistory';

export interface AgentConfig {
  type: 'claude' | 'codex' | 'custom';
  customCommand?: string;
}

export interface AgentKeyInfo {
  type: 'file_write' | 'completion' | 'error' | 'thinking';
  message: string;
  detail?: string;
}

export interface AgentSession {
  sessionId: string;
  task: Task;
  stage: TaskStage;
  optimizedPrompt: OptimizedPrompt;
  isRunning: boolean;
}

interface SessionOutputEvent {
  session_id: string;
  data: string;
}

interface SessionExitEvent {
  session_id: string;
  code: number;
}

/**
 * Agent 运行器 — 通过 PTY 与外部 Agent 工具交互
 *
 * 流程：
 * 1. 根据任务上下文生成优化提示词
 * 2. 创建 PTY 会话（工作目录设为任务目录）
 * 3. 启动 Agent 工具并注入提示词
 * 4. 监听输出，提取关键信息
 */
export class AgentRunner {
  private currentSession: AgentSession | null = null;
  private outputBuffer: string = '';
  private unlistenOutput: UnlistenFn | null = null;
  private unlistenExit: UnlistenFn | null = null;

  private onOutputCallback: ((data: string) => void) | null = null;
  private onKeyInfoCallback: ((info: AgentKeyInfo) => void) | null = null;
  private onExitCallback: ((code: number) => void) | null = null;

  /** 是否已有活跃会话 */
  get isRunning(): boolean {
    return this.currentSession?.isRunning ?? false;
  }

  /** 获取当前会话 */
  get session(): AgentSession | null {
    return this.currentSession;
  }

  /** 注册输出回调 */
  onOutput(callback: (data: string) => void): void {
    this.onOutputCallback = callback;
  }

  /** 注册关键信息回调 */
  onKeyInfo(callback: (info: AgentKeyInfo) => void): void {
    this.onKeyInfoCallback = callback;
  }

  /** 注册退出回调 */
  onExit(callback: (code: number) => void): void {
    this.onExitCallback = callback;
  }

  /**
   * 启动 Agent 会话
   */
  async startAgent(
    task: Task,
    stage: TaskStage,
    agentConfig: AgentConfig,
    knowledgeResults?: KnowledgeResult[]
  ): Promise<void> {
    if (this.currentSession?.isRunning) {
      throw new Error('已有 Agent 会话在运行，请先停止');
    }

    // 1. 生成优化提示词（注入知识库上下文）
    const optimizedPrompt = optimizeAgentPrompt({ task, stage, knowledgeResults });

    // 2. 创建会话 ID
    const sessionId = `agent-${task.id}-${stage.id}-${Date.now()}`;

    // 3. 创建 PTY 会话
    await invoke('create_session', {
      sessionId,
      workingDir: task.basePath,
    });

    this.currentSession = {
      sessionId,
      task,
      stage,
      optimizedPrompt,
      isRunning: true,
    };

    this.outputBuffer = '';

    // 4. Log session start
    await contextHistory.logSystem(task.basePath, `Agent session started: ${agentConfig.type} for stage ${stage.name}`);

    // 5. 监听输出事件
    this.unlistenOutput = await listen<SessionOutputEvent>('session-output', (event) => {
      if (event.payload.session_id === sessionId) {
        this.handleOutput(event.payload.data);
      }
    });

    this.unlistenExit = await listen<SessionExitEvent>('session-exit', (event) => {
      if (event.payload.session_id === sessionId) {
        this.handleExit(event.payload.code);
      }
    });

    // 6. 启动 Agent 工具
    const agentCommand = this.getAgentCommand(agentConfig);

    // 先启动 agent 工具
    await this.writeToSession(agentCommand + '\n');

    // 等待 agent 初始化（Claude Code 需要一点时间）
    await this.delay(2000);

    // 注入提示词
    await this.injectPrompt(optimizedPrompt.text);

    // 记录注入的提示词
    await contextHistory.logAgentOutput(task.basePath, `[System Prompt]\n${optimizedPrompt.text}`);
  }

  /**
   * 停止 Agent 会话
   */
  async stopAgent(): Promise<void> {
    if (!this.currentSession) return;

    const { sessionId, task } = this.currentSession;
    this.currentSession.isRunning = false;

    await contextHistory.logSystem(task.basePath, 'Agent session stopped');

    try {
      await invoke('destroy_session', { sessionId });
    } catch (err) {
      console.error('[AgentRunner] Failed to destroy session:', err);
    }

    // 取消事件监听
    if (this.unlistenOutput) {
      this.unlistenOutput();
      this.unlistenOutput = null;
    }
    if (this.unlistenExit) {
      this.unlistenExit();
      this.unlistenExit = null;
    }

    this.currentSession = null;
    this.outputBuffer = '';
  }

  /**
   * 向会话发送输入（用于用户与 Agent 交互）
   */
  async sendInput(input: string): Promise<void> {
    if (!this.currentSession?.isRunning) {
      throw new Error('没有正在运行的 Agent 会话');
    }
    await contextHistory.logUserInput(this.currentSession.task.basePath, input);
    await this.writeToSession(input + '\n');
  }

  private async writeToSession(data: string): Promise<void> {
    if (!this.currentSession) return;
    await invoke('write_to_session', {
      sessionId: this.currentSession.sessionId,
      data,
    });
  }

  private getAgentCommand(config: AgentConfig): string {
    switch (config.type) {
      case 'claude':
        return 'claude';
      case 'codex':
        return 'codex';
      case 'custom':
        return config.customCommand || 'echo "未配置自定义命令"';
      default:
        return 'claude';
    }
  }

  private async injectPrompt(promptText: string): Promise<void> {
    // 将多行提示词逐行发送
    const lines = promptText.split('\n');
    for (const line of lines) {
      await this.writeToSession(line + '\n');
      await this.delay(50); // 避免输入过快
    }
    // 最后发送一个空行表示结束
    await this.writeToSession('\n');
  }

  private handleOutput(data: string): void {
    this.outputBuffer += data;
    this.onOutputCallback?.(data);

    // 记录输出到历史
    if (this.currentSession) {
      contextHistory.logAgentOutput(this.currentSession.task.basePath, data).catch(() => {});
    }

    // 提取关键信息
    const keyInfos = this.extractKeyInfo(data);
    for (const info of keyInfos) {
      this.onKeyInfoCallback?.(info);
    }
  }

  private handleExit(code: number): void {
    if (this.currentSession) {
      this.currentSession.isRunning = false;
    }
    this.onExitCallback?.(code);
  }

  private extractKeyInfo(data: string): AgentKeyInfo[] {
    const infos: AgentKeyInfo[] = [];

    // 检测文件写入
    const fileWritePatterns = [
      /Writing to\s+(.+)/i,
      /Created\s+(.+)/i,
      /Wrote\s+(.+)/i,
      /写入文件[：:]\s*(.+)/i,
    ];

    for (const pattern of fileWritePatterns) {
      const match = data.match(pattern);
      if (match) {
        infos.push({
          type: 'file_write',
          message: `写入文件：${match[1].trim()}`,
          detail: match[0],
        });
      }
    }

    // 检测完成信号
    const completionPatterns = [
      /Done\.?$/im,
      /Finished\.?$/im,
      /完成\.?$/im,
      /All tasks completed/i,
    ];

    for (const pattern of completionPatterns) {
      if (pattern.test(data)) {
        infos.push({
          type: 'completion',
          message: 'Agent 任务完成',
          detail: data.trim(),
        });
      }
    }

    // 检测错误
    const errorPatterns = [
      /Error[：:]\s*(.+)/i,
      /Failed[：:]\s*(.+)/i,
      /错误[：:]\s*(.+)/i,
    ];

    for (const pattern of errorPatterns) {
      const match = data.match(pattern);
      if (match) {
        infos.push({
          type: 'error',
          message: `错误：${match[1].trim()}`,
          detail: data.trim(),
        });
      }
    }

    return infos;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const agentRunner = new AgentRunner();
