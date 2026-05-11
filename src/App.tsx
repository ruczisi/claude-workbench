import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import Preview from './components/Preview';
import StatusBar from './components/StatusBar';
import StartupOverlay from './components/StartupOverlay';
import { useAppStore } from './stores/appStore';

const STORAGE_KEY = 'cospace-last-workspace';
const CONV_PATH_KEY = 'cospace-conversations-path';

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const {
    setFileEvents,
    setTeamTasks,
    startupPhase,
    setStartupPhase,
    setWatchedPath,
    setConversationsPath,
  } = useAppStore();

  // On mount: check for saved workspace + conversations path
  useEffect(() => {
    const savedPath = localStorage.getItem(STORAGE_KEY);
    if (savedPath) {
      setWatchedPath(savedPath);
      setStartupPhase('ready');
      invoke('start_file_watcher', { path: savedPath }).catch((err) => {
        console.error('[Cospace] Failed to start file watcher:', err);
      });
    } else {
      setStartupPhase('select-workspace');
    }

    // Restore saved conversations directory
    const savedConvPath = localStorage.getItem(CONV_PATH_KEY);
    if (savedConvPath) {
      setConversationsPath(savedConvPath);
    }
  }, [setWatchedPath, setStartupPhase, setConversationsPath]);

  // Listen for Tauri events
  useEffect(() => {
    const unlistenFileChange = listen<{ path: string; event_type: string }>('file-change', (event) => {
      setFileEvents({
        path: event.payload.path,
        event_type: event.payload.event_type as 'create' | 'modify' | 'remove',
      });
    });

    const unlistenTeamTasks = listen<any[]>('team-tasks-update', (event) => {
      setTeamTasks(event.payload);
    });

    return () => {
      unlistenFileChange.then((fn) => fn());
      unlistenTeamTasks.then((fn) => fn());
    };
  }, [setFileEvents, setTeamTasks]);

  // Handle workspace selection from startup overlay
  const handleWorkspaceSelected = useCallback((path: string) => {
    localStorage.setItem(STORAGE_KEY, path);
    setWatchedPath(path);
    setStartupPhase('ready');
    invoke('start_file_watcher', { path }).catch((err) => {
      console.error('[Cospace] Failed to start file watcher:', err);
    });
  }, [setWatchedPath, setStartupPhase]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className={`${theme} h-full flex flex-col bg-gray-900 text-gray-100`}>
      {/* Startup overlay (blocking) */}
      {startupPhase === 'select-workspace' && (
        <StartupOverlay onWorkspaceSelected={handleWorkspaceSelected} />
      )}

      {/* Main app content - render always but visually hidden behind overlay */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar theme={theme} onToggleTheme={toggleTheme} />

        <div className="flex-1 flex flex-col border-x border-gray-700">
          <Terminal />
        </div>

        <Preview />
      </div>

      <StatusBar />
    </div>
  );
}

export default App;
