import { useState } from 'react';
import type { SavedWorkflow } from '../services/workflowManager';
import type { WorkflowStage } from '../services/workflowParser';

interface WorkflowEditorProps {
  workflow?: SavedWorkflow;
  isNew?: boolean;
  onSave: (workflow: SavedWorkflow) => void;
  onClose: () => void;
  basePath?: string;
}

const DEFAULT_NEW_WORKFLOW: SavedWorkflow = {
  id: '',
  name: '新工作流',
  description: '',
  path: '',
  config: {
    name: '新工作流',
    description: '',
    stages: [
      {
        id: 'stage1',
        name: '阶段1',
        description: '',
        outputs: [{ name: '输出文档', path: '01-输出/output.md' }],
        agentContext: '请在此描述本阶段需要 Agent 完成的工作...',
      },
    ],
  },
};

export default function WorkflowEditor({ workflow, isNew, onSave, onClose, basePath }: WorkflowEditorProps) {
  const wf = workflow || DEFAULT_NEW_WORKFLOW;
  const [name, setName] = useState(wf.config.name);
  const [description, setDescription] = useState(wf.config.description || '');
  const [stages, setStages] = useState<WorkflowStage[]>(
    wf.config.stages.map((s) => ({ ...s, outputs: s.outputs.map((o) => ({ ...o })) }))
  );
  const [expandedStage, setExpandedStage] = useState<number | null>(0);

  const handleSave = () => {
    let updated: SavedWorkflow;
    if (isNew) {
      const id = `workflow-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const slug = name.trim().replace(/\s+/g, '_').replace(/[^\w一-龥]/g, '') || 'workflow';
      updated = {
        id,
        name,
        description,
        path: `${basePath || '.'}/workflows/${slug}.md`,
        config: { name, description, stages },
      };
    } else {
      updated = {
        ...wf,
        name,
        description,
        config: { ...wf.config, name, description, stages },
      };
    }
    onSave(updated);
  };

  const updateStage = (index: number, updates: Partial<WorkflowStage>) => {
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">{isNew ? '新建工作流' : '编辑工作流'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Workflow info */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">描述</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Stages */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-400">阶段 ({stages.length})</div>
            {stages.map((stage, i) => (
              <div key={stage.id} className="bg-gray-800 rounded border border-gray-700">
                <button
                  onClick={() => setExpandedStage(expandedStage === i ? null : i)}
                  className="w-full px-3 py-2 flex items-center justify-between text-left"
                >
                  <span className="text-xs text-gray-200">
                    {i + 1}. {stage.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {expandedStage === i ? '收起' : '展开'}
                  </span>
                </button>

                {expandedStage === i && (
                  <div className="px-3 pb-3 space-y-3 border-t border-gray-700 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">ID</label>
                        <input
                          type="text"
                          value={stage.id}
                          onChange={(e) => updateStage(i, { id: e.target.value })}
                          className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">名称</label>
                        <input
                          type="text"
                          value={stage.name}
                          onChange={(e) => updateStage(i, { name: e.target.value })}
                          className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">描述</label>
                      <input
                        type="text"
                        value={stage.description}
                        onChange={(e) => updateStage(i, { description: e.target.value })}
                        className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">输出文件</label>
                      {stage.outputs.length === 0 ? (
                        <p className="text-xs text-gray-600">无输出</p>
                      ) : (
                        <div className="space-y-1">
                          {stage.outputs.map((output, oi) => (
                            <div key={oi} className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={output.name}
                                onChange={(e) => {
                                  const newOutputs = [...stage.outputs];
                                  newOutputs[oi] = { ...output, name: e.target.value };
                                  updateStage(i, { outputs: newOutputs });
                                }}
                                className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300"
                                placeholder="名称"
                              />
                              <input
                                type="text"
                                value={output.path}
                                onChange={(e) => {
                                  const newOutputs = [...stage.outputs];
                                  newOutputs[oi] = { ...output, path: e.target.value };
                                  updateStage(i, { outputs: newOutputs });
                                }}
                                className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300"
                                placeholder="路径"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Agent 上下文</label>
                      <textarea
                        value={stage.agentContext}
                        onChange={(e) => updateStage(i, { agentContext: e.target.value })}
                        rows={6}
                        className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300 font-mono resize-y focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 rounded text-white"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
