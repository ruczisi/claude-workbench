import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskStage } from './taskManager';

export interface FileChangeEvent {
  path: string;
  event_type: string;
}

export interface FileWatcherCallbacks {
  onStageOutputChanged?: (stage: TaskStage, filePath: string) => void;
  onAnyFileChanged?: (filePath: string, eventType: string) => void;
}

/**
 * 文件监听服务 — 连接 Rust 文件监听器与前端业务逻辑
 *
 * 功能：
 * 1. 启动/停止文件监听（通过 Tauri command）
 * 2. 接收 file-change 事件
 * 3. 过滤并匹配当前阶段的输出文件变更
 * 4. 触发回调通知业务层
 */
export class FileWatcher {
  private unlisten: UnlistenFn | null = null;
  private currentTask: Task | null = null;
  private callbacks: FileWatcherCallbacks = {};
  private changedFiles: Set<string> = new Set();

  /** 设置当前任务（用于过滤相关文件变更） */
  setTask(task: Task | null): void {
    this.currentTask = task;
    this.changedFiles.clear();
  }

  /** 注册回调 */
  on(callbacks: FileWatcherCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 启动文件监听
   */
  async startWatching(basePath: string): Promise<void> {
    // 停止现有监听
    await this.stopWatching();

    // 启动 Rust 文件监听器
    await invoke('start_file_watcher', { path: basePath });

    // 监听前端事件
    this.unlisten = await listen<FileChangeEvent>('file-change', (event) => {
      this.handleFileChange(event.payload);
    });
  }

  /**
   * 停止文件监听
   */
  async stopWatching(): Promise<void> {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    try {
      await invoke('stop_file_watcher');
    } catch {
      // Ignore errors when stopping
    }
    this.changedFiles.clear();
  }

  /** 获取已变更的文件列表 */
  getChangedFiles(): string[] {
    return Array.from(this.changedFiles);
  }

  /** 清除变更记录 */
  clearChangedFiles(): void {
    this.changedFiles.clear();
  }

  private handleFileChange(event: FileChangeEvent): void {
    const { path, event_type } = event;

    // 忽略非修改事件
    if (event_type !== 'modify' && event_type !== 'create') return;

    this.changedFiles.add(path);
    this.callbacks.onAnyFileChanged?.(path, event_type);

    // 检查是否是当前阶段的输出文件
    if (this.currentTask?.currentStageId) {
      const currentStage = this.currentTask.stages.find(
        (s) => s.id === this.currentTask!.currentStageId
      );
      if (currentStage) {
        const isStageOutput = currentStage.outputs.some((output) =>
          path.includes(output.path)
        );
        if (isStageOutput) {
          this.callbacks.onStageOutputChanged?.(currentStage, path);
        }
      }
    }
  }
}

// Singleton instance
export const fileWatcher = new FileWatcher();
