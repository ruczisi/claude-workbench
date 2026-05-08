import { create } from 'zustand';

export type AgentType = 'claude' | 'codex' | 'custom';
export type SidebarTab = 'workspace' | 'history' | 'settings';
export type AgentStatus = 'stopped' | 'starting' | 'running' | { error: string };

interface FileEvent {
  path: string;
  event_type: 'create' | 'modify' | 'remove';
  timestamp?: number;
}

interface TeamTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  message?: string;
}

interface PreviewFile {
  path: string;
  name: string;
  type: 'markdown' | 'html' | 'image' | 'pdf' | 'video' | 'document' | 'unknown';
  content?: string;
}

interface AppState {
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
  agentStatus: AgentStatus;
  setAgentStatus: (status: AgentStatus) => void;
  agentPath: string | null;
  setAgentPath: (path: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
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

  // Agent runtime state
  agentStatus: 'stopped',
  setAgentStatus: (status) => set({ agentStatus: status }),
  agentPath: null,
  setAgentPath: (path) => set({ agentPath: path }),
}));
