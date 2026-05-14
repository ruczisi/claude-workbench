import { useState } from 'react';
import type { WorkflowConfig } from '../services/workflowParser';
import type { SavedWorkflow } from '../services/workflowManager';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, workflow: WorkflowConfig) => void;
  workflows: SavedWorkflow[];
  defaultWorkflow?: WorkflowConfig;
}

export default function TaskCreateModal({
  isOpen,
  onClose,
  onCreate,
  workflows,
  defaultWorkflow,
}: TaskCreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('请输入任务名称');
      return;
    }

    let workflowConfig: WorkflowConfig | undefined;
    if (workflows.length === 0) {
      if (defaultWorkflow) {
        workflowConfig = defaultWorkflow;
      } else {
        setError('没有可用的工作流，请创建一个工作流后再试');
        return;
      }
    } else {
      const workflow = workflows.find((w) => w.id === selectedWorkflow);
      if (!workflow) {
        setError('请选择一个工作流');
        return;
      }
      workflowConfig = workflow.config;
    }

    onCreate(name.trim(), description.trim(), workflowConfig);
    // Reset form
    setName('');
    setDescription('');
    setSelectedWorkflow('');
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">新建任务</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Task Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              任务名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-200 focus:outline-none focus:border-primary-500"
              placeholder="例如：贵港供销社合作方案"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">任务描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-200 focus:outline-none focus:border-primary-500 resize-none"
              rows={3}
              placeholder="简要描述任务目标和背景..."
            />
          </div>

          {/* Workflow Selection */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              工作流 <span className="text-red-400">*</span>
            </label>
            {workflows.length === 0 ? (
              <div className="text-xs text-gray-500 py-2">
                暂无自定义工作流，将使用默认四阶段工作流
              </div>
            ) : (
              <select
                value={selectedWorkflow}
                onChange={(e) => setSelectedWorkflow(e.target.value)}
                className="w-full text-sm bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-200 focus:outline-none focus:border-primary-500"
              >
                <option value="">选择一个工作流...</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.config.stages.length} 个阶段)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-red-400">{error}</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 rounded text-white"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
