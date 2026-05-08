import { useAppStore } from '../stores/appStore';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { open } from '@tauri-apps/plugin-dialog';

export default function Preview() {
  const { previewFile, setPreviewFile } = useAppStore();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadContent = async () => {
      if (!previewFile?.path) {
        setContent('');
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`file://${previewFile.path}`);
        const text = await response.text();
        setContent(text);
      } catch (error) {
        console.error('Failed to load file:', error);
        setContent(`# 加载失败\n\n无法加载文件: ${previewFile.path}`);
      }
      setLoading(false);
    };

    loadContent();
  }, [previewFile]);

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: '选择要预览的文件',
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'HTML', extensions: ['html', 'htm'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg'] },
        ],
      });

      if (selected) {
        const path = selected as string;
        const name = path.split(/[/\\]/).pop() || 'unknown';
        const ext = name.split('.').pop()?.toLowerCase() || '';

        let type: 'markdown' | 'html' | 'image' | 'pdf' | 'video' | 'document' | 'unknown' = 'unknown';
        if (['md', 'markdown'].includes(ext)) type = 'markdown';
        else if (['html', 'htm'].includes(ext)) type = 'html';
        else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) type = 'image';
        else if (['pdf'].includes(ext)) type = 'pdf';
        else if (['mp4', 'webm', 'mov'].includes(ext)) type = 'video';
        else if (['doc', 'docx', 'txt'].includes(ext)) type = 'document';

        setPreviewFile({ path, name, type, content });
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          加载中...
        </div>
      );
    }

    if (!previewFile) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <div className="text-6xl mb-4">📄</div>
          <div className="text-lg mb-2">暂无预览内容</div>
          <div className="text-sm">从侧边栏选择文件或拖放文件到此处</div>
          <button
            onClick={handleOpenFile}
            className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded text-sm"
          >
            打开文件
          </button>
        </div>
      );
    }

    switch (previewFile.type) {
      case 'markdown':
        return (
          <div className="p-4 overflow-auto h-full prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        );
      case 'html':
        return (
          <iframe
            src={`file://${previewFile.path}`}
            className="w-full h-full border-none"
            title="HTML Preview"
            sandbox="allow-same-origin"
          />
        );
      case 'image':
        return (
          <div className="flex items-center justify-center h-full bg-gray-900 p-4">
            <img
              src={`file://${previewFile.path}`}
              alt={previewFile.name}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        );
      case 'pdf':
        return (
          <iframe
            src={`file://${previewFile.path}`}
            className="w-full h-full border-none"
            title="PDF Preview"
          />
        );
      case 'video':
        return (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <video
              src={`file://${previewFile.path}`}
              controls
              autoPlay
              className="max-w-full max-h-full"
            >
              您的浏览器不支持视频播放
            </video>
          </div>
        );
      default:
        return (
          <div className="p-4 overflow-auto">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap">{content}</pre>
          </div>
        );
    }
  };

  return (
    <div className="w-[450px] bg-gray-800 flex flex-col border-l border-gray-700">
      {/* Header */}
      <div className="px-3 py-1 bg-gray-900 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {previewFile ? previewFile.name : '预览'}
        </span>
        {previewFile && (
          <button
            onClick={() => setPreviewFile(null)}
            className="text-xs text-gray-500 hover:text-gray-400"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{renderPreview()}</div>
    </div>
  );
}
