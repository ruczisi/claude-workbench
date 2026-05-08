import { create } from 'zustand';

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
}));
