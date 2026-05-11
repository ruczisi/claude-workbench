import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createSession as apiCreateSession,
  destroySession as apiDestroySession,
  writeToSession,
  onSessionOutput,
  onSessionExit,
} from '../services/agentService';
import { useAppStore, PreviewFile } from '../stores/appStore';

// ===== ANSI / terminal escape sequence stripper =====

// Regex for CSI sequences: ESC [ ... <letter>
const CSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;
// OSC sequences: ESC ] ... BEL or ST
const OSC_RE = /\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g;
// Other escapes: ESC + single char
const SIMPLE_ESC_RE = /\x1b[^[\]]./g;
// Backspace sequences (used for progress bars: char + BS)
const BS_RE = /.\x08/g;

function stripAnsi(text: string): string {
  return text
    .replace(OSC_RE, '')
    .replace(CSI_RE, '')
    .replace(SIMPLE_ESC_RE, '')
    .replace(BS_RE, '')          // remove progress-bar backspaces
    .replace(/\r\n/g, '\n')      // CRLF → LF
    .replace(/\r/g, '\n');       // standalone CR → LF
}

// Buffer partial ANSI sequences that may span chunk boundaries
function createAnsiStripper() {
  let buf = '';

  return function feed(chunk: string): string {
    buf += chunk;
    // Process complete lines only — keep incomplete ANSI in buffer
    const cleaned = stripAnsi(buf);
    // Check if buffer ends with a potential incomplete escape
    const lastEsc = buf.lastIndexOf('\x1b');
    if (lastEsc >= 0 && lastEsc >= buf.length - 10) {
      // Might be mid-escape, only output up to that point
      const safeEnd = lastEsc;
      const safe = buf.slice(0, safeEnd);
      buf = buf.slice(safeEnd);
      return stripAnsi(safe);
    }
    buf = '';
    return cleaned;
  };
}

// ===== Link detection =====

function detectLinks(text: string): Array<{ start: number; end: number; url: string }> {
  const links: Array<{ start: number; end: number; url: string }> = [];
  const re = /https?:\/\/[^\s<>")\]]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    links.push({ start: m.index, end: m.index + m[0].length, url: m[0] });
  }
  return links;
}

// ===== Output line component =====

function OutputBlock({
  text,
  onLinkClick,
}: {
  text: string;
  onLinkClick: (url: string) => void;
}) {
  const links = detectLinks(text);
  if (links.length === 0) {
    return <>{text}</>;
  }

  const parts: Array<{ type: 'text' | 'link'; content: string; url?: string }> = [];
  let lastEnd = 0;
  for (const link of links) {
    if (link.start > lastEnd) {
      parts.push({ type: 'text', content: text.slice(lastEnd, link.start) });
    }
    parts.push({ type: 'link', content: link.url, url: link.url });
    lastEnd = link.end;
  }
  if (lastEnd < text.length) {
    parts.push({ type: 'text', content: text.slice(lastEnd) });
  }

  return (
    <>
      {parts.map((p, i) =>
        p.type === 'link' ? (
          <button
            key={i}
            onClick={() => onLinkClick(p.url!)}
            className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
          >
            {p.content}
          </button>
        ) : (
          <span key={i}>{p.content}</span>
        ),
      )}
    </>
  );
}

// ===== Main component =====

