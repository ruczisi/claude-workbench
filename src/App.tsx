import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import Preview from './components/Preview';
import StatusBar from './components/StatusBar';
import { useAppStore } from './stores/appStore';

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const { setFileEvents, setTeamTasks } = useAppStore();

  useEffect(() => {
    // Listen for file change events from Rust backend
    const unlistenFileChange = listen<{ path: string; event_type: string }>('file-change', (event) => {
      setFileEvents({
        path: event.payload.path,
        event_type: event.payload.event_type as 'create' | 'modify' | 'remove',
      });
    });

    // Listen for team tasks update
    const unlistenTeamTasks = listen<any[]>('team-tasks-update', (event) => {
      setTeamTasks(event.payload);
    });

    return () => {
      unlistenFileChange.then((fn) => fn());
      unlistenTeamTasks.then((fn) => fn());
    };
  }, [setFileEvents, setTeamTasks]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className={`${theme} h-full flex flex-col bg-gray-900 text-gray-100`}>
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar theme={theme} onToggleTheme={toggleTheme} />

        {/* Terminal Area */}
        <div className="flex-1 flex flex-col border-x border-gray-700">
          <Terminal />
        </div>

        {/* Preview Area */}
        <Preview />
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}

export default App;
