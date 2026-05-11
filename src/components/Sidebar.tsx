import { useEffect, useCallback, useState, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, AgentType as StoreAgentType, TeamTask } from '../stores/appStore';
import {
  createSession,
  writeToSession,
  scanConversations,
} from '../services/agentService';

const CONV_PATH_KEY = 'cospace-conversations-path';
const RENAMES_KEY = 'cospace-conversation-renames';

interface SidebarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

function formatTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}天前`;
    return d.toLocaleDateString('zh-CN');
  } catch {
    return '';
  }
}

function TaskItem({ task }: { task: TeamTask }) {
  const statusIcon =
    task.status === 'completed' ? '✅' : task.status === 'error' ? '⚠️' : task.status === 'running' ? '🔄' : '⏳';
  const statusColor =
    task.status === 'completed'
      ? 'text-green-400'
      : task.status === 'error'
      ? 'text-red-400'
      : 'text-gray-400';

  return (
    <div
      className={`p-2 rounded text-xs ${
        task.status === 'error'
          ? 'bg-red-900/30 border border-red-800'
          : task.status === 'completed'
          ? 'bg-green-900/30 border border-green-800'
          : 'bg-gray-900'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-300 truncate flex-1 mr-2">
          {statusIcon} {task.name}
        </span>
        <span className={`${statusColor} shrink-0`}>
          {task.status === 'completed'
            ? '完成'
            : task.status === 'error'
            ? '异常'
            : `${Math.round(task.progress)}%`}
        </span>
      </div>
      {task.status === 'running' && (
        <div className="mt-1">
          <div className="w-full bg-gray-700 rounded-full h-1">
            <div className="bg-primary-500 h-1 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      )}
      {task.message && <div className="mt-1 text-gray-500 truncate">{task.message}</div>}
    </div>
  );
}

function ConversationItem({
  conv,
  displayName,
  sessionStatus,
  isActive,
  onRename,
}: {
  conv: { id: string; name: string; updated_at: string; message_count: number };
  displayName: string;
  sessionStatus: 'running' | 'starting' | 'completed' | null;
  isActive: boolean;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(displayName);
    setEditing(true);
  };

  const commitRename = () => {
    setEditing(false);
    onRename(conv.id, editValue);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) {
      setEditValue(displayName);
    }
  }, [displayName, editing]);

  return (
    <div className="flex items-center gap-2 text-xs px-1 py-1.5">
      {/* Status dot */}
      {sessionStatus ? (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            sessionStatus === 'running'
              ? 'bg-green-500'
              : sessionStatus === 'starting'
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-blue-500'
          }`}
          title={
            sessionStatus === 'running'
              ? '运行中'
              : sessionStatus === 'starting'
              ? '启动中'
              : '已完成'
          }
        />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-gray-600" title="未激活" />
      )}
      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-gray-800 text-gray-100 text-xs px-1 py-0.5 rounded border border-primary-500 outline-none"
          />
        ) : (
          <div
            className={`truncate cursor-pointer ${isActive ? 'text-primary-400 font-medium' : 'text-gray-300'}`}
            onDoubleClick={startEdit}
            title={`双击重命名 | ${displayName}`}
          >
            {displayName}
          </div>
        )}
        <div className="text-gray-500 mt-0.5 flex items-center gap-2">
          <span>{formatTime(conv.updated_at)}</span>
          <span>{conv.message_count} 条消息</span>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ theme, onToggleTheme }: SidebarProps) {
  const {
    watchedPath,
    setWatchedPath,
    activeTab,
    setActiveTab,
    activeAgent,
    setActiveAgent,
    autoStartAgent,
    setAutoStartAgent,
    teamTasks,
    agentStatus,
    conversations,
    setConversations,
    conversationsPath,
    setConversationsPath,
    sessions,
    activeSessionId,
    addSession,
    setActiveSession,
    updateSession,
    conversationRenames,
    setConversationRename,
    removeConversationRename,
  } = useAppStore();

  // Load renames from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RENAMES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [id, name] of Object.entries(parsed)) {
          if (typeof name === 'string') {
            setConversationRename(id, name);
          }
        }
      }
    } catch {
      // ignore corrupt data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const handleSelectConversationsDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择对话记录目录',
      });

      if (selected) {
        setConversationsPath(selected);
        localStorage.setItem(CONV_PATH_KEY, selected);
      }
    } catch (error) {
      console.error('Failed to select conversations directory:', error);
    }
  };

  const agentOptions: { value: StoreAgentType; label: string; icon: string }[] = [
    { value: 'claude', label: 'Claude Code', icon: '🤖' },
    { value: 'codex', label: 'Codex (ChatGPT)', icon: '💬' },
    { value: 'custom', label: '自定义', icon: '⚡' },
  ];

  const agentStatusText = typeof agentStatus === 'string' ? agentStatus : 'error';

  // Fetch conversations on mount and when workspace/conversationsPath changes
  const fetchConversations = useCallback(async () => {
    try {
      const paths = conversationsPath ? [conversationsPath] : [];
      const result = await scanConversations(watchedPath || undefined, paths);
      setConversations(result);
    } catch (error) {
      console.error('[Cospace] Failed to fetch conversations:', error);
    }
  }, [setConversations, watchedPath, conversationsPath]);

  useEffect(() => {
    fetchConversations();
    // Refresh every 30 seconds
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Persist renames to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(RENAMES_KEY, JSON.stringify(conversationRenames));
    } catch {
      // ignore
    }
  }, [conversationRenames]);

  // Rename a conversation
  const handleRenameConversation = useCallback(
    (convId: string, newName: string) => {
      const trimmed = newName.trim();
      if (trimmed) {
        setConversationRename(convId, trimmed);
      } else {
        removeConversationRename(convId);
      }
    },
    [setConversationRename, removeConversationRename],
  );

  // Get display name for a conversation (rename override > scanned name)
  const getConvDisplayName = useCallback(
    (conv: { id: string; name: string }) => {
      return conversationRenames[conv.id] || conv.name || '未命名对话';
    },
    [conversationRenames],
  );

  // Build lookup: conversationId → session status
  const sessionByConv = new Map<string, { status: string; isActive: boolean }>();
  for (const s of sessions) {
    if (s.conversationId) {
      sessionByConv.set(s.conversationId, { status: s.status, isActive: s.id === activeSessionId });
    }
  }

  // Resume conversation: create new session + launch claude -r
  const handleResumeConversation = useCallback(
    async (convId: string, convName: string) => {
      // Check if already active — just switch to it
      const existing = sessions.find(
        (s) => s.conversationId === convId && s.status !== 'completed',
      );
      if (existing) {
        setActiveSession(existing.id);
        return;
      }

      // Create new session
      const id = window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      addSession({
        id,
        name: convName || '未命名对话',
        status: 'starting',
        isActive: false,
        createdAt: Date.now(),
        conversationId: convId,
      });

      setActiveSession(id);

      try {
        await createSession(id, watchedPath || undefined);
        updateSession(id, { status: 'running' });

        if (watchedPath) {
          writeToSession(id, `cd "${watchedPath}"\r\n`).catch(() => {});
        }

        // Resume conversation
        setTimeout(() => {
          writeToSession(id, `claude -r "${convId}"\r\n`).catch(() => {});
        }, 1500);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Cospace] Failed to resume conversation:', msg);
        updateSession(id, { status: 'completed' });
      }
    },
    [sessions, watchedPath, addSession, setActiveSession, updateSession],
  );

  const recentConversations = conversations.slice(0, 10);

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

            {/* Agent Status */}
            {watchedPath && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 px-1 mb-1">
                  <span>Agent 状态</span>
                  <span
                    className={
                      agentStatusText === 'running'
                        ? 'text-green-400'
                        : agentStatusText === 'starting'
                        ? 'text-yellow-400'
                        : 'text-gray-500'
                    }
                  >
                    ● {agentStatusText}
                  </span>
                </div>
              </div>
            )}

            {/* Agent Task List */}
            {teamTasks.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-gray-500 px-1 mb-1">Agent 任务</div>
                <div className="space-y-1">
                  {teamTasks.map((task) => (
                    <TaskItem key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* Conversation History */}
            <div className="mt-3">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs text-gray-500">对话历史</span>
                <button
                  onClick={fetchConversations}
                  className="text-xs text-gray-500 hover:text-gray-400"
                  title="刷新"
                >
                  ↻
                </button>
              </div>
              {recentConversations.length > 0 ? (
                <div className="space-y-0.5">
                  {recentConversations.map((conv) => {
                    const sessionInfo = sessionByConv.get(conv.id);
                    const isActive =
                      sessionInfo?.isActive ?? false;
                    const sessionStatus: 'running' | 'starting' | 'completed' | null =
                      (sessionInfo?.status as 'running' | 'starting' | 'completed') ?? null;

                    const displayName = getConvDisplayName(conv);

                    return (
                      <button
                        key={conv.id}
                        onClick={() => handleResumeConversation(conv.id, displayName)}
                        className={`w-full text-left rounded transition-colors hover:bg-gray-700/50 ${
                          isActive ? 'bg-gray-700/70 border-l-2 border-primary-500' : 'border-l-2 border-transparent'
                        }`}
                        title={`点击恢复对话 | 双击名称重命名`}
                      >
                        <ConversationItem
                          conv={conv}
                          displayName={displayName}
                          sessionStatus={sessionStatus}
                          isActive={isActive}
                          onRename={handleRenameConversation}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-500 px-1 py-2 text-center space-y-2">
                  <div>暂无对话历史</div>
                  <button
                    onClick={handleSelectConversationsDir}
                    className="w-full px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs"
                  >
                    + 选择对话目录
                  </button>
                  {conversationsPath && (
                    <div className="text-gray-500 truncate" title={conversationsPath}>
                      目录: {conversationsPath}
                    </div>
                  )}
                </div>
              )}
            </div>

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
