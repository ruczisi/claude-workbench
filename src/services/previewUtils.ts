import type { Task } from './taskManager';

export interface FileEntry {
  stageName: string;
  stageId: string;
  fileName: string;
  filePath: string;
}

/**
 * Extract all output files from completed stages of a task
 */
export function getCompletedStageFiles(task: Task | null): FileEntry[] {
  if (!task) return [];

  const entries: FileEntry[] = [];
  for (const stage of task.stages) {
    if (stage.status === 'completed') {
      for (const output of stage.outputs) {
        entries.push({
          stageName: stage.name,
          stageId: stage.id,
          fileName: output.name,
          filePath: output.path,
        });
      }
    }
  }
  return entries;
}

/**
 * Group file entries by stage name
 */
export function groupFilesByStage(entries: FileEntry[]): Map<string, FileEntry[]> {
  const groups = new Map<string, FileEntry[]>();
  for (const entry of entries) {
    const existing = groups.get(entry.stageName) || [];
    existing.push(entry);
    groups.set(entry.stageName, existing);
  }
  return groups;
}
