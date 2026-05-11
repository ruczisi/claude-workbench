import { open } from '@tauri-apps/plugin-dialog';

interface StartupOverlayProps {
  onWorkspaceSelected: (path: string) => void;
}

export default function StartupOverlay({ onWorkspaceSelected }: StartupOverlayProps) {
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择工作区文件夹',
      });

      if (selected) {
        onWorkspaceSelected(selected);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900">
      <div className="flex flex-col items-center max-w-lg px-8">
        {/* Logo / Brand */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center text-white text-xl font-bold">
            C
          </div>
          <h1 className="text-2xl font-bold text-white">Cospace</h1>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-center mb-4">
          AI Agent 交付工作台。请选择一个工作区文件夹以开始使用。
        </p>
        <p className="text-gray-500 text-sm text-center mb-8">
          工作区是您存放项目代码和文档的目录，AI Agent 将在此目录中工作。
        </p>

        {/* Browse button */}
        <button
          onClick={handleSelectFolder}
          className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-lg font-medium transition-colors"
        >
          选择工作区
        </button>

        <p className="text-gray-600 text-xs mt-6">
          提示：您也可以在应用中随时切换工作区
        </p>
      </div>
    </div>
  );
}
