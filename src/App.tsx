import { useState, useEffect } from 'react';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import Sidebar from './components/Sidebar';
import Workbench from './components/Workbench';
import Preview from './components/Preview';
import { useAppStore } from './stores/appStore';
import { taskManager, type Task } from './services/taskManager';
import { STANDARD_4STAGE_WORKFLOW } from './services/embeddedWorkflow';

const STORAGE_KEY = 'cospace-v2-workspace';

function App() {
  const [theme] = useState<'dark' | 'light'>('dark');
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [showWorkbench, setShowWorkbench] = useState(false);

  // Stage management callbacks
  const handleStartStage = (stageId: string) => {
    if (!currentTask) return;
    const updated = taskManager.startStage(currentTask.id, stageId);
    if (updated) {
      setCurrentTask(updated);
    }
  };

  const handleCompleteStage = async (stageId: string) => {
    if (!currentTask) return;
    const updated = await taskManager.completeStage(currentTask.id, stageId);
    if (updated) {
      setCurrentTask(updated);
    }
  };
  const {
    startupPhase,
    setStartupPhase,
    setWatchedPath,
    watchedPath,
  } = useAppStore();

  // On mount: check for saved workspace
  useEffect(() => {
    const savedPath = localStorage.getItem(STORAGE_KEY);
    if (savedPath) {
      setWatchedPath(savedPath);
      setStartupPhase('ready');
    } else {
      setStartupPhase('select-workspace');
    }
  }, [setWatchedPath, setStartupPhase]);

  // Handle workspace selection
  const handleWorkspaceSelected = (path: string) => {
    localStorage.setItem(STORAGE_KEY, path);
    setWatchedPath(path);
    setStartupPhase('ready');
  };

  // Select workspace folder
  const handleSelectWorkspace = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择工作区文件夹',
      });
      if (selected) {
        handleWorkspaceSelected(selected);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  // Create demo task
  const handleCreateDemoTask = async () => {
    if (!watchedPath) {
      alert('请先选择工作区');
      return;
    }
    try {
      // Use the selected workspace as the task root
      const taskBasePath = await join(watchedPath, 'tasks', 'demo-task');

      // Create task using embedded workflow (no external file dependency)
      const task = await taskManager.createTaskFromWorkflow(
        '贵港供销社方案',
        STANDARD_4STAGE_WORKFLOW,
        taskBasePath,
        '贵港供销社南北大通道合作方案'
      );

      setCurrentTask(task);
      setShowWorkbench(true);
    } catch (err) {
      console.error('[Cospace] Failed to create demo task:', err);
      alert(`创建任务失败: ${err}`);
    }
  };

  return (
    <div className={`${theme} h-full flex flex-col bg-gray-900 text-gray-100`}>
      {/* Startup overlay */}
      {startupPhase === 'select-workspace' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-primary-400 mb-4">Cospace v2.0</h1>
            <p className="text-gray-400 mb-6">Agent 驱动的工作台</p>
            <button
              onClick={handleSelectWorkspace}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded text-white"
            >
              选择工作区
            </button>
          </div>
        </div>
      )}

      {/* Main app content */}
      {startupPhase === 'ready' && (
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            onCreateTask={handleCreateDemoTask}
            watchedPath={watchedPath}
          />

          <div className="flex-1 flex flex-col border-x border-gray-700">
            {showWorkbench && currentTask ? (
              <Workbench
                task={currentTask}
                onStartStage={handleStartStage}
                onCompleteStage={handleCompleteStage}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p className="mb-4">点击侧边栏"+ 创建示例任务"开始</p>
                  {!watchedPath && (
                    <button
                      onClick={handleSelectWorkspace}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                    >
                      选择工作区
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <Preview task={currentTask} />
        </div>
      )}
    </div>
  );
}

export default App;