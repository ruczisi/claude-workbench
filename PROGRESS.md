# Cospace v2.0 进度记录

> 最后更新：2026-05-13  
> 当前版本：v0.2.0-alpha

---

## 已完成

- [x] 版本号统一升级到 0.2.0（package.json / Cargo.toml / tauri.conf.json）
- [x] README.md 重写，反映 v2.0 alpha 实际状态
- [x] Workbench 组件：四阶段进度可视化（需求确认 → 框架构思 → 内容撰写 → 审核定稿）
- [x] 内嵌标准工作流 `embeddedWorkflow.ts`，摆脱外部文件依赖
- [x] TaskManager 支持 `createTaskFromWorkflow`（直接传入配置对象）
- [x] 工作区选择 + 示例任务创建已跑通
- [x] 目录创建走 Rust `ensure_directory_command`，绕过前端 FS 权限限制
- [x] TypeScript 编译零错误
- [x] Release exe 可正常构建和启动
- [x] .gitignore 更新，排除 screenshot、AI 临时文件等

## 待实现（下次继续）

- [x] 阶段交互推进（开始 / 完成 / 跳转到下一阶段）
- [x] 阶段输出文档自动生成（写入 Markdown 到对应子目录）
- [x] Preview 面板内容预览（文件列表 + Markdown 渲染）
- [ ] Agent 上下文实际运行（调用 AI 生成阶段内容）
- [ ] 设置面板功能实现
- [ ] 自定义 workflow 加载 / 编辑
- [ ] 任务历史列表

## 关键信息

| 项目 | 路径 / 值 |
|------|-----------|
| 可执行文件 | `E:\cospace\src-tauri\target\release\cospace.exe` |
| 任务目录模板 | `{watchedPath}/tasks/demo-task/00-阶段N-阶段名/` |
| 当前分支 | `main` |
| 远程仓库 | `https://github.com/ruczisi/cospace.git` |
| Git 用户 | ruczisi / ruczisi@vip.qq.com |

## 遗留问题

- NSIS 打包因网络下载超时失败，不影响 exe 本身使用
- `get_resource_path` 已废弃，workflow 全部内嵌到代码中
- `STORAGE_KEY` 已改为 `cospace-v2-workspace`，旧缓存不再干扰