function inferFileType(path: string): PreviewFile['type'] {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['doc', 'docx', 'txt', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg'].includes(ext)) return 'document';
  return 'unknown';
}

interface SessionOutputState {
  output: string;   // cleaned text displayed so far
}

export default function Terminal() {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionOutputs = useRef<Map<string, SessionOutputState>>(new Map());
  const strippers = useRef<Map<string, ReturnType<typeof createAnsiStripper>>>(new Map());
  const watchedPathRef = useRef<string | null>(null);
  const sessionsRef = useRef<ReturnType<typeof useAppStore.getState>['sessions']>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const [renderTick, setRenderTick] = useState(0); // force re-render for streaming

  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [, setHistoryIndexState] = useState(-1);
  const historyIndexRef = useRef(-1);

  // Store state
  const startupPhase = useAppStore((s) => s.startupPhase);
  const watchedPath = useAppStore((s) => s.watchedPath);
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const activeAgent = useAppStore((s) => s.activeAgent);
  const customAgentCommand = useAppStore((s) => s.customAgentCommand);
  const autoStartAgent = useAppStore((s) => s.autoStartAgent);
  const addSession = useAppStore((s) => s.addSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const updateSession = useAppStore((s) => s.updateSession);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setPreviewFile = useAppStore((s) => s.setPreviewFile);

  watchedPathRef.current = watchedPath;
  sessionsRef.current = sessions;
  activeSessionIdRef.current = activeSessionId;

  // Get or create output state for a session
  const getOutputState = useCallback((sessionId: string): SessionOutputState => {
    let state = sessionOutputs.current.get(sessionId);
    if (!state) {
      state = { output: '' };
      sessionOutputs.current.set(sessionId, state);
    }
    return state;
  }, []);

  // Send input to active session
  const sendInput = useCallback((text: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    writeToSession(sessionId, text).catch(() => {});

    const trimmed = text.trim();
    if (trimmed && trimmed.charCodeAt(0) >= 0x20) {
      setCommandHistory((prev) => {
        const next = [...prev, trimmed];
        return next.length > 100 ? next.slice(-100) : next;
      });
      historyIndexRef.current = -1;
      setHistoryIndexState(-1);
    }
  }, []);

  // Handle input submission
  const handleInputSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue) return;
      sendInput(inputValue + '\r');
      setInputValue('');
    },
    [inputValue, sendInput],
  );

  // Handle input key events
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        sendInput('\x03');
        return;
      }
      if (e.key === 'd' && e.ctrlKey) {
        e.preventDefault();
        sendInput('\x04');
        return;
      }
      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        sendInput('\x0c');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = historyIndexRef.current + 1;
        if (idx < commandHistory.length) {
          historyIndexRef.current = idx;
          setHistoryIndexState(idx);
          setInputValue(commandHistory[commandHistory.length - 1 - idx] || '');
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = historyIndexRef.current - 1;
        if (idx < 0) {
          historyIndexRef.current = -1;
          setHistoryIndexState(-1);
          setInputValue('');
        } else {
          historyIndexRef.current = idx;
          setHistoryIndexState(idx);
          setInputValue(commandHistory[commandHistory.length - 1 - idx] || '');
        }
        return;
      }
      if (e.key === 'Escape') {
        setInputValue('');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        sendInput('\t');
        return;
      }
    },
    [commandHistory, sendInput],
  );

  // Handle link clicks
  const handleLinkClick = useCallback(
    (uri: string) => {
      const isFile =
        /^[a-zA-Z]:[\\/]/.test(uri) ||
        /^\//.test(uri) ||
        /^file:\/\//.test(uri);

      if (isFile) {
        let cleanPath = uri;
        if (cleanPath.startsWith('file://')) {
          cleanPath = decodeURI(cleanPath.replace('file://', ''));
          if (/^\/[a-zA-Z]:/.test(cleanPath)) cleanPath = cleanPath.slice(1);
        }
        const name = cleanPath.split(/[/\\]/).pop() || 'unknown';
        setPreviewFile({ path: cleanPath, name, type: inferFileType(cleanPath) });
      } else if (/^https?:\/\//.test(uri)) {
        const name = uri.replace(/^https?:\/\//, '').split('/')[0] || uri;
        setPreviewFile({ path: uri, name, type: 'html' });
      }
    },
    [setPreviewFile],
  );

  // Focus input when switching sessions
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  // Listen for session events
  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    let rafPending = false;

    const scheduleRender = () => {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          setRenderTick((t) => t + 1);
        });
      }
    };

    onSessionOutput(({ sessionId, data }) => {
      // Get or create stripper for this session
      let stripper = strippers.current.get(sessionId);
      if (!stripper) {
        stripper = createAnsiStripper();
        strippers.current.set(sessionId, stripper);
      }

      const cleaned = stripper(data);
      if (!cleaned) return;

      const state = getOutputState(sessionId);
      state.output += cleaned;
      scheduleRender();
    }).then((fn) => {
      unlistenOutput = fn;
    });

    onSessionExit(({ sessionId }) => {
      const state = getOutputState(sessionId);
      state.output += '\n── 会话结束 ──\n';
      scheduleRender();
      updateSession(sessionId, { status: 'completed' });
    }).then((fn) => {
      unlistenExit = fn;
    });

    return () => {
      if (unlistenOutput) unlistenOutput();
      if (unlistenExit) unlistenExit();
      sessionOutputs.current.clear();
      strippers.current.clear();
    };
  }, [updateSession, getOutputState]);

  // Auto-scroll when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [renderTick]);

  // Auto-create first session
  useEffect(() => {
    if (startupPhase !== 'ready' || !watchedPath) return;
    if (sessionsRef.current.length > 0) return;

    const createFirstSession = async () => {
      const id = crypto.randomUUID();
      const name = '会话 1';

      addSession({ id, name, status: 'starting', isActive: false, createdAt: Date.now() });
      setActiveSession(id);

      try {
        await apiCreateSession(id, watchedPath);
        updateSession(id, { status: 'running' });

        writeToSession(id, `cd "${watchedPath}"\r\n`).catch(() => {});

        if (autoStartAgent) {
          setTimeout(() => {
            let cmd: string;
            switch (activeAgent) {
              case 'claude': cmd = 'claude'; break;
              case 'codex': cmd = 'codex'; break;
              case 'custom': cmd = customAgentCommand || 'claude'; break;
              default: cmd = 'claude';
            }
            writeToSession(id, `${cmd}\r\n`).catch(() => {});
          }, 1000);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Cospace] Failed to create session:', msg);
        updateSession(id, { status: 'completed' });
      }
    };

    createFirstSession();
  }, [startupPhase, watchedPath, activeAgent, customAgentCommand, autoStartAgent, addSession, setActiveSession, updateSession]);

  // Create new session
  const handleNewSession = useCallback(async () => {
    const id = crypto.randomUUID();
    const count = sessionsRef.current.length + 1;
    const name = `会话 ${count}`;
    const wp = watchedPathRef.current;

    addSession({ id, name, status: 'starting', isActive: false, createdAt: Date.now() });
    setActiveSession(id);

    try {
      await apiCreateSession(id, wp || undefined);
      updateSession(id, { status: 'running' });
      if (wp) writeToSession(id, `cd "${wp}"\r\n`).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Cospace] Failed to create session:', msg);
      updateSession(id, { status: 'completed' });
    }
  }, [addSession, setActiveSession, updateSession]);

  // Close session
  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      try { await apiDestroySession(sessionId); } catch { /* ignore */ }
      sessionOutputs.current.delete(sessionId);
      strippers.current.delete(sessionId);
      removeSession(sessionId);
    },
    [removeSession],
  );

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, sessionId: string) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        handleCloseSession(sessionId);
      }
    },
    [handleCloseSession],
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeOutput = activeSessionId ? sessionOutputs.current.get(activeSessionId)?.output || '' : '';

  // Split output into lines for rendering
  const outputLines = activeOutput.split('\n');

  return (
    <div className="flex-1 flex flex-col bg-gray-900">
      {/* Tab bar */}
      <div className="flex bg-gray-900 border-b border-gray-700 overflow-x-auto shrink-0">
        {sessions.map((session) => (
          <div key={session.id} className="relative group" tabIndex={0} onKeyDown={(e) => handleTabKeyDown(e, session.id)}>
            <button
              onClick={() => setActiveSession(session.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-gray-700 whitespace-nowrap transition-colors ${
                session.id === activeSessionId
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  session.status === 'running'
                    ? 'bg-green-500'
                    : session.status === 'starting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-gray-500'
                }`}
              />
              <span className="truncate max-w-[120px]">{session.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseSession(session.id); }}
                className="ml-0.5 text-gray-500 hover:text-red-400 hover:bg-red-900/30 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="关闭会话"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </button>
          </div>
        ))}
        <button
          onClick={handleNewSession}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800/50 border-r border-gray-700 transition-colors"
          title="新建会话"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Output display */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-sm leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center">
              <p>没有活动的会话</p>
              <button
                onClick={handleNewSession}
                className="mt-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              >
                新建会话
              </button>
            </div>
          </div>
        )}
        {outputLines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all text-gray-300 min-h-[1.5rem]">
            <OutputBlock text={line} onLinkClick={handleLinkClick} />
          </div>
        ))}
      </div>

      {/* Input bar */}
      {activeSession && activeSession.status !== 'completed' && (
        <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-2">
          <form onSubmit={handleInputSubmit} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">
              {activeSession.status === 'running' ? (
                <span className="text-green-400">▶</span>
              ) : activeSession.status === 'starting' ? (
                <span className="text-yellow-400 animate-pulse">◉</span>
              ) : null}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="输入命令..."
              className="flex-1 bg-transparent text-gray-200 text-sm outline-none font-mono placeholder-gray-600"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors"
              title="发送 (Enter)"
            >
              ↵
            </button>
            <button
              type="button"
              onClick={() => sendInput('\x03')}
              className="text-xs text-gray-500 hover:text-red-400 px-2 py-0.5 rounded hover:bg-red-900/30 transition-colors"
              title="中断 (Ctrl+C)"
            >
              ■
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
