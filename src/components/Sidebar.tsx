import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';

interface SidebarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

type NavItem = 'files' | 'projects' | 'settings';

export default function Sidebar({ theme, onToggleTheme }: SidebarProps) {
  const [activeNav, setActiveNav] = useState<NavItem>('files');
  const { watchedPath, setWatchedPath, fileEvents, clearFileEvents } = useAppStore();

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择监控文件夹',
      });

      if (selected) {
        setWatchedPath(selected);
        await invoke('start_file_watcher', { path: selected });
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const recentFiles = fileEvents.slice(0, 10);

  return (
    <div className="w-52 bg-gray-800 flex flex-col border-r border-gray-700">
      {/* Header */}
      <div className="p-3 border-b border-gray-700">
        <h1 className="text-sm font-semibold text-primary-400">Claude Workbench</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        <div className="p-2">
          <button
            onClick={() => setActiveNav('files')}
            className={`w-full text-left px-3 py-2 rounded text-sm ${
              activeNav === 'files'
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            📁 文件
          </button>
          <button
            onClick={() => setActiveNav('projects')}
            className={`w-full text-left px-3 py-2 rounded text-sm mt-1 ${
              activeNav === 'projects'
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            📂 项目
          </button>
          <button
            onClick={() => setActiveNav('settings')}
            className={`w-full text-left px-3 py-2 rounded text-sm mt-1 ${
              activeNav === 'settings'
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            ⚙️ 设置
          </button>
        </div>

        {/* Content based on active nav */}
        <div className="px-2 pb-2">
          {activeNav === 'files' && (
            <>
              <button
                onClick={handleSelectFolder}
                className="w-full text-left px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded mt-2 text-gray-300"
              >
                + 选择监控文件夹
              </button>

              {watchedPath && (
                <div className="mt-3">
                  <div className="text-xs text-gray-500 px-1 mb-1">监控路径:</div>
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

          {activeNav === 'projects' && (
            <div className="mt-2 text-sm text-gray-500 italic px-2">
              项目功能开发中...
            </div>
          )}

          {activeNav === 'settings' && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between px-2">
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
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-gray-700 text-xs text-gray-500">
        v0.1.0
      </div>
    </div>
  );
}
