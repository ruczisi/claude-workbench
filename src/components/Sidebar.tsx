import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { taskManager } from '../services/taskManager';
import type { Task } from '../services/taskManager';
import {
  LLM_PRESET_MODELS,
  getDefaultBaseUrl,
  getPresetModelById,
  validateLlmConfig,
  type LlmConfig,
} from '../services/llmConfig';

interface SidebarProps {
  onCreateTask?: () => void;
  watchedPath: string | null;
  currentTask: Task | null;
  onSelectTask?: (task: Task) => void;
}

interface GlobalConfig {
  agent?: {
    type: string;
    autoStart: boolean;
    customCommand?: string;
  };
  llm?: LlmConfig;
}

export default function Sidebar({ onCreateTask, watchedPath, currentTask, onSelectTask }: SidebarProps) {
  const { activeTab, setActiveTab } = useAppStore();
  const tasks = taskManager.getAllTasks();

  // Settings state
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [testResult, setTestResult] = useState('');

  // Load config when settings tab is opened
  useEffect(() => {
    if (activeTab === 'settings') {
      loadConfig();
    }
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      const cfg = await invoke<GlobalConfig>('get_global_config');
      // Ensure llm config exists with defaults
      if (!cfg.llm) {
        const defaultModel = LLM_PRESET_MODELS[0];
        cfg.llm = {
          provider: defaultModel.provider,
          apiKey: '',
          baseUrl: defaultModel.defaultBaseUrl,
          model: defaultModel.id,
        };
      }
      setConfig(cfg);
    } catch (err) {
      console.error('Failed to load config:', err);
      // Use default config
      const defaultModel = LLM_PRESET_MODELS[0];
      setConfig({
        llm: {
          provider: defaultModel.provider,
          apiKey: '',
          baseUrl: defaultModel.defaultBaseUrl,
          model: defaultModel.id,
        },
        agent: { type: 'claude', autoStart: true },
      });
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setLoading(true);
    setSaveMessage('');
    try {
      await invoke('save_global_config', { config });
      setSaveMessage('配置已保存');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
      setSaveMessage('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const updateLlmConfig = (updates: Partial<LlmConfig>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        llm: { ...prev.llm!, ...updates },
      };
    });
  };

  const handleProviderChange = (provider: LlmConfig['provider']) => {
    const defaultUrl = getDefaultBaseUrl(provider);
    const preset = LLM_PRESET_MODELS.find((m) => m.provider === provider);
    updateLlmConfig({
      provider,
      baseUrl: defaultUrl,
      model: preset?.id || '',
    });
  };

  const handleTestConnection = async () => {
    if (!config?.llm) return;
    const validation = validateLlmConfig(config.llm);
    if (!validation.valid) {
      setTestResult(validation.errors.join('，'));
      return;
    }
    setTestResult('测试中...');
    // TODO: Implement actual API test in Phase 2
    setTimeout(() => {
      setTestResult('测试功能将在 Phase 2 实现');
    }, 500);
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'running':
        return 'text-primary-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusLabel = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'running':
        return '进行中';
      case 'error':
        return '出错';
      default:
        return '待开始';
    }
  };

  return (
    <div className="w-52 bg-gray-800 flex flex-col border-r border-gray-700">
      {/* Header */}
      <div className="p-3 border-b border-gray-700">
        <h1 className="text-sm font-semibold text-primary-400">Cospace v2</h1>
      </div>

      {/* Icon Navigation */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('workspace')}
          className={`flex-1 p-3 flex flex-col items-center justify-center ${
            activeTab === 'workspace'
              ? 'bg-gray-700 text-primary-400 border-b-2 border-primary-400'
              : 'text-gray-400 hover:bg-gray-700/50'
          }`}
          title="工作区"
        >
          <span className="text-xl">📁</span>
          <span className="text-xs mt-1">工作区</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 p-3 flex flex-col items-center justify-center ${
            activeTab === 'history'
              ? 'bg-gray-700 text-primary-400 border-b-2 border-primary-400'
              : 'text-gray-400 hover:bg-gray-700/50'
          }`}
          title="历史"
        >
          <span className="text-xl">📜</span>
          <span className="text-xs mt-1">历史</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 p-3 flex flex-col items-center justify-center ${
            activeTab === 'settings'
              ? 'bg-gray-700 text-primary-400 border-b-2 border-primary-400'
              : 'text-gray-400 hover:bg-gray-700/50'
          }`}
          title="设置"
        >
          <span className="text-xl">⚙️</span>
          <span className="text-xs mt-1">设置</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'workspace' && (
          <>
            {/* Create Task Button */}
            {onCreateTask && (
              <button
                onClick={onCreateTask}
                className="w-full text-left px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 rounded text-white"
              >
                + 创建示例任务
              </button>
            )}

            {/* Workspace path display */}
            {watchedPath && (
              <div className="mt-3">
                <div className="text-xs text-gray-500 px-1 mb-1">当前工作区:</div>
                <div className="text-xs text-gray-400 px-1 break-all bg-gray-900 p-1 rounded">
                  {watchedPath}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            <div className="text-xs text-gray-500 px-1 mb-2">任务历史</div>
            {tasks.length === 0 ? (
              <div className="text-xs text-gray-500 italic px-2 py-4 text-center">
                暂无任务历史
              </div>
            ) : (
              <div className="space-y-1">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onSelectTask?.(task)}
                    className={`w-full text-left px-2 py-2 rounded text-xs transition-colors ${
                      currentTask?.id === task.id
                        ? 'bg-primary-700 text-white'
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium truncate">{task.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className={getStatusColor(task.status)}>
                        {getStatusLabel(task.status)}
                      </span>
                      <span className="text-gray-500">
                        {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* LLM Configuration */}
            <div className="bg-gray-900 rounded p-3">
              <h3 className="text-xs font-medium text-primary-400 mb-3">🤖 LLM 配置（意图解析）</h3>

              {!config ? (
                <div className="text-xs text-gray-500 text-center py-2">加载中...</div>
              ) : (
                <div className="space-y-3">
                  {/* Provider */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">提供商（国内优先）</label>
                    <select
                      value={config.llm?.provider || 'zhipu'}
                      onChange={(e) => handleProviderChange(e.target.value as LlmConfig['provider'])}
                      className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
                    >
                      {LLM_PRESET_MODELS.map((model) => (
                        <option key={model.id} value={model.provider}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    {config.llm && (
                      <p className="text-xs text-gray-500 mt-1">
                        {getPresetModelById(config.llm.model)?.description}
                      </p>
                    )}
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">模型名称</label>
                    <input
                      type="text"
                      value={config.llm?.model || ''}
                      onChange={(e) => updateLlmConfig({ model: e.target.value })}
                      className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
                      placeholder="模型名称"
                    />
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">API Key</label>
                    <input
                      type="password"
                      value={config.llm?.apiKey || ''}
                      onChange={(e) => updateLlmConfig({ apiKey: e.target.value })}
                      className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
                      placeholder="输入 API Key"
                    />
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Base URL（可选）</label>
                    <input
                      type="text"
                      value={config.llm?.baseUrl || ''}
                      onChange={(e) => updateLlmConfig({ baseUrl: e.target.value })}
                      className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
                      placeholder={getDefaultBaseUrl(config.llm?.provider || 'zhipu')}
                    />
                  </div>

                  {/* Test Connection */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestConnection}
                      className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                    >
                      测试连接
                    </button>
                    {testResult && (
                      <span className="text-xs text-gray-400">{testResult}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Agent Tool Configuration */}
            <div className="bg-gray-900 rounded p-3">
              <h3 className="text-xs font-medium text-primary-400 mb-3">🛠️ Agent 工具配置</h3>

              {!config ? (
                <div className="text-xs text-gray-500 text-center py-2">加载中...</div>
              ) : (
                <div className="space-y-3">
                  {/* Agent Type */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">默认 Agent 工具</label>
                    <select
                      value={config.agent?.type || 'claude'}
                      onChange={(e) =>
                        setConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                agent: {
                                  ...prev.agent,
                                  type: e.target.value,
                                  autoStart: prev.agent?.autoStart ?? true,
                                },
                              }
                            : prev
                        )
                      }
                      className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
                    >
                      <option value="claude">Claude Code</option>
                      <option value="codex">Codex</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>

                  {/* Custom Command */}
                  {config.agent?.type === 'custom' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">自定义命令</label>
                      <input
                        type="text"
                        value={config.agent?.customCommand || ''}
                        onChange={(e) =>
                          setConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  agent: {
                                    ...prev.agent,
                                    type: 'custom',
                                    customCommand: e.target.value,
                                    autoStart: prev.agent?.autoStart ?? true,
                                  },
                                }
                              : prev
                          )
                        }
                        className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
                        placeholder="自定义 Agent 启动命令"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={saveConfig}
              disabled={loading || !config}
              className="w-full px-3 py-2 text-xs bg-primary-600 hover:bg-primary-700 disabled:bg-gray-700 rounded text-white"
            >
              {loading ? '保存中...' : '保存配置'}
            </button>

            {saveMessage && (
              <div className="text-xs text-center text-green-400">{saveMessage}</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-700 text-xs text-gray-500">
        v2.0.0
      </div>
    </div>
  );
}
