import type { Task } from '../services/taskManager';

interface WorkbenchProps {
  task: Task;
  onStartStage?: (stageId: string) => void;
  onCompleteStage?: (stageId: string) => void;
}

export default function Workbench({ task, onStartStage, onCompleteStage }: WorkbenchProps) {
  const currentStage = task.currentStageId
    ? task.stages.find((s) => s.id === task.currentStageId)
    : undefined;

  const isTaskCompleted = task.status === 'completed';

  return (
    <div className="flex-1 flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-primary-400">{task.name}</h1>
            {task.description && (
              <p className="text-sm text-gray-400 mt-1">{task.description}</p>
            )}
          </div>
          <div className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">
            {task.status === 'idle' && '待开始'}
            {task.status === 'running' && '进行中'}
            {task.status === 'completed' && '已完成'}
            {task.status === 'error' && '出错'}
          </div>
        </div>
      </div>

      {/* Stage Progress */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {task.stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center">
              {/* Stage dot */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  stage.status === 'completed'
                    ? 'bg-green-500 text-white'
                    : stage.status === 'running'
                    ? 'bg-primary-500 text-white animate-pulse'
                    : stage.status === 'error'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {stage.status === 'completed' ? '✓' : index + 1}
              </div>
              {/* Stage name */}
              <span className="ml-2 text-sm text-gray-300">{stage.name}</span>
              {/* Connector */}
              {index < task.stages.length - 1 && (
                <div className="w-8 h-0.5 bg-gray-700 mx-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Active Stage Control */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        {isTaskCompleted ? (
          <div className="text-center py-2">
            <span className="text-green-400 font-medium">🎉 所有阶段已完成</span>
          </div>
        ) : currentStage ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-md font-medium text-primary-300">
                当前阶段：{currentStage.name}
              </h2>
              <div className="flex gap-2">
                {currentStage.status === 'pending' && onStartStage && (
                  <button
                    onClick={() => onStartStage(currentStage.id)}
                    className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 rounded text-white"
                  >
                    开始阶段
                  </button>
                )}
                {currentStage.status === 'running' && onCompleteStage && (
                  <button
                    onClick={() => onCompleteStage(currentStage.id)}
                    className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 rounded text-white"
                  >
                    完成阶段
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-400">{currentStage.description}</p>
            {currentStage.outputs.length > 0 && (
              <div className="mt-2">
                <span className="text-xs text-gray-500">输出：</span>
                {currentStage.outputs.map((output, i) => (
                  <span key={i} className="text-xs text-gray-400 ml-2">
                    {output.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">点击"开始阶段"启动第一个阶段</span>
            {task.stages[0]?.status === 'pending' && onStartStage && (
              <button
                onClick={() => onStartStage(task.stages[0].id)}
                className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 rounded text-white"
              >
                开始阶段
              </button>
            )}
          </div>
        )}
      </div>

      {/* Agent Context Display */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Agent 上下文</h3>
          <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono bg-gray-900 p-3 rounded">
            {currentStage?.agentContext || '暂无活跃阶段'}
          </pre>
        </div>
      </div>

      {/* Stage List */}
      <div className="p-4 border-t border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-2">阶段详情</h3>
        <div className="space-y-2">
          {task.stages.map((stage, index) => (
            <div
              key={stage.id}
              className={`p-2 rounded text-xs ${
                stage.status === 'completed'
                  ? 'bg-green-900/30 border border-green-800'
                  : stage.status === 'running'
                  ? 'bg-primary-900/30 border border-primary-800'
                  : 'bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-300">
                  {index + 1}. {stage.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">
                    {stage.status === 'pending' && '待开始'}
                    {stage.status === 'running' && '进行中'}
                    {stage.status === 'completed' && '已完成'}
                  </span>
                  {stage.status === 'pending' && onStartStage && (
                    <button
                      onClick={() => onStartStage(stage.id)}
                      className="px-2 py-0.5 text-xs bg-primary-600 hover:bg-primary-700 rounded text-white"
                    >
                      开始
                    </button>
                  )}
                  {stage.status === 'running' && onCompleteStage && (
                    <button
                      onClick={() => onCompleteStage(stage.id)}
                      className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-700 rounded text-white"
                    >
                      完成
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
