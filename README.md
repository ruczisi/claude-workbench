# Cospace

> 一个集成 AI Agent 的可视化工作台，让 AI 助手与内容预览无缝衔接。

## 功能特性

- **AI Agent 集成** — 支持 Claude Code / Codex / OpenCode，自动检测 PATH 中的 Agent 并启动
- **终端模拟** — xterm.js 驱动的终端，Agent 输出实时显示
- **工作区管理** — 选择文件夹作为工作区，自动启动文件监听
- **内容预览** — Markdown、HTML、图片、PDF、视频直接预览
- **Team 状态监控** — 任务进度和异常告警一目了然
- **VS Code 风格布局** — 左导航 + 中终端 + 右预览，高效协同
- **多主题支持** — 深色/浅色主题切换

## 快速开始

### 安装

下载并运行安装程序：
- [MSI 安装包](./src-tauri/target/release/bundle/msi/Cospace_0.1.0_x64_en-US.msi)
- [NSIS 安装程序](./src-tauri/target/release/bundle/nsis/Cospace_0.1.0_x64-setup.exe)

或直接运行可执行文件：
```
src-tauri\target\release\cospace.exe
```

### 使用

1. **启动应用** — 运行 cospace.exe
2. **选择工作区** — 点击侧边栏"选择工作区"，选择项目文件夹
3. **配置 Agent** — 在设置中选择 Agent 类型（Claude/Codex/OpenCode/自定义）
4. **开启自动启动** — 打开"选择工作区后自动启动"开关
5. **开始工作** — 每次选择工作区后，Agent 会自动启动

### 环境要求

- Windows 10/11 (x64)
- 需要在系统 PATH 中有对应的 AI Agent 命令（claude / codex / opencode）

## 技术栈

- **Tauri 2.x** — 轻量、安全的桌面框架
- **React 19 + TypeScript** — 前端框架
- **TailwindCSS** — 样式解决方案
- **xterm.js** — 终端模拟器
- **Rust + portable-pty** — Agent 进程管理

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 生产构建
npm run tauri build
```

## 文档

- [Agent 集成设计](./docs/superpowers/specs/2026-05-08-cospace-agent-integration-design.md)
- [实现计划](./docs/superpowers/plans/2026-05-08-cospace-agent-integration-plan.md)

## 许可证

MIT