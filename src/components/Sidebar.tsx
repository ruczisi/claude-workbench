import { useAppStore } from '../stores/appStore';
import { taskManager } from '../services/taskManager';
import type { Task } from '../services/taskManager';

interface SidebarProps {
  onCreateTask?: () => void;
  watchedPath: string | null;
  currentTask: Task | null;
  onSelectTask?: (task: Task) => void;
}

export default function Sidebar({ onCreateTask, watchedPath, currentTask, onSelectTask }: SidebarProps) {
  const { activeTab, setActiveTab } = useAppStore();
  const tasks = taskManager.getAllTasks();

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
