import { create } from 'zustand';
import type { Task, TaskStage } from '../services/taskManager';

export type AgentType = 'claude' | 'codex' | 'custom';
export type SidebarTab = 'workspace' | 'history' | 'workflows' | 'settings';
export type StartupPhase = 'loading' | 'select-workspace' | 'ready';

interface AppState {
  // Startup phase
  startupPhase: StartupPhase;
  setStartupPhase: (phase: StartupPhase) => void;

  // Workspace path
  watchedPath: string | null;
  setWatchedPath: (path: string | null) => void;

  // Task management (v2.0)
  tasks: Task[];
  currentTask: Task | null;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  setCurrentTask: (task: Task | null) => void;
  updateTaskStage: (taskId: string, stageId: string, updates: Partial<TaskStage>) => void;

  // Sidebar
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;

  // Settings
  activeAgent: AgentType;
  setActiveAgent: (agent: AgentType) => void;
  conversationsPath: string | null;
  setConversationsPath: (path: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Startup phase
  startupPhase: 'loading',
  setStartupPhase: (phase) => set({ startupPhase: phase }),

  // Workspace path
  watchedPath: null,
  setWatchedPath: (path) => set({ watchedPath: path }),

  // Task management
  tasks: [],
  currentTask: null,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  setCurrentTask: (task) => set({ currentTask: task }),
  updateTaskStage: (taskId, stageId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              stages: t.stages.map((s) =>
                s.id === stageId ? { ...s, ...updates } : s
              ),
            }
          : t
      ),
      currentTask:
        state.currentTask?.id === taskId
          ? {
              ...state.currentTask,
              stages: state.currentTask.stages.map((s) =>
                s.id === stageId ? { ...s, ...updates } : s
              ),
            }
          : state.currentTask,
    })),

  // Sidebar
  activeTab: 'workspace',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Settings
  activeAgent: 'claude',
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  conversationsPath: null,
  setConversationsPath: (path) => set({ conversationsPath: path }),
}));