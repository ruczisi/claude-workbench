use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 工作流元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowMetadata {
    pub name: String,
    pub r#type: String,
    pub version: String,
    pub description: Option<String>,
}

/// 阶段输出配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageOutput {
    pub name: String,
    pub path: String,
    pub template: Option<String>,
    pub format: Option<String>,
}

/// 阶段配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub depends: Option<Vec<String>>,
    pub optional: Option<bool>,
    pub skippable: Option<bool>,
    pub outputs: Vec<StageOutput>,
    pub agent_context: String,
}

/// 工作流配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    pub metadata: WorkflowMetadata,
    pub stages: Vec<StageConfig>,
}

/// 解析工作流 Markdown 文件
fn parse_workflow(content: &str) -> Result<WorkflowConfig, String> {
    let lines: Vec<&str> = content.lines().collect();

    let mut metadata = WorkflowMetadata {
        name: String::new(),
        r#type: "proposal".to_string(),
        version: "1.0".to_string(),
        description: None,
    };

    let mut stages: Vec<StageConfig> = Vec::new();
    let mut current_stage: Option<StageConfig> = None;
    let mut in_agent_context = false;
    let mut agent_context_lines: Vec<String> = Vec::new();
    let mut in_output = false;
    let mut current_output: Option<StageOutput> = None;

    for line in &lines {
        let trimmed = line.trim();

        // 跳过空行和注释
        if trimmed.is_empty() || trimmed.starts_with("<!--") {
            continue;
        }

        // 解析标题
        if line.starts_with("# ") {
            metadata.name = line[2..].trim().to_string();
            continue;
        }

        // 解析元数据字段
        if trimmed.starts_with("- ") {
            if let Some(caps) = regex_captures(r"^- (\w+):\s*(.+)$", trimmed) {
                let key = &caps[1];
                let value = &caps[2];

                match key.as_str() {
                    "name" => metadata.name = value.to_string(),
                    "type" => metadata.r#type = value.to_string(),
                    "version" => metadata.version = value.to_string(),
                    "description" => metadata.description = Some(value.to_string()),
                    _ => {}
                }
            }
            continue;
        }

        // 解析阶段标题
        if line.starts_with("### ") {
            // 保存上一个阶段的 agent_context
            if let Some(ref mut stage) = current_stage {
                if !agent_context_lines.is_empty() {
                    stage.agent_context = agent_context_lines.join("\n");
                    agent_context_lines.clear();
                }
                stages.push(stage.clone());
            }

            // 解析阶段名称
            let stage_name = if line.contains("：") {
                line.split("：").nth(1).unwrap_or("").trim().to_string()
            } else {
                line[4..].trim().to_string()
            };

            current_stage = Some(StageConfig {
                id: String::new(),
                name: stage_name,
                description: String::new(),
                depends: None,
                optional: None,
                skippable: None,
                outputs: Vec::new(),
                agent_context: String::new(),
            });

            in_agent_context = false;
            in_output = false;
            continue;
        }

        // 解析阶段字段
        if let Some(ref mut stage) = current_stage {
            if trimmed.starts_with("- ") {
                // 检查是否是 outputs 字段
                if trimmed.starts_with("- outputs:") {
                    in_output = true;
                    in_agent_context = false;
                    continue;
                }

                // 检查是否是 agent_context 开始
                if trimmed.starts_with("- agent_context:") {
                    in_output = false;
                    in_agent_context = true;

                    // 保存最后一个 output
                    if let Some(output) = current_output.take() {
                        stage.outputs.push(output);
                    }

                    agent_context_lines.clear();
                    continue;
                }

                // 解析字段
                if let Some(caps) = regex_captures(r"^- (\w+):\s*(.+)$", trimmed) {
                    let key = &caps[1];
                    let value = &caps[2];

                    match key.as_str() {
                        "id" => stage.id = value.to_string(),
                        "name" => stage.name = value.to_string(),
                        "description" => stage.description = value.to_string(),
                        "depends" => {
                            let deps: Vec<String> = value.split(',').map(|s| s.trim().to_string()).collect();
                            stage.depends = Some(deps);
                        }
                        "optional" => stage.optional = Some(value == "true"),
                        "skippable" => stage.skippable = Some(value == "true"),
                        _ => {}
                    }
                }

                // 解析 output 字段
                if in_output {
                    if let Some(ref caps) = regex_captures(r"^- (\w+):\s*(.+)$", trimmed) {
                        let output_key = &caps[1];
                        let output_value = &caps[2];

                        if trimmed.starts_with("- name:") {
                            // 保存上一个 output
                            if let Some(output) = current_output.take() {
                                stage.outputs.push(output);
                            }

                            current_output = Some(StageOutput {
                                name: output_value.to_string(),
                                path: String::new(),
                                template: None,
                                format: None,
                            });
                        } else if let Some(ref mut output) = current_output {
                            match output_key.as_str() {
                                "path" => output.path = output_value.to_string(),
                                "template" => output.template = Some(output_value.to_string()),
                                "format" => output.format = Some(output_value.to_string()),
                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        // 收集 agent_context 内容
        if in_agent_context && current_stage.is_some() {
            if trimmed != "|" {
                agent_context_lines.push(line.to_string());
            }
        }
    }

    // 保存最后一个阶段
    if let Some(ref mut stage) = current_stage {
        if !agent_context_lines.is_empty() {
            stage.agent_context = agent_context_lines.join("\n");
        }
        if let Some(output) = current_output {
            stage.outputs.push(output);
        }
        stages.push(stage.clone());
    }

    Ok(WorkflowConfig {
        metadata,
        stages,
    })
}

/// 简单的正则捕获（不使用外部 crate）
fn regex_captures(pattern: &str, text: &str) -> Option<Vec<String>> {
    // 简化版：手动匹配常见的模式
    if pattern == r"^- (\w+):\s*(.+)$" {
        if text.starts_with("- ") {
            let rest = &text[2..];
            if let Some(pos) = rest.find(':') {
                let key = rest[..pos].trim().to_string();
                let value = rest[pos + 1..].trim().to_string();
                return Some(vec![key, value]);
            }
        }
    }
    None
}

/// 验证工作流
fn validate_workflow(workflow: &WorkflowConfig) -> Result<(), String> {
    // 验证元数据
    if workflow.metadata.name.is_empty() {
        return Err("工作流名称不能为空".to_string());
    }

    // 验证阶段
    if workflow.stages.is_empty() {
        return Err("工作流至少需要一个阶段".to_string());
    }

    let mut stage_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (index, stage) in workflow.stages.iter().enumerate() {
        if stage.id.is_empty() {
            return Err(format!("第 {} 个阶段缺少 id", index + 1));
        }

        if stage.name.is_empty() {
            return Err(format!("第 {} 个阶段缺少 name", index + 1));
        }

        if stage.description.is_empty() {
            return Err(format!("第 {} 个阶段缺少 description", index + 1));
        }

        // 验证 ID 唯一性
        if stage_ids.contains(&stage.id) {
            return Err(format!("阶段 ID '{}' 重复", stage.id));
        }
        stage_ids.insert(stage.id.clone());

        // 验证 outputs
        if stage.outputs.is_empty() {
            return Err(format!("阶段 '{}' 缺少 outputs", stage.name));
        }

        for (output_index, output) in stage.outputs.iter().enumerate() {
            if output.name.is_empty() {
                return Err(format!("阶段 '{}' 的第 {} 个 output 缺少 name",
                    stage.name, output_index + 1));
            }
            if output.path.is_empty() {
                return Err(format!("阶段 '{}' 的第 {} 个 output 缺少 path",
                    stage.name, output_index + 1));
            }
        }

        // 验证 agent_context
        if stage.agent_context.is_empty() {
            return Err(format!("阶段 '{}' 缺少 agent_context", stage.name));
        }
    }

    Ok(())
}

/// 模板渲染
fn render_template(template: &str, variables: &HashMap<String, String>) -> String {
    let mut result = template.to_string();

    for (key, value) in variables {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }

    result
}

// ==================== Tauri Commands ====================

/// 从文件加载并解析工作流
#[tauri::command]
pub fn parse_workflow_file(path: String) -> Result<WorkflowConfig, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read workflow file: {}", e))?;

    parse_workflow(&content)
}

/// 从字符串解析工作流
#[tauri::command]
pub fn parse_workflow_content(content: String) -> Result<WorkflowConfig, String> {
    parse_workflow(&content)
}

/// 验证工作流
#[tauri::command]
pub fn validate_workflow_command(workflow: WorkflowConfig) -> Result<bool, String> {
    match validate_workflow(&workflow) {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}

/// 渲染模板
#[tauri::command]
pub fn render_template_command(
    template: String,
    variables: HashMap<String, String>,
) -> String {
    render_template(&template, &variables)
}

/// 获取执行顺序（按依赖排序）
#[tauri::command]
pub fn get_execution_order(workflow: WorkflowConfig) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut visiting: std::collections::HashSet<String> = std::collections::HashSet::new();

    let stage_map: std::collections::HashMap<String, &StageConfig> = workflow
        .stages
        .iter()
        .map(|s| (s.id.clone(), s))
        .collect();

    fn visit_stage(
        stage: &StageConfig,
        stage_map: &std::collections::HashMap<String, &StageConfig>,
        visited: &mut std::collections::HashSet<String>,
        visiting: &mut std::collections::HashSet<String>,
        result: &mut Vec<String>,
    ) {
        if visited.contains(&stage.id) {
            return;
        }

        if visiting.contains(&stage.id) {
            // 循环依赖，跳过
            return;
        }

        visiting.insert(stage.id.clone());

        // 先访问依赖
        if let Some(ref deps) = stage.depends {
            for dep_id in deps {
                if let Some(dep_stage) = stage_map.get(dep_id) {
                    visit_stage(*dep_stage, stage_map, visited, visiting, result);
                }
            }
        }

        visiting.remove(&stage.id);
        visited.insert(stage.id.clone());
        result.push(stage.id.clone());
    }

    for stage in &workflow.stages {
        visit_stage(stage, &stage_map, &mut visited, &mut visiting, &mut result);
    }

    result
}
