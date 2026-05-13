import type { Task, TaskStage } from './taskManager';

export function formatAgentInstructions(task: Task, stage: TaskStage): string {
  const outputsList = stage.outputs
    .map((o) => `- **${o.name}**：\`${o.path}\``)
    .join('\n');

  return `# Cospace Agent 任务指令

## 任务信息

- **任务名称**：${task.name}${task.description ? '\n- **任务描述**：' + task.description : ''}
- **当前阶段**：${stage.name}
- **阶段目标**：${stage.description}

---

## 你的角色与任务

${stage.agentContext}

---

## 预期输出

请将生成的内容写入以下文件：

${outputsList}

> 提示：你可以直接在对话中生成内容，由创作者手动复制到对应文件中；或者如果你所在的 Agent 环境支持文件操作，可以直接写入指定路径。

---

## 输出规范

1. 使用 Markdown 格式
2. 内容专业、简洁、有说服力
3. 关键数据需标注来源
4. 完成后告知创作者，以便在 Cospace 中标记阶段完成
`;
}
