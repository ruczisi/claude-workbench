# Cospace v2.0

> Agent 驱动的可视化工作台。基于多阶段工作流，让方案撰写从混沌到有序。

## 当前版本

**v0.7.0** — 核心功能闭环，支持自定义工作流、内置 Agent 直接调用 LLM API、任务历史与设置面板。

## 功能特性

### 启动向导
- **工作区选择** — 启动时选择本地文件夹作为工作区，自动记忆
- **Agent 工具确认** — 启动时列出可用 Agent 工具（内置 LLM / Claude Code / Codex / 自定义），用户确认后加载

### 工作区与任务
- **VSCode 风格侧边栏** — 左侧 Activity Bar + 可折叠 Panel，支持工作区、历史、工作流、设置四个标签
- **新建任务** — 绑定工作流创建任务，自定义任务名称和描述，自动在 `tasks/` 下生成目录结构
- **任务历史** — 展示所有任务列表，支持快捷键切换（Ctrl+1/2/3），支持删除任务
- **标准四阶段工作流** — 需求确认 → 框架构思 → 内容撰写 → 审核定稿（内置默认）

### 工作流管理
- **自定义工作流创建** — 在侧边栏「工作流」面板点击「新建工作流」，定义阶段、输出文件、Agent 上下文
- **工作流编辑** — 编辑已有工作流的名称、描述、阶段配置、输出文件路径、Agent 上下文
- **工作流使用** — 创建任务时选择已有工作流，或在没有自定义工作流时回退到默认四阶段工作流

### Agent 执行
- **多模式 Agent 支持** —
  - 内置 LLM：直接调用 OpenAI 兼容 API（智谱 / OpenAI / DeepSeek 等）
  - Claude Code：通过 PTY 启动外部 CLI
  - Codex：通过 PTY 启动外部 CLI
  - 自定义：支持配置自定义启动命令
- **Agent 会话管理** — 启动、暂停、恢复、停止 Agent 会话
- **对话式交互** — 与运行中的 Agent 实时对话，发送追加指令
- **意图解析** — 通过 LLM 解析用户聊天输入的意图（创建任务、开始阶段等）

### 设置面板
- **LLM 配置** — 选择提供商、配置模型名称、API Key、Base URL，支持连接测试
- **Agent 工具配置** — 切换默认 Agent 类型，配置自定义命令
- **知识库配置** — 选择知识库根目录，统计文档数量

### 阶段与输出
- **阶段进度可视化** — 顶部进度条展示当前任务各阶段状态
- **阶段输出预览** — 右侧 Preview 面板展示当前阶段的 Markdown 输出文档
- **阶段跳转** — 支持在工作流阶段间导航

## 任务目录结构

```
你的工作区/
├── tasks/
│   └── your-task/
│       ├── 00-阶段1-需求确认/
│       ├── 00-阶段2-框架构思/
│       ├── 00-阶段3-内容撰写/
│       └── 00-阶段4-审核定稿/
├── workflows/
│   └── your-workflow.md
└── .cospace/
    └── config.json
```

## 技术栈

- **Tauri 2.x** — 轻量桌面框架（Rust + Webview）
- **React 19 + TypeScript** — 前端
- **TailwindCSS** — 样式
- **Zustand** — 状态管理
- **Rust** — 后端命令（目录创建、文件读写、配置管理、PTY 会话）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 生产构建
npm run tauri build
```

## 开发脚本

```bash
npm run dev        # Vite 前端开发
npm run build      # TypeScript 编译 + Vite 构建
npm run tauri dev  # Tauri 开发模式
npm run tauri build # Tauri 生产构建
npm test           # 运行测试
```

## 许可证

MIT
