import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, AgentType } from '../stores/appStore';
import { startAgent, stopAgent, findAgentInPath } from '../services/agentService';

interface SidebarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function Sidebar({ theme, onToggleTheme }: SidebarProps) {
  const {
    watchedPath,
    setWatchedPath,
    fileEvents,
    clearFileEvents,
    activeTab,
    setActiveTab,
    activeAgent,
    setActiveAgent,
    autoStartAgent,
    setAutoStartAgent,
  } = useAppStore();

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择工作区文件夹',
      });

      if (selected) {
        setWatchedPath(selected);
        await invoke('start_file_watcher', { path: selected });
        // 如果开启了自动启动，启动 Agent
        if (autoStartAgent) {
          console.log('[Cospace] autoStartAgent enabled, finding agent:', activeAgent);
          const agentPath = await findAgentInPath(activeAgent);
          console.log('[Cospace] agentPath found:', agentPath);
          if (agentPath) {
            console.log('[Cospace] stopping shell before starting agent:', agentPath);
            try {
              await stopAgent(); // Kill shell first
              console.log('[Cospace] shell stopped, starting agent:', agentPath);
              await startAgent({
                agent_type: activeAgent,
                command: agentPath,
                args: [],
                cwd: selected,
              });
              useAppStore.getState().setAgentPath(agentPath);
              useAppStore.getState().setAgentStatus('running');
              console.log('[Cospace] agent started successfully');
            } catch (err) {
              console.error('[Cospace] startAgent error:', err);
            }
          } else {
            console.warn('[Cospace] agent not found in path, activeAgent:', activeAgent);
          }
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const recentFiles = fileEvents.slice(0, 10);

  const agentOptions: { value: AgentType; label: string; icon: string }[] = [
    { value: 'claude', label: 'Claude Code', icon: '🤖' },
    { value: 'codex', label: 'Codex (ChatGPT)', icon: '💬' },
    { value: 'custom', label: '自定义', icon: '⚡' },
  ];

  return (
    <div className="w-52 bg-gray-800 flex flex-col border-r border-gray-700">
      {/* Header */}
      <div className="p-3 border-b border-gray-700">
        <h1 className="text-sm font-semibold text-primary-400">Cospace</h1>
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
          title="对话历史"
        >
          <span className="text-xl">💬</span>
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
            <button
              onClick={handleSelectFolder}
              className="w-full text-left px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              + 选择工作区
            </button>

            {watchedPath && (
              <div className="mt-3">
                <div className="text-xs text-gray-500 px-1 mb-1">当前工作区:</div>
                <div className="text-xs text-gray-400 px-1 break-all bg-gray-900 p-1 rounded">
                  {watchedPath}
                </div>
              </div>
            )}

            {recentFiles.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs text-gray-500">最近更改</span>
                  <button
                    onClick={clearFileEvents}
                    className="text-xs text-gray-500 hover:text-gray-400"
                  >
                    清空
                  </button>
                </div>
                {recentFiles.map((file, idx) => (
                  <div
                    key={`${file.path}-${idx}`}
                    className="text-xs text-gray-400 px-1 py-1 truncate bg-gray-900 rounded mt-1"
                    title={file.path}
                  >
                    {file.event_type === 'create' && '🆕 '}
                    {file.event_type === 'modify' && '📝 '}
                    {file.event_type === 'remove' && '❌ '}
                    {file.path.split(/[/\\]/).pop()}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className="text-sm text-gray-500 italic px-2 py-4 text-center">
            对话历史功能开发中...
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-3 py-2">
            {/* Agent Selection */}
            <div>
              <div className="text-xs text-gray-500 px-1 mb-1">AI Agent</div>
              <div className="space-y-1">
                {agentOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setActiveAgent(opt.value)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${
                      activeAgent === opt.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Start */}
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-300">选择工作区后自动启动</span>
              <button
                onClick={() => setAutoStartAgent(!autoStartAgent)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  autoStartAgent ? 'bg-primary-600' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transform transition-transform ${
                    autoStartAgent ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between px-1 pt-2 border-t border-gray-700">
              <span className="text-sm text-gray-300">深色主题</span>
              <button
                onClick={onToggleTheme}
                className={`w-10 h-5 rounded-full transition-colors ${
                  theme === 'dark' ? 'bg-primary-600' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transform transition-transform ${
                    theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-700 text-xs text-gray-500">
        v0.1.0
      </div>
    </div>
  );
}
