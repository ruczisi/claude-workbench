import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import type { Task } from './taskManager';
import { getCompletedStageFiles } from './previewUtils';

export interface ExportResult {
  path: string;
  stageCount: number;
  fileCount: number;
}

/**
 * 将任务导出为综合 Markdown 文档
 *
 * 包含：任务信息、阶段列表、各阶段输出文件内容
 */
export async function exportTaskToMarkdown(task: Task): Promise<ExportResult> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const exportFileName = `export_${dateStr}.md`;
  const exportPath = await join(task.basePath, exportFileName);

  const lines: string[] = [];

  // Title
  lines.push(`# ${task.name}`);
  lines.push('');

  // Meta
  lines.push('## 任务信息');
  lines.push('');
  lines.push(`| 属性 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 任务 ID | ${task.id} |`);
  lines.push(`| 状态 | ${task.status} |`);
  lines.push(`| 工作目录 | ${task.basePath} |`);
  lines.push(`| 创建时间 | ${task.createdAt} |`);
  if (task.description) {
    lines.push(`| 描述 | ${task.description} |`);
  }
  lines.push('');

  // Stages
  lines.push('## 阶段概览');
  lines.push('');
  lines.push(`| 序号 | 阶段 | 状态 | 输出文件数 |`);
  lines.push(`|------|------|------|-----------|`);
  for (const [i, stage] of task.stages.entries()) {
    const statusLabel =
      stage.status === 'completed' ? '已完成' :
      stage.status === 'running' ? '进行中' :
      stage.status === 'error' ? '出错' : '待开始';
    lines.push(`| ${i + 1} | ${stage.name} | ${statusLabel} | ${stage.outputs.length} |`);
  }
  lines.push('');

  // Completed stage contents
  const files = getCompletedStageFiles(task);
  const stageGroups = new Map<string, typeof files>();
  for (const f of files) {
    const arr = stageGroups.get(f.stageName) || [];
    arr.push(f);
    stageGroups.set(f.stageName, arr);
  }

  let fileCount = 0;
  for (const [stageName, stageFiles] of stageGroups) {
    lines.push(`## ${stageName}`);
    lines.push('');

    for (const file of stageFiles) {
      lines.push(`### ${file.fileName}`);
      lines.push('');

      try {
        const filePath = await join(task.basePath, file.filePath);
        const content = await invoke<string>('read_text_file_command', { path: filePath });
        lines.push('```markdown');
        lines.push(content);
        lines.push('```');
        fileCount++;
      } catch {
        lines.push('> ⚠️ 读取文件失败');
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push(`*由 Cospace 自动生成 — ${now.toLocaleString('zh-CN')}*`);

  const markdown = lines.join('\n');
  await invoke('write_text_file_command', { path: exportPath, content: markdown });

  return {
    path: exportPath,
    stageCount: stageGroups.size,
    fileCount,
  };
}
