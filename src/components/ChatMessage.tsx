export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const timeStr = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-500 bg-gray-800/50 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Avatar */}
        <div className="flex items-center gap-2 mb-1">
          {!isUser && (
            <span className="text-xs text-primary-400 font-medium">Cospace</span>
          )}
          {isUser && (
            <span className="text-xs text-gray-400">你</span>
          )}
          <span className="text-xs text-gray-600">{timeStr}</span>
        </div>

        {/* Bubble */}
        <div
          className={`px-3 py-2 rounded-lg text-sm ${
            isUser
              ? 'bg-primary-700 text-white rounded-br-none'
              : 'bg-gray-800 text-gray-200 rounded-bl-none border border-gray-700'
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
