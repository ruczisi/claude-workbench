import { useAppStore } from '../stores/appStore';

interface SidebarProps {
  onCreateTask?: () => void;
  watchedPath: string | null;
}

export default function Sidebar({ onCreateTask, watchedPath }: SidebarProps) {
  const { activeTab, setActiveTab } = useAppStore();

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

        {activeTab === 'settings' && (
          <div className="text-sm text-gray-500 italic px-2 py-4 text-center">
            设置功能开发中...
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