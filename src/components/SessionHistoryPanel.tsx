import { useState } from 'react';
import type { ContextEntry } from '../services/contextHistory';

interface SessionHistoryPanelProps {
  entries: ContextEntry[];
}

const roleLabels: Record<string, string> = {
  user: '👤 用户',
  agent: '🤖 Agent',
  system: '⚙️ 系统',
};

const roleColors: Record<string, string> = {
  user: 'bg-blue-900/30 border-blue-800 text-blue-300',
  agent: 'bg-green-900/30 border-green-800 text-green-300',
  system: 'bg-gray-800 border-gray-700 text-gray-400',
};

export default function SessionHistoryPanel({ entries }: SessionHistoryPanelProps) {
  const [filter, setFilter] = useState<'all' | 'user' | 'agent' | 'system'>('all');

  const filtered = entries.filter((e) => (filter === 'all' ? true : e.role === filter));

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-sm mb-1">📭 暂无会话历史</p>
          <p className="text-xs text-gray-600">启动 Agent 后将自动记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filter bar */}
      <div className="p-2 border-b border-gray-700 bg-gray-800 flex items-center gap-1">
        {(['all', 'user', 'agent', 'system'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 text-xs rounded ${
              filter === f
                ? 'bg-primary-700 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {f === 'all' ? '全部' : roleLabels[f].split(' ')[1]}
            {f !== 'all' && (
              <span className="ml-1 text-gray-500">
                {entries.filter((e) => e.role === f).length}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">共 {filtered.length} 条</span>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map((entry, i) => (
          <div
            key={i}
            className={`rounded border px-3 py-2 ${roleColors[entry.role] || roleColors.system}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">{roleLabels[entry.role] || entry.role}</span>
              <span className="text-xs opacity-60">
                {new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed opacity-90">
              {entry.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
