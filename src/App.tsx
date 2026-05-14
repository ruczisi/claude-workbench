import { useState, useEffect, useCallback } from 'react';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from './components/Sidebar';
import Workbench from './components/Workbench';
import Preview from './components/Preview';
import { useAppStore } from './stores/appStore';
import { taskManager, type Task } from './services/taskManager';
import { STANDARD_4STAGE_WORKFLOW } from './services/embeddedWorkflow';
import { parseUserIntent } from './services/intentEngine';
import { createDefaultLlmConfig, resolveLlmConfig, type LlmConfig } from './services/llmConfig';
import { agentRunner, type AgentKeyInfo, type AgentSession } from './services/agentRunner';
import { fileWatcher } from './services/fileWatcher';
import { workflowManager, type SavedWorkflow } from './services/workflowManager';
import { knowledgeBase } from './services/knowledgeBase';
import { contextHistory } from './services/contextHistory';
import { exportTaskToMarkdown } from './services/taskExporter';
import type { ChatMessageData } from './components/ChatMessage';
import type { ContextEntry } from './services/contextHistory';
import type { WorkflowConfig } from './services/workflowParser';

const STORAGE_KEY = 'cospace-v2-workspace';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

function App() {
  const [theme] = useState<'dark' | 'light'>('dark');
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [showWorkbench, setShowWorkbench] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(createDefaultLlmConfig());

  // Agent runner state
  const [agentSession, setAgentSession] = useState<AgentSession | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<ContextEntry[]>([]);
  const [agentOutput, setAgentOutput] = useState<string[]>([]);
  const [agentKeyInfos, setAgentKeyInfos] = useState<AgentKeyInfo[]>([]);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [knowledgeBasePath, setKnowledgeBasePath] = useState<string | null>(null);
  const [kbStats, setKbStats] = useState<{ total: number }>({ total: 0 });

  // Responsive layout state
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = windowWidth < 768;
  const showPreview = windowWidth >= 1024;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const {
    startupPhase,
    setStartupPhase,
    setWatchedPath,
    watchedPath,
  } = useAppStore();

  // Load LLM config and KB config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await invoke<{
          llm?: LlmConfig;
          knowledge_base?: { root_path: string };
        }>('get_global_config');
        if (cfg.llm?.apiKey) {
          setLlmConfig(resolveLlmConfig(cfg.llm));
        }
        if (cfg.knowledge_base?.root_path) {
          knowledgeBase.setRootPath(cfg.knowledge_base.root_path);
          setKnowledgeBasePath(cfg.knowledge_base.root_path);
          setKbStats(knowledgeBase.getStats());
        }
      } catch {
        // Use default config
      }
    };
    loadConfig();
  }, []);

  // On mount: check for saved workspace and load task history
  useEffect(() => {
    const init = async () => {
      const savedPath = localStorage.getItem(STORAGE_KEY);
      if (savedPath) {
        setWatchedPath(savedPath);
        setStartupPhase('ready');
        // Load tasks from disk first (authoritative)
        try {
          const tasksDir = await join(savedPath, 'tasks');
          await taskManager.loadTasksFromDisk(tasksDir);
        } catch {
          // tasks dir may not exist yet
        }
        // Fallback to localStorage for legacy tasks
        taskManager.loadFromStorage();
      } else {
        setStartupPhase('select-workspace');
      }
    };
    init();
  }, [setWatchedPath, setStartupPhase]);

  // Scan workflows directory when watchedPath changes
  useEffect(() => {
    if (!watchedPath) return;
    const scan = async () => {
      try {
        const wfPath = await join(watchedPath, 'workflows');
        const loaded = await workflowManager.loadWorkflows(wfPath);
        setWorkflows(loaded);
      } catch {
        // No workflows dir or no workflows
      }
    };
    scan();
    // Refresh when workflow editor saves
    const handler = () => scan();
    window.addEventListener('cospace:refresh-workflows', handler);
    return () => window.removeEventListener('cospace:refresh-workflows', handler);
  }, [watchedPath]);

  const addMessage = useCallback((role: ChatMessageData['role'], content: string) => {
    setChatMessages((prev) => [...prev, { id: generateId(), role, content, timestamp: Date.now() }]);
  }, []);

  const addSystemMessage = useCallback((content: string) => {
    addMessage('system', content);
  }, [addMessage]);

  // Setup agent runner callbacks
  useEffect(() => {
    agentRunner.onOutput((data) => {
      setAgentOutput((prev) => [...prev, data]);
    });
    agentRunner.onKeyInfo((info) => {
      setAgentKeyInfos((prev) => [...prev, info]);
    });
    agentRunner.onExit((code) => {
      setAgentRunning(false);
      setAgentSession(null);
      addMessage('system', `Agent 会话已结束（退出码: ${code}）`);
    });
  }, [addMessage]);

  // Track if we've suggested auto-advance for current stage
  const [pendingAdvanceSuggestion, setPendingAdvanceSuggestion] = useState(false);

  // Setup file watcher
  useEffect(() => {
    fileWatcher.on({
      onStageOutputChanged: (stage, filePath) => {
        if (!pendingAdvanceSuggestion) {
          setPendingAdvanceSuggestion(true);
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          addMessage(
            'assistant',
            `📁 检测到阶段输出文件已更新：「${fileName}」。当前阶段「${stage.name}」是否已完成？输入"下一阶段"或"完成阶段"即可推进。`
          );
        }
      },
    });
  }, [addMessage, pendingAdvanceSuggestion]);

  // Start/stop file watcher when task changes
  useEffect(() => {
    if (currentTask) {
      fileWatcher.setTask(currentTask);
      fileWatcher.startWatching(currentTask.basePath).catch((err) => {
        console.error('[Cospace] Failed to start file watcher:', err);
      });
    } else {
      fileWatcher.stopWatching();
    }
    setPendingAdvanceSuggestion(false);
    return () => {
      fileWatcher.stopWatching();
    };
  }, [currentTask?.id, currentTask?.basePath]);

  // Create task from chat intent
  const createTaskFromIntent = useCallback(
    async (name: string, description?: string, workflow?: WorkflowConfig): Promise<Task | null> => {
      if (!watchedPath) {
        addMessage('assistant', '请先选择工作区才能创建任务。');
        return null;
      }
      try {
        const taskBasePath = await join(watchedPath, 'tasks', `task-${Date.now()}`);
        const task = await taskManager.createTaskFromWorkflow(
          name,
          workflow || STANDARD_4STAGE_WORKFLOW,
          taskBasePath,
          description
        );
        setCurrentTask(task);
        setShowWorkbench(true);
        taskManager.saveToStorage();
        return task;
      } catch (err) {
        console.error('[Cospace] Failed to create task:', err);
        addMessage('assistant', `创建任务失败: ${err}`);
        return null;
      }
    },
    [watchedPath, addMessage]
  );

  // Handle chat message
  const handleSendChat = useCallback(
    async (message: string) => {
      addMessage('user', message);
      setChatLoading(true);

      try {
        const intent = await parseUserIntent(
          message,
          {
            currentTask: currentTask || undefined,
            currentStageId: currentTask?.currentStageId,
          },
          llmConfig
        );

        switch (intent.type) {
          case 'create_task': {
            const name = intent.params?.name || message;
            const desc = intent.params?.description;
            addMessage('assistant', `正在创建任务「${name}」...`);
            const task = await createTaskFromIntent(name, desc);
            if (task) {
              addMessage(
                'assistant',
                `✅ 已创建任务「${task.name}」。当前阶段：**${task.stages[0]?.name}**。点击"开始阶段"或输入"开始阶段"来启动。`
              );
            }
            break;
          }

          case 'start_stage': {
            if (!currentTask) {
              addMessage('assistant', '没有活跃的任务，请先创建任务。');
              break;
            }
            const stageId = intent.params?.stageId || currentTask.currentStageId || currentTask.stages[0]?.id;
            if (!stageId) {
              addMessage('assistant', '无法确定要开始的阶段。');
              break;
            }
            const stage = currentTask.stages.find((s) => s.id === stageId);
            if (!stage) {
              addMessage('assistant', '找不到指定阶段。');
              break;
            }
            if (stage.status !== 'pending') {
              addMessage('assistant', `阶段「${stage.name}」已经在进行或已完成。`);
              break;
            }
            const updated = taskManager.startStage(currentTask.id, stageId);
            if (updated) {
              setCurrentTask(updated);
              taskManager.saveToStorage();
              addMessage(
                'assistant',
                `🚀 已启动阶段「${stage.name}」。切换到 "Agent 指令" 标签页复制提示词，粘贴到你的 Agent 工具执行。`
              );
            }
            break;
          }

          case 'complete_stage': {
            if (!currentTask?.currentStageId) {
              addMessage('assistant', '没有正在进行的阶段。');
              break;
            }
            const updated = await taskManager.completeStage(currentTask.id, currentTask.currentStageId);
            if (updated) {
              setCurrentTask(updated);
              taskManager.saveToStorage();
              const nextStage = updated.stages.find((s) => s.status === 'running');
              if (nextStage) {
                addMessage(
                  'assistant',
                  `✅ 阶段完成！已自动推进到「${nextStage.name}」。`
                );
              } else {
                addMessage('assistant', '🎉 所有阶段已完成！任务结束。');
              }
            }
            break;
          }

          case 'advance_stage': {
            if (!currentTask?.currentStageId) {
              addMessage('assistant', '没有正在进行的阶段，请先开始一个阶段。');
              break;
            }
            const currentStage = currentTask.stages.find((s) => s.id === currentTask.currentStageId);
            if (currentStage?.status === 'running') {
              // Complete current and advance
              const updated = await taskManager.completeStage(currentTask.id, currentTask.currentStageId);
              if (updated) {
                setCurrentTask(updated);
                taskManager.saveToStorage();
                const nextStage = updated.stages.find((s) => s.status === 'running');
                if (nextStage) {
                  addMessage(
                    'assistant',
                    `✅ 阶段完成！已自动推进到「${nextStage.name}」。`
                  );
                } else {
                  addMessage('assistant', '🎉 所有阶段已完成！任务结束。');
                }
              }
            } else if (currentStage?.status === 'pending') {
              // Just start it
              const updated = taskManager.startStage(currentTask.id, currentTask.currentStageId);
              if (updated) {
                setCurrentTask(updated);
                taskManager.saveToStorage();
                addMessage(
                  'assistant',
                  `🚀 已启动阶段「${currentStage.name}」。`
                );
              }
            }
            break;
          }

          case 'ask_question': {
            addMessage('assistant', `❓ ${intent.clarification || '能否再说具体一些？'}`);
            break;
          }

          case 'general_chat': {
            addMessage(
              'assistant',
              intent.response || '收到！有什么我可以帮你的吗？'
            );
            break;
          }

          case 'jump_stage': {
            if (!currentTask) {
              addMessage('assistant', '没有活跃的任务，请先创建任务。');
              break;
            }
            const targetStageId = intent.params?.stageId;
            if (!targetStageId) {
              addMessage('assistant', '请指定要跳转到的阶段。');
              break;
            }
            const targetStage = currentTask.stages.find((s) => s.id === targetStageId);
            if (!targetStage) {
              addMessage('assistant', '找不到指定阶段。');
              break;
            }
            const updated = taskManager.jumpToStage(currentTask.id, targetStageId);
            if (updated) {
              setCurrentTask(updated);
              taskManager.saveToStorage();
              addMessage(
                'assistant',
                `⏭️ 已跳转到阶段「${targetStage.name}」。当前阶段：**${targetStage.name}**。`
              );
            }
            break;
          }

          case 'search_knowledge': {
            if (!currentTask) {
              addMessage('assistant', '没有活跃的任务，请先创建任务。');
              break;
            }
            const results = await knowledgeBase.searchForTask(currentTask);
            if (results.length === 0) {
              addMessage('assistant', '未在知识库中找到相关文档。');
            } else {
              const list = results.map((r) => `- ${r.title} (${r.type})`).join('\n');
              addMessage('assistant', `📚 知识库检索结果：\n${list}`);
            }
            break;
          }
        }
      } catch (err) {
        console.error('[Cospace] Chat handling error:', err);
        addMessage('assistant', '抱歉，处理请求时出了点问题，请再试一次。');
      } finally {
        setChatLoading(false);
      }
    },
    [currentTask, llmConfig, addMessage, createTaskFromIntent]
  );

  // Stage management callbacks
  const handleStartStage = (stageId: string) => {
    if (!currentTask) return;
    const updated = taskManager.startStage(currentTask.id, stageId);
    if (updated) {
      setCurrentTask(updated);
      taskManager.saveToStorage();
    }
  };

  const handleCompleteStage = async (stageId: string) => {
    if (!currentTask) return;
    const updated = await taskManager.completeStage(currentTask.id, stageId);
    if (updated) {
      setCurrentTask(updated);
      taskManager.saveToStorage();
      setPendingAdvanceSuggestion(false);

      // Auto-prepare next stage prompt
      const nextStage = updated.stages.find((s) => s.status === 'running');
      if (nextStage) {
        addMessage(
          'assistant',
          `✅ 阶段完成！已自动推进到「${nextStage.name}」。\n\n**下一阶段提示词已就绪**，切换到 "Agent 运行" 标签页启动 Agent 即可自动注入。`
        );
      } else {
        addMessage('assistant', '🎉 所有阶段已完成！任务结束。');
      }
    }
  };

  // Agent runner handlers
  const handleStartAgent = async () => {
    if (!currentTask?.currentStageId) {
      addMessage('assistant', '没有正在进行的阶段，请先开始一个阶段。');
      return;
    }
    const stage = currentTask.stages.find((s) => s.id === currentTask.currentStageId);
    if (!stage) return;

    // Get agent config from settings
    try {
      const cfg = await invoke<{ agent?: { type: string; customCommand?: string } }>('get_global_config');
      const agentConfig = {
        type: (cfg.agent?.type || 'claude') as 'claude' | 'codex' | 'custom',
        customCommand: cfg.agent?.customCommand,
      };

      setAgentOutput([]);
      setAgentKeyInfos([]);
      setAgentRunning(true);
      addMessage('system', `正在启动 Agent（${agentConfig.type}）...`);

      const kbResults = await knowledgeBase.searchForTask(currentTask);
      await agentRunner.startAgent(currentTask, stage, agentConfig, kbResults);
      setAgentSession(agentRunner.session);
      addMessage('system', 'Agent 已启动，正在执行任务...');
    } catch (err) {
      console.error('[Cospace] Failed to start agent:', err);
      setAgentRunning(false);
      addMessage('assistant', `启动 Agent 失败: ${err}`);
    }
  };

  const handleStopAgent = async () => {
    await agentRunner.stopAgent();
    setAgentRunning(false);
    setAgentSession(null);
    addMessage('system', 'Agent 已停止');
  };

  const handlePauseAgent = async () => {
    try {
      await agentRunner.pauseAgent();
      setAgentRunning(false);
      setAgentSession(null);
      addMessage('system', 'Agent 已暂停，可随时恢复');
    } catch (err) {
      console.error('[Cospace] Failed to pause agent:', err);
    }
  };

  const handleResumeAgent = async () => {
    try {
      await agentRunner.resumeAgent();
      setAgentRunning(true);
      setAgentSession(agentRunner.session);
      addMessage('system', 'Agent 已恢复');
    } catch (err) {
      console.error('[Cospace] Failed to resume agent:', err);
      addMessage('assistant', `恢复 Agent 失败: ${err}`);
    }
  };

  const handleSendAgentInput = async (input: string) => {
    try {
      await agentRunner.sendInput(input);
    } catch (err) {
      console.error('[Cospace] Failed to send agent input:', err);
    }
  };

  const handleExportTask = async () => {
    if (!currentTask) return;
    try {
      const result = await exportTaskToMarkdown(currentTask);
      addMessage('system', `任务已导出: ${result.path} (${result.stageCount} 个阶段, ${result.fileCount} 个文件)`);
    } catch (err) {
      console.error('[Cospace] Failed to export task:', err);
      addMessage('system', `导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Delete a task
  const handleDeleteTask = useCallback(
    (taskId: string) => {
      const isCurrent = currentTask?.id === taskId;
      taskManager.deleteTask(taskId);
      taskManager.saveToStorage();
      if (isCurrent) {
        setCurrentTask(null);
        setShowWorkbench(false);
      }
    },
    [currentTask]
  );

  // Select a task from history
  const handleSelectTask = useCallback(async (task: Task) => {
    setCurrentTask(task);
    setShowWorkbench(true);
    // Clear chat and agent state when switching tasks
    setChatMessages([]);
    setAgentOutput([]);
    setAgentKeyInfos([]);
    setAgentRunning(false);
    setAgentSession(null);
    setPendingAdvanceSuggestion(false);
    // Load context history
    try {
      const history = await contextHistory.load(task.basePath);
      setHistoryEntries(history);
      if (history.length > 0) {
        const msgs: ChatMessageData[] = history.map((entry) => ({
          id: generateId(),
          role: entry.role === 'user' ? 'user' : entry.role === 'system' ? 'system' : 'assistant',
          content: entry.content,
          timestamp: new Date(entry.timestamp).getTime(),
        }));
        setChatMessages(msgs);
      }
    } catch {
      setHistoryEntries([]);
    }
    addSystemMessage(`已切换到任务「${task.name}」`);
  }, [addSystemMessage]);

  // Keyboard shortcuts: Ctrl+1/2/3 to switch tasks
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const idx = parseInt(e.key, 10);
      if (isNaN(idx) || idx < 1 || idx > 3) return;
      const tasks = taskManager.getAllTasks();
      const task = tasks[idx - 1];
      if (task) {
        e.preventDefault();
        handleSelectTask(task);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSelectTask]);

  // Handle workspace selection
  const handleWorkspaceSelected = (path: string) => {
    localStorage.setItem(STORAGE_KEY, path);
    setWatchedPath(path);
    setStartupPhase('ready');
  };

  // Select workspace folder
  const handleSelectWorkspace = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择工作区文件夹',
      });
      if (selected) {
        handleWorkspaceSelected(selected);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  // Create demo task
  const handleCreateDemoTask = async () => {
    if (!watchedPath) {
      alert('请先选择工作区');
      return;
    }
    try {
      const taskBasePath = await join(watchedPath, 'tasks', 'demo-task');
      const task = await taskManager.createTaskFromWorkflow(
        '贵港供销社方案',
        STANDARD_4STAGE_WORKFLOW,
        taskBasePath,
        '贵港供销社南北大通道合作方案'
      );
      setCurrentTask(task);
      setShowWorkbench(true);
      setChatMessages([]);
      addSystemMessage('已创建任务「贵港供销社方案」');
      taskManager.saveToStorage();
    } catch (err) {
      console.error('[Cospace] Failed to create demo task:', err);
      alert(`创建任务失败: ${err}`);
    }
  };

  // Select knowledge base directory
  const handleSelectKnowledgeBase = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择知识库根目录',
      });
      if (selected) {
        knowledgeBase.setRootPath(selected);
        setKnowledgeBasePath(selected);
        setKbStats(knowledgeBase.getStats());
        const cfg = await invoke<Record<string, unknown>>('get_global_config');
        await invoke('save_global_config', {
          config: {
            ...cfg,
            knowledge_base: {
              root_path: selected,
              concepts_dir: '20-Wiki/Concepts',
              projects_dir: '20-Wiki/Projects',
              auto_inject: true,
              max_results: 10,
            },
          },
        });
      }
    } catch (err) {
      console.error('[Cospace] KB config save error:', err);
    }
  }, []);

  // Use a custom workflow to create a task
  const handleUseWorkflow = useCallback(
    async (workflow: WorkflowConfig) => {
      if (!watchedPath) {
        addMessage('assistant', '请先选择工作区才能创建任务。');
        return;
      }
      addMessage('assistant', `正在使用工作流「${workflow.name}」创建任务...`);
      const task = await createTaskFromIntent(workflow.name, workflow.description, workflow);
      if (task) {
        addMessage('assistant', `✅ 已使用工作流「${task.name}」创建任务。`);
      }
    },
    [watchedPath, addMessage, createTaskFromIntent]
  );

  return (
    <div className={`${theme} h-full flex flex-col bg-gray-900 text-gray-100`}>
      {/* Startup overlay */}
      {startupPhase === 'select-workspace' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-primary-400 mb-4">Cospace v2.0</h1>
            <p className="text-gray-400 mb-6">Agent 驱动的工作台</p>
            <button
              onClick={handleSelectWorkspace}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded text-white"
            >
              选择工作区
            </button>
          </div>
        </div>
      )}

      {/* Main app content */}
      {startupPhase === 'ready' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Mobile sidebar toggle */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="absolute top-2 left-2 z-50 p-2 bg-gray-800 rounded text-gray-300 hover:text-white"
              title={sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'}
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
          )}

          {/* Sidebar */}
          {(!isMobile || sidebarOpen) && (
            <div className={`${isMobile ? 'absolute z-40 h-full' : ''} flex-shrink-0`}>
              <Sidebar
                onCreateTask={handleCreateDemoTask}
                watchedPath={watchedPath}
                currentTask={currentTask}
                onSelectTask={handleSelectTask}
                onDeleteTask={handleDeleteTask}
                workflows={workflows}
                onUseWorkflow={handleUseWorkflow}
                knowledgeBasePath={knowledgeBasePath}
                kbStats={kbStats}
                onSelectKnowledgeBase={handleSelectKnowledgeBase}
              />
            </div>
          )}

          <div className="flex-1 flex flex-col border-x border-gray-700 min-w-0">
            {showWorkbench && currentTask ? (
              <Workbench
                task={currentTask}
                onStartStage={handleStartStage}
                onCompleteStage={handleCompleteStage}
                onJumpStage={(stageId) => {
                  if (!currentTask) return;
                  const updated = taskManager.jumpToStage(currentTask.id, stageId);
                  if (updated) {
                    setCurrentTask(updated);
                    taskManager.saveToStorage();
                    addMessage('system', `已跳转到阶段「${updated.stages.find((s) => s.id === stageId)?.name}」`);
                  }
                }}
                chatMessages={chatMessages}
                onSendChat={handleSendChat}
                chatLoading={chatLoading}
                agentSession={agentSession}
                agentRunning={agentRunning}
                agentOutput={agentOutput}
                agentKeyInfos={agentKeyInfos}
                onStartAgent={handleStartAgent}
                onStopAgent={handleStopAgent}
                onPauseAgent={handlePauseAgent}
                onResumeAgent={handleResumeAgent}
                canResumeAgent={agentRunner.canResume}
                onSendAgentInput={handleSendAgentInput}
                historyEntries={historyEntries}
                onExportTask={handleExportTask}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p className="mb-4">点击侧边栏"+ 创建示例任务"开始</p>
                  {!watchedPath && (
                    <button
                      onClick={handleSelectWorkspace}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                    >
                      选择工作区
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {showPreview && <Preview task={currentTask} />}
        </div>
      )}
    </div>
  );
}

export default App;
