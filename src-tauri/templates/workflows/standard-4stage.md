# 标准方案工作流（4阶段）

## 元数据
- name: 标准方案
- type: proposal
- version: 1.0
- description: 面向企业合作的方案工作流

## 阶段定义

### 阶段1：需求确认
- id: demand
- name: 需求确认
- description: 明确客户核心诉求和项目边界
- outputs:
    - name: 需求确认清单
      path: 01-需求确认/demand-checklist.md
      template: templates/demand-checklist.md
- agent_context: |
    当前阶段：需求确认
    任务：与客户确认项目需求
    
    你需要帮我：
    1. 梳理客户的核心诉求
    2. 明确项目边界和交付物
    3. 识别潜在风险和注意事项
    4. 产出需求确认清单
    
    可用工具：
    - /template demand-checklist - 引用需求确认清单模板

### 阶段2：框架构思
- id: framework
- name: 框架构思
- description: 确定方案整体结构和逻辑
- depends: demand
- outputs:
    - name: 方案框架
      path: 02-框架构思/framework.md
- agent_context: |
    当前阶段：框架构思
    上一阶段产出：01-需求确认/demand-checklist.md
    
    任务：基于需求确认清单，构思方案的整体框架
    
    你需要帮我：
    1. 分析需求，提取关键要点
    2. 设计方案的整体结构
    3. 确定各部分的逻辑关系
    4. 产出方案框架文档
    
    可用工具：
    - /template framework - 引用框架模板
    - /search 案例 - 搜索相关案例

### 阶段3：内容撰写
- id: draft
- name: 内容撰写
- description: 完成方案正文内容
- depends: framework
- outputs:
    - name: 方案初稿
      path: 03-内容撰写/draft.md
- agent_context: |
    当前阶段：内容撰写
    上一阶段产出：02-框架构思/framework.md
    
    任务：基于方案框架，撰写方案正文
    
    你需要帮我：
    1. 按照框架结构撰写各部分内容
    2. 引用数据和案例支撑论点
    3. 确保逻辑连贯、表达清晰
    4. 产出方案初稿
    
    可用工具：
    - /data 读取数据文件
    - /search 搜索参考资料

### 阶段4：审核定稿
- id: review
- name: 审核定稿
- description: 检查内容、格式，输出最终版本
- depends: draft
- outputs:
    - name: 最终方案
      path: 04-审核定稿/final.docx
      format: docx
- agent_context: |
    当前阶段：审核定稿
    上一阶段产出：03-内容撰写/draft.md
    
    任务：审核方案初稿，输出最终版本
    
    你需要帮我：
    1. 检查内容完整性和准确性
    2. 优化表达和格式
    3. 转换为最终交付格式
    4. 产出最终方案文档
    
    可用工具：
    - /skill export-docx - 导出 Word 文档
