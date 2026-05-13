import type { Task } from '../services/taskManager';

interface WorkbenchProps {
  task: Task;
}

export default function Workbench({ task }: WorkbenchProps) {

  return (
    <div className="flex-1 flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-semibold text-primary-400">{task.name}</h1>
        {task.description && (
          <p className="text-sm text-gray-400 mt-1">{task.description}</p>
        )}
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

      {/* Current Stage Info */}
      {task.currentStageId && (
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          {(() => {
            const currentStage = task.stages.find((s) => s.id === task.currentStageId);
            if (!currentStage) return null;
            return (
              <div>
                <h2 className="text-md font-medium text-primary-300 mb-2">
                  当前阶段：{currentStage.name}
                </h2>
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
            );
          })()}
        </div>
      )}

      {/* Agent Context Display */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Agent 上下文</h3>
          <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono bg-gray-900 p-3 rounded">
            {(() => {
              const active = task.stages.find(
                (s) => s.id === task.currentStageId || s.status === 'running'
              );
              return active?.agentContext || '暂无活跃阶段';
            })()}
          </pre>
        </div>
      </div>

      {/* Stage List for Debug */}
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
                <span className="text-gray-500">{stage.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}