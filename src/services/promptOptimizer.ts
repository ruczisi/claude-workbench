import type { Task, TaskStage } from './taskManager';
import type { KnowledgeResult } from './knowledgeBase';

export interface PromptContext {
  task: Task;
  stage: TaskStage;
  knowledgeResults?: KnowledgeResult[];
}

export interface ExpectedOutput {
  name: string;
  path: string;
}

export interface OptimizedPrompt {
  /** Full optimized prompt text */
  text: string;
  /** Key instruction bullets */
  keyInstructions: string[];
  /** Expected output files */
  expectedOutputs: ExpectedOutput[];
  /** Stage name */
  stageName: string;
}

/**
 * 根据任务上下文生成优化后的 Agent 提示词
 *
 * 将工作流阶段的原始 agentContext 与任务元数据结合，
 * 生成结构清晰、上下文完整的提示词，便于 Agent 工具直接执行。
 */
export function optimizeAgentPrompt(context: PromptContext): OptimizedPrompt {
  const { task, stage, knowledgeResults } = context;

  const keyInstructions = extractKeyInstructions(stage.agentContext);

  const expectedOutputs = stage.outputs.map((o) => ({
    name: o.name,
    path: o.path,
  }));

  const text = buildPromptText(task, stage, expectedOutputs, knowledgeResults);

  return {
    text,
    keyInstructions,
    expectedOutputs,
    stageName: stage.name,
  };
}

function extractKeyInstructions(agentContext: string): string[] {
  const lines = agentContext
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('•') || l.startsWith('-') || /^\d+[.、]/.test(l));

  if (lines.length === 0) {
    // Fallback: extract sentences that look like instructions
    return agentContext
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 10 && !l.startsWith('#') && !l.startsWith('>'))
      .slice(0, 5);
  }

  return lines.map((l) => l.replace(/^[•\-\d.、]+\s*/, '').trim()).filter(Boolean);
}

function buildPromptText(
  task: Task,
  stage: TaskStage,
  outputs: ExpectedOutput[],
  knowledgeResults?: KnowledgeResult[]
): string {
  const parts: string[] = [];

  // Header
  parts.push(`# 任务：${task.name}`);
  parts.push('');

  // Task description
  if (task.description) {
    parts.push(`## 任务描述`);
    parts.push(task.description);
    parts.push('');
  }

  // Stage info
  parts.push(`## 当前阶段：${stage.name}`);
  parts.push(`**阶段目标**：${stage.description}`);
  parts.push('');

  // Working directory
  parts.push(`## 工作目录`);
  parts.push('请在 `' + task.basePath + '` 目录下工作。');
  parts.push('');

  // Expected outputs
  if (outputs.length > 0) {
    parts.push(`## 预期输出`);
    for (const output of outputs) {
      parts.push('- `' + output.path + '` — ' + output.name);
    }
    parts.push('');
  }

  // Knowledge base context injection
  if (knowledgeResults && knowledgeResults.length > 0) {
    parts.push(`## 相关知识`);
    for (const kr of knowledgeResults) {
      parts.push(`- **${kr.title}** (${kr.type}) — ${kr.description}`);
      if (kr.path) {
        parts.push(`  来源：${kr.path}`);
      }
    }
    parts.push('');
  }

  // Agent context (original instructions)
  if (stage.agentContext) {
    parts.push(`## 执行要求`);
    parts.push(stage.agentContext);
    parts.push('');
  }

  // Output format reminder
  parts.push(`## 输出要求`);
  parts.push('1. 将生成内容写入到指定的文件路径中');
  parts.push('2. 使用 Markdown 格式');
  parts.push('3. 关键数据需标注来源');
  parts.push('4. 完成后报告文件写入路径');

  return parts.join('\n');
}
