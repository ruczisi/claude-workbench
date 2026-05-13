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
// TODO(v0.3.0): Re-enable when App.tsx integration is complete
// import { workflowManager, type SavedWorkflow } from './services/workflowManager';
// import { knowledgeBase } from './services/knowledgeBase';
import type { ChatMessageData } from './components/ChatMessage';
// import type { WorkflowConfig } from './services/workflowParser';

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
  const [agentOutput, setAgentOutput] = useState<string[]>([]);
  const [agentKeyInfos, setAgentKeyInfos] = useState<AgentKeyInfo[]>([]);

  const {
    startupPhase,
    setStartupPhase,
    setWatchedPath,
    watchedPath,
  } = useAppStore();

  // Load LLM config on mount
  useEffect(() => {
    const loadLlmConfig = async () => {
      try {
        const cfg = await invoke<{ llm?: LlmConfig }>('get_global_config');
        if (cfg.llm && cfg.llm.apiKey) {
          setLlmConfig(resolveLlmConfig(cfg.llm));
        }
      } catch {
        // Use default config
      }
    };
    loadLlmConfig();
  }, []);

  // On mount: check for saved workspace and load task history
  useEffect(() => {
    const savedPath = localStorage.getItem(STORAGE_KEY);
    if (savedPath) {
      setWatchedPath(savedPath);
      setStartupPhase('ready');
    } else {
      setStartupPhase('select-workspace');
    }
    taskManager.loadFromStorage();
  }, [setWatchedPath, setStartupPhase]);

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
    async (name: string, description?: string): Promise<Task | null> => {
      if (!watchedPath) {
        addMessage('assistant', '请先选择工作区才能创建任务。');
        return null;
      }
      try {
        const taskBasePath = await join(watchedPath, 'tasks', `task-${Date.now()}`);
        const task = await taskManager.createTaskFromWorkflow(
          name,
          STANDARD_4STAGE_WORKFLOW,
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

      await agentRunner.startAgent(currentTask, stage, agentConfig);
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

  const handleSendAgentInput = async (input: string) => {
    try {
      await agentRunner.sendInput(input);
    } catch (err) {
      console.error('[Cospace] Failed to send agent input:', err);
    }
  };

  // Select a task from history
  const handleSelectTask = (task: Task) => {
    setCurrentTask(task);
    setShowWorkbench(true);
    // Clear chat and agent state when switching tasks
    setChatMessages([]);
    setAgentOutput([]);
    setAgentKeyInfos([]);
    setAgentRunning(false);
    setAgentSession(null);
    setPendingAdvanceSuggestion(false);
    addSystemMessage(`已切换到任务「${task.name}」`);
  };

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
          <Sidebar
            onCreateTask={handleCreateDemoTask}
            watchedPath={watchedPath}
            currentTask={currentTask}
            onSelectTask={handleSelectTask}
          />

          <div className="flex-1 flex flex-col border-x border-gray-700">
            {showWorkbench && currentTask ? (
              <Workbench
                task={currentTask}
                onStartStage={handleStartStage}
                onCompleteStage={handleCompleteStage}
                chatMessages={chatMessages}
                onSendChat={handleSendChat}
                chatLoading={chatLoading}
                agentSession={agentSession}
                agentRunning={agentRunning}
                agentOutput={agentOutput}
                agentKeyInfos={agentKeyInfos}
                onStartAgent={handleStartAgent}
                onStopAgent={handleStopAgent}
                onSendAgentInput={handleSendAgentInput}
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

          <Preview task={currentTask} />
        </div>
      )}
    </div>
  );
}

export default App;
