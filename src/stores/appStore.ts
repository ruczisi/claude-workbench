import { create } from 'zustand';

export type AgentType = 'claude' | 'codex' | 'custom';
export type SidebarTab = 'workspace' | 'history' | 'settings';
export type AgentStatusType = 'stopped' | 'starting' | 'running' | { error: string };
export type StartupPhase = 'loading' | 'select-workspace' | 'ready';

interface FileEvent {
  path: string;
  event_type: 'create' | 'modify' | 'remove';
  timestamp?: number;
}

export interface TeamTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  message?: string;
}

export interface PreviewFile {
  path: string;
  name: string;
  type: 'markdown' | 'html' | 'image' | 'pdf' | 'video' | 'document' | 'unknown';
  content?: string;
}

export interface ClaudeConversation {
  id: string;
  name: string;
  updated_at: string;
  message_count: number;
}

export interface SessionState {
  id: string;
  name: string;
  status: 'stopped' | 'starting' | 'running' | 'completed';
  isActive: boolean;
  createdAt: number;
  conversationId?: string;
}

interface AppState {
  // Startup phase
  startupPhase: StartupPhase;
  setStartupPhase: (phase: StartupPhase) => void;

  // File watching
  watchedPath: string | null;
  fileEvents: FileEvent[];
  setWatchedPath: (path: string | null) => void;
  setFileEvents: (event: FileEvent) => void;
  addFileEvent: (event: FileEvent) => void;
  clearFileEvents: () => void;

  // Team tasks
  teamTasks: TeamTask[];
  setTeamTasks: (tasks: TeamTask[]) => void;
  updateTeamTask: (task: TeamTask) => void;

  // Preview
  previewFile: PreviewFile | null;
  setPreviewFile: (file: PreviewFile | null) => void;

  // UI state
  sidebarWidth: number;
  previewWidth: number;
  setSidebarWidth: (width: number) => void;
  setPreviewWidth: (width: number) => void;

  // Status bar
  isTeamPanelExpanded: boolean;
  setTeamPanelExpanded: (expanded: boolean) => void;

  // Settings
  activeAgent: AgentType;
  setActiveAgent: (agent: AgentType) => void;
  autoStartAgent: boolean;
  setAutoStartAgent: (auto: boolean) => void;
  customAgentCommand: string;
  setCustomAgentCommand: (cmd: string) => void;

  // Sidebar
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;

  // Agent runtime state
  agentStatus: AgentStatusType;
  setAgentStatus: (status: AgentStatusType) => void;
  agentPath: string | null;
  setAgentPath: (path: string | null) => void;

  // Agent live status for status bar
  agentStatusText: string;
  setAgentStatusText: (text: string) => void;

  // Sessions (multi-session PTY)
  sessions: SessionState[];
  activeSessionId: string | null;
  setSessions: (sessions: SessionState[]) => void;
  addSession: (session: SessionState) => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<SessionState>) => void;
  setActiveSession: (id: string | null) => void;

  // Claude conversations
  conversations: ClaudeConversation[];
  setConversations: (conversations: ClaudeConversation[]) => void;
  conversationsPath: string | null;
  setConversationsPath: (path: string | null) => void;

  // Conversation renames (user overrides)
  conversationRenames: Record<string, string>;
  setConversationRename: (id: string, name: string) => void;
  removeConversationRename: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Startup phase
  startupPhase: 'loading',
  setStartupPhase: (phase) => set({ startupPhase: phase }),

  // File watching
  watchedPath: null,
  fileEvents: [],
  setWatchedPath: (path) => set({ watchedPath: path }),
  setFileEvents: (event: FileEvent) =>
    set((state) => ({
      fileEvents: [
        { ...event, timestamp: Date.now() },
        ...state.fileEvents.slice(0, 99),
      ],
    })),
  addFileEvent: (event) =>
    set((state) => ({
      fileEvents: [
        { ...event, timestamp: Date.now() },
        ...state.fileEvents.slice(0, 99),
      ],
    })),
  clearFileEvents: () => set({ fileEvents: [] }),

  // Team tasks
  teamTasks: [],
  setTeamTasks: (tasks) => set({ teamTasks: tasks }),
  updateTeamTask: (task) =>
    set((state) => ({
      teamTasks: state.teamTasks.map((t) => (t.id === task.id ? task : t)),
    })),

  // Preview
  previewFile: null,
  setPreviewFile: (file) => set({ previewFile: file }),

  // UI state
  sidebarWidth: 200,
  previewWidth: 450,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setPreviewWidth: (width) => set({ previewWidth: width }),

  // Status bar
  isTeamPanelExpanded: false,
  setTeamPanelExpanded: (expanded) => set({ isTeamPanelExpanded: expanded }),

  // Settings
  activeAgent: 'claude',
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  autoStartAgent: true,
  setAutoStartAgent: (auto) => set({ autoStartAgent: auto }),
  customAgentCommand: '',
  setCustomAgentCommand: (cmd) => set({ customAgentCommand: cmd }),

  // Sidebar
  activeTab: 'workspace',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Agent runtime state (kept for backward compatibility)
  agentStatus: 'stopped',
  setAgentStatus: (status) => set({ agentStatus: status }),
  agentPath: null,
  setAgentPath: (path) => set({ agentPath: path }),

  // Agent live status for status bar
  agentStatusText: '',
  setAgentStatusText: (text) => set({ agentStatusText: text }),

  // Sessions (multi-session PTY)
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    })),
  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  setActiveSession: (id) =>
    set((state) => ({
      activeSessionId: id,
      sessions: state.sessions.map((s) => ({
        ...s,
        isActive: s.id === id,
      })),
    })),

  // Claude conversations
  conversations: [],
  setConversations: (conversations) => set({ conversations }),
  conversationsPath: null,
  setConversationsPath: (path) => set({ conversationsPath: path }),

  // Conversation renames (user overrides, persisted in localStorage)
  conversationRenames: {},
  setConversationRename: (id, name) =>
    set((state) => ({
      conversationRenames: { ...state.conversationRenames, [id]: name },
    })),
  removeConversationRename: (id) =>
    set((state) => {
      const next = { ...state.conversationRenames };
      delete next[id];
      return { conversationRenames: next };
    }),
}));
