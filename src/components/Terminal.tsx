import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  createSession as apiCreateSession,
  destroySession as apiDestroySession,
  writeToSession,
  resizeSession,
  onSessionOutput,
  onSessionExit,
} from '../services/agentService';
import { useAppStore, PreviewFile } from '../stores/appStore';

interface XTermInstance {
  xterm: XTerm;
  fitAddon: FitAddon;
  div: HTMLDivElement | null;
}

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

export default function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xtermInstances = useRef<Map<string, XTermInstance>>(new Map());
  const initializedSessions = useRef<Set<string>>(new Set());
  const watchedPathRef = useRef<string | null>(null);
  const sessionsRef = useRef<ReturnType<typeof useAppStore.getState>['sessions']>([]);
  const activeSessionIdRef = useRef<string | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [, setHistoryIndex] = useState(-1);

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

  // Keep refs in sync
  watchedPathRef.current = watchedPath;
  sessionsRef.current = sessions;
  activeSessionIdRef.current = activeSessionId;

  // XTerm theme config
  const theme = {
    background: '#1f2937',
    foreground: '#e5e7eb',
    cursor: '#1f2937',
    cursorAccent: '#1f2937',
    selectionBackground: '#3b82f680',
    black: '#1f2937',
    red: '#ef4444',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#e5e7eb',
    brightBlack: '#4b5563',
    brightRed: '#f87171',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#f9fafb',
  };
  const fontFamily = 'Consolas, "Courier New", monospace';
  const fontSize = 14;

  // Handle link clicks from terminal — open in preview panel
  const handleLinkClick = useCallback(
    (_event: MouseEvent, uri: string) => {
      try {
        const isFile =
          /^[a-zA-Z]:[\\/]/.test(uri) ||
          /^\//.test(uri) ||
          /^file:\/\//.test(uri);

        if (isFile) {
          let cleanPath = uri;
          if (cleanPath.startsWith('file://')) {
            cleanPath = decodeURI(cleanPath.replace('file://', ''));
            if (/^\/[a-zA-Z]:/.test(cleanPath)) {
              cleanPath = cleanPath.slice(1);
            }
          }
          const name = cleanPath.split(/[/\\]/).pop() || 'unknown';
          setPreviewFile({ path: cleanPath, name, type: inferFileType(cleanPath) });
        } else if (/^https?:\/\//.test(uri)) {
          const name = uri.replace(/^https?:\/\//, '').split('/')[0] || uri;
          setPreviewFile({ path: uri, name, type: 'html' });
        }
      } catch {
        // ignore
      }
    },
    [setPreviewFile],
  );

  // Initialize xterm for a session — output only, no input
  const registerTerminalDiv = useCallback(
    (sessionId: string, div: HTMLDivElement | null) => {
      if (!div) return;

      const existing = xtermInstances.current.get(sessionId);
      if (existing) {
        existing.div = div;
        return;
      }

      if (initializedSessions.current.has(sessionId)) return;
      initializedSessions.current.add(sessionId);

      const xterm = new XTerm({
        theme,
        fontFamily,
        fontSize,
        cursorBlink: false,
        cursorStyle: 'block',
        scrollback: 10000,
        convertEol: true,
        disableStdin: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon((_event, uri) => {
        handleLinkClick(_event, uri);
      });

      xterm.loadAddon(fitAddon);
      xterm.loadAddon(webLinksAddon);
      xterm.open(div);
      fitAddon.fit();

      xtermInstances.current.set(sessionId, { xterm, fitAddon, div });

      xterm.writeln('\x1b[36m■ Cospace Terminal\x1b[0m');
      xterm.writeln(`\x1b[90m  Session: ${sessionId.substring(0, 8)}...\x1b[0m`);
      xterm.writeln('');

      setTimeout(() => {
        try { fitAddon.fit(); } catch { /* ignore */ }
      }, 50);
    },
    [handleLinkClick],
  );

  // Fit active terminal and signal PTY resize
  const fitActiveTerminal = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    const instance = xtermInstances.current.get(sessionId);
    if (!instance) return;

    try {
      instance.fitAddon.fit();
      const rows = instance.xterm.rows;
      const cols = instance.xterm.cols;
      if (rows > 0 && cols > 0) {
        resizeSession(sessionId, rows, cols).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, []);

  // Clean up xterm instance
  const cleanupXTerm = useCallback((sessionId: string) => {
    const instance = xtermInstances.current.get(sessionId);
    if (instance) {
      instance.xterm.dispose();
      xtermInstances.current.delete(sessionId);
      initializedSessions.current.delete(sessionId);
    }
  }, []);

  // Send input to active session
  const sendInput = useCallback(
    (text: string) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;

      writeToSession(sessionId, text).catch(() => {});

      // Record history
      const trimmed = text.trim();
      // Only record printable commands (not control chars) in history
      if (trimmed && trimmed.charCodeAt(0) >= 0x20) {
        setCommandHistory((prev) => {
          const next = [...prev, trimmed];
          return next.length > 100 ? next.slice(-100) : next;
        });
        setHistoryIndex(-1);
      }
    },
    [],
  );

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
      // Ctrl+C → send interrupt
      if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        sendInput('\x03');
        return;
      }
      // Ctrl+D → send EOF
      if (e.key === 'd' && e.ctrlKey) {
        e.preventDefault();
        sendInput('\x04');
        return;
      }
      // Ctrl+L → clear screen
      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        sendInput('\x0c');
        return;
      }
      // Arrow Up → previous command
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHistoryIndex((prev) => {
          const next = prev + 1;
          if (next >= commandHistory.length) return prev;
          setInputValue(commandHistory[commandHistory.length - 1 - next] || '');
          return next;
        });
        return;
      }
      // Arrow Down → next command
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHistoryIndex((prev) => {
          if (prev <= 0) {
            setInputValue('');
            return -1;
          }
          const next = prev - 1;
          setInputValue(commandHistory[commandHistory.length - 1 - next] || '');
          return next;
        });
        return;
      }
      // Escape → clear input
      if (e.key === 'Escape') {
        setInputValue('');
        return;
      }
      // Tab → send tab character
      if (e.key === 'Tab') {
        e.preventDefault();
        sendInput('\t');
        return;
      }
    },
    [commandHistory, sendInput],
  );

  // Focus input when switching sessions
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  // Click on terminal display → focus input
  const handleDisplayClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Listen for session events
  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    onSessionOutput(({ sessionId, data }) => {
      const instance = xtermInstances.current.get(sessionId);
      if (instance) {
        instance.xterm.write(data);
      }
    }).then((fn) => {
      unlistenOutput = fn;
    });

    onSessionExit(({ sessionId }) => {
      const instance = xtermInstances.current.get(sessionId);
      if (instance) {
        instance.xterm.writeln('\r\n\x1b[90m[Session ended]\x1b[0m');
      }
      updateSession(sessionId, { status: 'completed' });
    }).then((fn) => {
      unlistenExit = fn;
    });

    const handleWindowResize = () => {
      xtermInstances.current.forEach((inst) => {
        try { inst.fitAddon.fit(); } catch { /* ignore */ }
      });
      fitActiveTerminal();
    };
    window.addEventListener('resize', handleWindowResize);

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => fitActiveTerminal());
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (unlistenOutput) unlistenOutput();
      if (unlistenExit) unlistenExit();
      window.removeEventListener('resize', handleWindowResize);
      if (resizeObserver) resizeObserver.disconnect();
      xtermInstances.current.forEach((inst) => inst.xterm.dispose());
      xtermInstances.current.clear();
      initializedSessions.current.clear();
    };
  }, [updateSession, fitActiveTerminal]);

  // Fit active xterm when switching sessions
  useEffect(() => {
    if (activeSessionId) {
      const instance = xtermInstances.current.get(activeSessionId);
      if (instance) {
        setTimeout(() => {
          try {
            instance.fitAddon.fit();
            instance.xterm.scrollToBottom();
          } catch {
            // ignore
          }
        }, 50);
      }
    }
  }, [activeSessionId]);

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
        const instance = xtermInstances.current.get(id);
        if (instance) {
          instance.xterm.writeln(`\x1b[31mFailed: ${msg}\x1b[0m`);
        }
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
      if (wp) {
        writeToSession(id, `cd "${wp}"\r\n`).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Cospace] Failed to create session:', msg);
      updateSession(id, { status: 'completed' });
      const instance = xtermInstances.current.get(id);
      if (instance) {
        instance.xterm.writeln(`\x1b[31mFailed: ${msg}\x1b[0m`);
      }
    }
  }, [addSession, setActiveSession, updateSession]);

  // Close a session
  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      try { await apiDestroySession(sessionId); } catch { /* ignore */ }
      cleanupXTerm(sessionId);
      removeSession(sessionId);
    },
    [cleanupXTerm, removeSession],
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

  return (
    <div className="flex-1 flex flex-col bg-gray-800">
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

      {/* Terminal display area */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative" onClick={handleDisplayClick}>
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
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
        {sessions.map((session) => (
          <div
            key={session.id}
            ref={(el) => registerTerminalDiv(session.id, el)}
            className="p-2"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: session.id === activeSessionId ? 1 : 0,
              pointerEvents: 'none',
            }}
          />
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
