import { useAppStore } from '../stores/appStore';

export default function StatusBar() {
  const {
    teamTasks,
    isTeamPanelExpanded,
    setTeamPanelExpanded,
    watchedPath,
    fileEvents,
  } = useAppStore();

  const completedTasks = teamTasks.filter((t) => t.status === 'completed').length;
  const totalTasks = teamTasks.length;
  const errorTasks = teamTasks.filter((t) => t.status === 'error').length;

  const getFileChangeCount = () => {
    const today = new Date().toDateString();
    return fileEvents.filter(
      (e) => new Date(e.timestamp || 0).toDateString() === today
    ).length;
  };

  return (
    <div className="bg-gray-800 border-t border-gray-700">
      {/* Expandable Team Panel */}
      {isTeamPanelExpanded && (
        <div className="p-3 bg-gray-900 border-b border-gray-700 max-h-64 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Team 任务详情</h3>
          {teamTasks.length === 0 ? (
            <div className="text-sm text-gray-500 italic">
              暂无任务运行。输入 <span className="text-primary-400">claude code</span> 开始使用。
            </div>
          ) : (
            <div className="space-y-1">
              {teamTasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-2 rounded text-sm ${
                    task.status === 'error'
                      ? 'bg-red-900/30 border border-red-800'
                      : task.status === 'completed'
                      ? 'bg-green-900/30 border border-green-800'
                      : 'bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">
                      {task.status === 'completed' && '✅ '}
                      {task.status === 'error' && '⚠️ '}
                      {task.name}
                    </span>
                    <span
                      className={`text-xs ${
                        task.status === 'completed'
                          ? 'text-green-400'
                          : task.status === 'error'
                          ? 'text-red-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {task.status === 'completed'
                        ? '完成'
                        : task.status === 'error'
                        ? '异常'
                        : `${Math.round(task.progress)}%`}
                    </span>
                  </div>
                  {task.status !== 'completed' && task.status !== 'error' && (
                    <div className="mt-1">
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-primary-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {task.message && (
                    <div className="mt-1 text-xs text-gray-500">{task.message}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status Bar */}
      <div className="h-8 px-3 flex items-center justify-between text-xs">
        {/* Left side */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setTeamPanelExpanded(!isTeamPanelExpanded)}
            className={`flex items-center space-x-1 hover:text-gray-300 ${
              isTeamPanelExpanded ? 'text-primary-400' : 'text-gray-400'
            }`}
          >
            <span>Team</span>
            {totalTasks > 0 && (
              <>
                <span className="text-gray-600">|</span>
                <span>
                  [{completedTasks}/{totalTasks}]
                </span>
                {errorTasks > 0 && <span className="text-red-400">⚠️ {errorTasks}</span>}
              </>
            )}
          </button>

          <div className="text-gray-500">|</div>

          {watchedPath && (
            <div className="flex items-center space-x-1 text-gray-400">
              <span>👁️</span>
              <span className="truncate max-w-48">{watchedPath}</span>
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-4 text-gray-500">
          {fileEvents.length > 0 && (
            <span>今日文件变更: {getFileChangeCount()}</span>
          )}
          <span>Cospace v0.1.0</span>
        </div>
      </div>
    </div>
  );
}
