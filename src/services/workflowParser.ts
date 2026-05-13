// Workflow parser for standard-4stage.md format
// Format:
// # 工作流名称
// ## 阶段定义
// ### 阶段1：需求确认
// - id: demand
// - name: 需求确认
// - description: ...
// - depends: previous_stage_id (optional)
// - outputs:
//     - name: 输出名
//       path: 01-输出名/file.md
// - agent_context: |
//     context content...

export interface WorkflowStage {
  id: string;
  name: string;
  description: string;
  depends?: string;
  outputs: Array<{ name: string; path: string }>;
  agentContext: string;
}

export interface WorkflowConfig {
  name: string;
  description?: string;
  stages: WorkflowStage[];
}

export function parseWorkflowContent(content: string): WorkflowConfig {
  const lines = content.split('\n');
  const config: WorkflowConfig = { name: '', stages: [] };
  let currentStage: WorkflowStage | null = null;
  let inAgentContext = false;
  let agentContextLines: string[] = [];
  let inOutputsSection = false;

  for (const line of lines) {
    // Extract workflow name from first # heading
    if (line.startsWith('# ') && config.name === '') {
      config.name = line.substring(2).trim();
      continue;
    }

    // Skip metadata section (## 元数据, ## 阶段定义, etc.)
    if (line.startsWith('## ')) {
      continue;
    }

    // Stage header: ### 阶段1：调研 or ### 需求确认
    const stageMatch = line.match(/^###\s+阶段?\d+[：:]\s*(.+)/);
    if (stageMatch) {
      if (currentStage) {
        currentStage.agentContext = agentContextLines.join('\n').trim();
        config.stages.push(currentStage);
      }
      currentStage = {
        id: '',
        name: stageMatch[1].trim(),
        description: '',
        outputs: [],
        agentContext: ''
      };
      agentContextLines = [];
      inAgentContext = false;
      inOutputsSection = false;
      continue;
    }

    if (!currentStage) continue;

    // outputs section start
    if (line.match(/^\s*-\s*outputs:\s*$/)) {
      inOutputsSection = true;
      continue;
    }

    // depends field
    const dependsMatch = line.match(/^\s*-\s*depends:\s*(.+)/);
    if (dependsMatch) {
      currentStage.depends = dependsMatch[1].trim();
      continue;
    }

    // id field
    const idMatch = line.match(/^\s*-\s*id:\s*(.+)/);
    if (idMatch) {
      currentStage.id = idMatch[1].trim();
      continue;
    }

    // name field (for stage or output)
    const nameMatch = line.match(/^\s*-\s*name:\s*(.+)/);
    if (nameMatch) {
      if (inOutputsSection && currentStage) {
        // This is an output name
        currentStage.outputs.push({ name: nameMatch[1].trim(), path: '' });
      }
      continue;
    }

    // path field (for output)
    const pathMatch = line.match(/^\s*path:\s*(.+)/);
    if (pathMatch && inOutputsSection && currentStage.outputs.length > 0) {
      currentStage.outputs[currentStage.outputs.length - 1].path = pathMatch[1].trim();
      continue;
    }

    // agent_context start
    const agentContextMatch = line.match(/^\s*-\s*agent_context:\s*\|?\s*$/);
    if (agentContextMatch) {
      inAgentContext = true;
      inOutputsSection = false;
      continue;
    }

    // agent_context content
    if (inAgentContext) {
      if (line.startsWith('    ')) {
        // Continuation line (4 spaces indent)
        agentContextLines.push(line.substring(4));
      } else if (line.trim() === '' && agentContextLines.length > 0) {
        // Empty line within agent context
        agentContextLines.push('');
      } else if (agentContextLines.length > 0 && line.match(/^\s+\S/)) {
        // Still in agent context (indented content)
        agentContextLines.push(line.trim());
      } else if (agentContextLines.length > 0) {
        // Agent context ended
        inAgentContext = false;
      }
    }
  }

  // Push last stage
  if (currentStage) {
    currentStage.agentContext = agentContextLines.join('\n').trim();
    config.stages.push(currentStage);
  }

  return config;
}

export function validateWorkflow(config: WorkflowConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.name) {
    errors.push('Missing workflow name');
  }

  if (config.stages.length === 0) {
    errors.push('No stages defined');
  }

  for (const stage of config.stages) {
    if (!stage.id) errors.push(`Stage "${stage.name}" missing id`);
    if (!stage.name) errors.push(`Stage missing name`);
  }

  return { valid: errors.length === 0, errors };
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}