import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createSession as apiCreateSession,
  destroySession as apiDestroySession,
  writeToSession,
  onSessionOutput,
  onSessionExit,
} from '../services/agentService';
import { useAppStore } from '../stores/appStore';

// ===== ANSI stripping =====

const CSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;
const OSC_RE = /\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g;
const SIMPLE_ESC_RE = /\x1b[^[\]]./g;

function stripAnsi(text: string): string {
  return text
    .replace(OSC_RE, '')
    .replace(CSI_RE, '')
    .replace(SIMPLE_ESC_RE, '')
    .replace(/.\x08/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function createAnsiStripper() {
  let buf = '';
  return function feed(chunk: string): string {
    buf += chunk;
    const lastEsc = buf.lastIndexOf('\x1b');
    if (lastEsc >= 0 && lastEsc >= buf.length - 10) {
      const safe = buf.slice(0, lastEsc);
      buf = buf.slice(lastEsc);
      return stripAnsi(safe);
    }
    const cleaned = stripAnsi(buf);
    buf = '';
    return cleaned;
  };
}

// ===== Output classification =====

type LineType =
  | { type: 'progress'; text?: string }
  | { type: 'status'; text: string }
  | { type: 'noise' }
  | { type: 'content'; text: string };

// Status → status bar (agent metadata)
const STATUS_RE = /(\[OMC|thinking\s*\|)|(session:\d+m)|(ctx:\d+%)|(tokens?\))/i;

// Progress/noise → animation or discard (OMC/Claude Code internal chatter)
const PROGRESS_NOISE_RE = /(Newspapering|Sketching|Cooked for|thinking with|thought for|still thinking|running.*hook|stop hook|Scanning|Loading|fetching|downloading|Brewed for|Press Ctrl-C|hook.*error|hook.*failed|jq:.*not found|\bxhigh effort\b|\bhigh effort\b|↓ \d+ tokens?|thought for \d+s)/i;

function classifyLine(line: string): LineType {
  const trimmed = line.trim();
  if (!trimmed) return { type: 'noise' };

  // Divider / prompt lines
  if (/^[\s─━]+$/.test(trimmed)) return { type: 'noise' };
  if (/^\s*❯\s*$/.test(trimmed)) return { type: 'noise' };
  if (/^[\d\s]{5,}$/.test(trimmed)) return { type: 'noise' };

  // Symbol-only or symbol+number lines (OMC progress)
  if (/^[✢·\*✶✻✽⏺⏵⎿\s\d]+$/.test(trimmed)) return { type: 'noise' };

  // Lines dominated by symbols mixed with status junk
  const alphaOnly = trimmed.replace(/[✢·\*✶✻✽⏺⏵⎿\s\d\.\,\;\:\!\?]+/g, '');
  if (alphaOnly.length < 3) return { type: 'noise' };
  if (trimmed.length > 10 && alphaOnly.length < 5) return { type: 'noise' };

  // Status → status bar
  if (STATUS_RE.test(trimmed)) return { type: 'status', text: trimmed };

  // Progress/noise → animate or discard
  if (PROGRESS_NOISE_RE.test(trimmed)) return { type: 'progress' };

  // Lines that start with symbol then noise word
  if (/^[✢·\*✶✻✽⏺⏵⎿\s\d]+(thinking|Sketching|Cooked|Newspapering|Brewed)/i.test(trimmed)) return { type: 'progress' };

  // Everything else → content
  return { type: 'content', text: trimmed };
}

function classifyOutput(text: string): {
  content: string[];
  status: string | null;
  hasProgress: boolean;
} {
  const content: string[] = [];
  let status: string | null = null;
  let hasProgress = false;

  for (const line of text.split('\n')) {
    const result = classifyLine(line);
    switch (result.type) {
      case 'content':
        content.push(result.text);
        break;
      case 'status':
        status = result.text;
        break;
      case 'progress':
        hasProgress = true;
        break;
      case 'noise':
        break;
    }
  }

  // Collapse consecutive blank lines in content
  const cleaned: string[] = [];
  let prevBlank = false;
  for (const line of content) {
    if (line.trim() === '') {
      if (!prevBlank) cleaned.push(line);
      prevBlank = true;
    } else {
      prevBlank = false;
      cleaned.push(line);
    }
  }
  while (cleaned.length > 0 && cleaned[0].trim() === '') cleaned.shift();
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();

  return { content: cleaned, status, hasProgress };
}

// ===== Message types =====

interface Message {
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
}

// ===== Link component =====

function detectLinks(text: string): Array<{ start: number; end: number; url: string }> {
  const links: Array<{ start: number; end: number; url: string }> = [];
  const re = /https?:\/\/[^\s<>")\]]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    links.push({ start: m.index, end: m.index + m[0].length, url: m[0] });
  }
  return links;
}

function RichText({ text, onLinkClick }: { text: string; onLinkClick: (url: string) => void }) {
  const links = detectLinks(text);
  if (links.length === 0) return <>{text}</>;

  const parts: Array<{ type: 'text' | 'link'; content: string; url?: string }> = [];
  let lastEnd = 0;
  for (const link of links) {
    if (link.start > lastEnd) parts.push({ type: 'text', content: text.slice(lastEnd, link.start) });
    parts.push({ type: 'link', content: link.url, url: link.url });
    lastEnd = link.end;
  }
  if (lastEnd < text.length) parts.push({ type: 'text', content: text.slice(lastEnd) });

  return (
    <>
      {parts.map((p, i) =>
        p.type === 'link' ? (
          <button key={i} onClick={() => onLinkClick(p.url!)} className="text-blue-400 hover:text-blue-300 underline">
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

export default function Terminal() {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionOutputs = useRef<Map<string, string>>(new Map());
  const sessionMessages = useRef<Map<string, Message[]>>(new Map());
  const sessionProgress = useRef<Map<string, boolean>>(new Map());
  const progressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const strippers = useRef<Map<string, ReturnType<typeof createAnsiStripper>>>(new Map());
  const watchedPathRef = useRef<string | null>(null);
  const sessionsRef = useRef<ReturnType<typeof useAppStore.getState>['sessions']>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const [renderTick, setRenderTick] = useState(0);

  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const historyIndexRef = useRef(-1);

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
  const setAgentStatusText = useAppStore((s) => s.setAgentStatusText);

  watchedPathRef.current = watchedPath;
  sessionsRef.current = sessions;
  activeSessionIdRef.current = activeSessionId;

  const getMessages = useCallback((sessionId: string): Message[] => {
    let msgs = sessionMessages.current.get(sessionId);
    if (!msgs) { msgs = []; sessionMessages.current.set(sessionId, msgs); }
    return msgs;
  }, []);

  const flushAgentOutput = useCallback((sessionId: string) => {
    const raw = sessionOutputs.current.get(sessionId) || '';
    sessionOutputs.current.set(sessionId, '');
    sessionProgress.current.set(sessionId, false);

    const { content } = classifyOutput(raw);
    const filtered = content.join('\n');
    if (!filtered.trim()) return;

    const msgs = getMessages(sessionId);
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    if (lastMsg && lastMsg.role === 'agent') {
      lastMsg.text = lastMsg.text ? lastMsg.text + '\n' + filtered : filtered;
    } else {
      msgs.push({ role: 'agent', text: filtered, timestamp: Date.now() });
    }
  }, [getMessages]);

  const appendUserMessage = useCallback((sessionId: string, text: string) => {
    flushAgentOutput(sessionId);
    const msgs = getMessages(sessionId);
    msgs.push({ role: 'user', text, timestamp: Date.now() });
  }, [getMessages, flushAgentOutput]);

  const appendSystemMessage = useCallback((sessionId: string, text: string) => {
    const msgs = getMessages(sessionId);
    msgs.push({ role: 'system', text, timestamp: Date.now() });
  }, [getMessages]);

  // Send input to PTY
  const sendInput = useCallback((text: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    writeToSession(sessionId, text).catch(() => {});
    const trimmed = text.trim();
    if (trimmed && trimmed.charCodeAt(0) >= 0x20) {
      setCommandHistory((prev) => { const next = [...prev, trimmed]; return next.length > 100 ? next.slice(-100) : next; });
      historyIndexRef.current = -1;
    }
  }, []);

  const handleInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const sessionId = activeSessionIdRef.current;
    if (!inputValue || !sessionId) return;
    appendUserMessage(sessionId, inputValue);
    sendInput(inputValue + '\r');
    setInputValue('');
  }, [inputValue, sendInput, appendUserMessage]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); sendInput('\x03'); return; }
    if (e.key === 'd' && e.ctrlKey) { e.preventDefault(); sendInput('\x04'); return; }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); sendInput('\x0c'); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = historyIndexRef.current + 1;
      if (idx < commandHistory.length) {
        historyIndexRef.current = idx;
        setInputValue(commandHistory[commandHistory.length - 1 - idx] || '');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = historyIndexRef.current - 1;
      if (idx < 0) { historyIndexRef.current = -1; setInputValue(''); }
      else { historyIndexRef.current = idx; setInputValue(commandHistory[commandHistory.length - 1 - idx] || ''); }
      return;
    }
    if (e.key === 'Escape') { setInputValue(''); return; }
    if (e.key === 'Tab') { e.preventDefault(); sendInput('\t'); return; }
  }, [commandHistory, sendInput]);

  const handleLinkClick = useCallback((uri: string) => {
    if (/^https?:\/\//.test(uri)) {
      setPreviewFile({ path: uri, name: uri.replace(/^https?:\/\//, '').split('/')[0] || uri, type: 'html' });
    }
  }, [setPreviewFile]);

  useEffect(() => { inputRef.current?.focus(); }, [activeSessionId]);

  // ===== Core session event listeners =====
  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    let rafPending = false;

    const scheduleRender = () => {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; setRenderTick((t) => t + 1); });
      }
    };

    onSessionOutput(({ sessionId, data }) => {
      let stripper = strippers.current.get(sessionId);
      if (!stripper) { stripper = createAnsiStripper(); strippers.current.set(sessionId, stripper); }
      const cleaned = stripper(data);
      if (!cleaned) return;

      // Classify this chunk: extract status, detect progress
      const { status, hasProgress } = classifyOutput(cleaned);

      // Route status to status bar
      if (status) setAgentStatusText(status);
      if (hasProgress) {
        sessionProgress.current.set(sessionId, true);
        // Auto-clear progress after 3s idle
        const existing = progressTimers.current.get(sessionId);
        if (existing) clearTimeout(existing);
        progressTimers.current.set(sessionId, setTimeout(() => {
          sessionProgress.current.set(sessionId, false);
          scheduleRender();
        }, 3000));
      }

      // Accumulate raw content for the chat bubble (filtered on flush)
      const prev = sessionOutputs.current.get(sessionId) || '';
      sessionOutputs.current.set(sessionId, prev + cleaned);

      scheduleRender();
    }).then((fn) => { unlistenOutput = fn; });

    onSessionExit(({ sessionId }) => {
      setAgentStatusText('');
      sessionProgress.current.set(sessionId, false);
      flushAgentOutput(sessionId);
      appendSystemMessage(sessionId, '会话已结束');
      scheduleRender();
      updateSession(sessionId, { status: 'completed' });
    }).then((fn) => { unlistenExit = fn; });

    return () => {
      if (unlistenOutput) unlistenOutput();
      if (unlistenExit) unlistenExit();
      sessionOutputs.current.clear();
      sessionMessages.current.clear();
      sessionProgress.current.clear();
      progressTimers.current.forEach((t) => clearTimeout(t));
      progressTimers.current.clear();
      strippers.current.clear();
    };
  }, [updateSession, flushAgentOutput, appendSystemMessage, setAgentStatusText]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [renderTick]);

  // ===== Auto-create first session =====
  useEffect(() => {
    if (startupPhase !== 'ready' || !watchedPath) return;
    if (sessionsRef.current.length > 0) return;
    (async () => {
      const id = crypto.randomUUID();
      addSession({ id, name: '会话 1', status: 'starting', isActive: false, createdAt: Date.now() });
      setActiveSession(id);
      try {
        await apiCreateSession(id, watchedPath);
        updateSession(id, { status: 'running' });
        writeToSession(id, `cd "${watchedPath}"\r\n`).catch(() => {});
        if (autoStartAgent) {
          setTimeout(() => {
            let cmd: string;
            switch (activeAgent) { case 'claude': cmd = 'claude'; break; case 'codex': cmd = 'codex'; break; case 'custom': cmd = customAgentCommand || 'claude'; break; default: cmd = 'claude'; }
            writeToSession(id, `${cmd}\r\n`).catch(() => {});
          }, 1000);
        }
      } catch (err: unknown) { updateSession(id, { status: 'completed' }); }
    })();
  }, [startupPhase, watchedPath, activeAgent, customAgentCommand, autoStartAgent, addSession, setActiveSession, updateSession]);

  const handleNewSession = useCallback(async () => {
    const id = crypto.randomUUID();
    const count = sessionsRef.current.length + 1;
    const wp = watchedPathRef.current;
    addSession({ id, name: `会话 ${count}`, status: 'starting', isActive: false, createdAt: Date.now() });
    setActiveSession(id);
    try {
      await apiCreateSession(id, wp || undefined);
      updateSession(id, { status: 'running' });
      if (wp) writeToSession(id, `cd "${wp}"\r\n`).catch(() => {});
    } catch (err: unknown) { updateSession(id, { status: 'completed' }); }
  }, [addSession, setActiveSession, updateSession]);

  const handleCloseSession = useCallback(async (sessionId: string) => {
    try { await apiDestroySession(sessionId); } catch { /* ignore */ }
    sessionOutputs.current.delete(sessionId);
    sessionMessages.current.delete(sessionId);
    sessionProgress.current.delete(sessionId);
    strippers.current.delete(sessionId);
    removeSession(sessionId);
  }, [removeSession]);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, sessionId: string) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); handleCloseSession(sessionId); }
  }, [handleCloseSession]);

  // ===== Render helpers =====

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSessionId ? (sessionMessages.current.get(activeSessionId) || []) : [];
  const showProgress = activeSessionId ? sessionProgress.current.get(activeSessionId) || false : false;

  // Merge buffered raw into last agent message for streaming preview
  const pendingRaw = activeSessionId ? (sessionOutputs.current.get(activeSessionId) || '') : '';
  const displayMessages = [...messages];
  if (pendingRaw.trim()) {
    const { content } = classifyOutput(pendingRaw);
    const filtered = content.join('\n');
    if (filtered.trim()) {
      const last = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null;
      if (last && last.role === 'agent') {
        displayMessages[displayMessages.length - 1] = { ...last, text: last.text ? last.text + '\n' + filtered : filtered };
      } else {
        displayMessages.push({ role: 'agent', text: filtered, timestamp: Date.now() });
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900">
      {/* Tab bar */}
      <div className="flex bg-gray-900 border-b border-gray-700 overflow-x-auto shrink-0">
        {sessions.map((session) => (
          <div key={session.id} className="relative group" tabIndex={0} onKeyDown={(e) => handleTabKeyDown(e, session.id)}>
            <button
              onClick={() => setActiveSession(session.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-gray-700 whitespace-nowrap transition-colors ${
                session.id === activeSessionId ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                session.status === 'running' ? 'bg-green-500' : session.status === 'starting' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'
              }`} />
              <span className="truncate max-w-[120px]">{session.name}</span>
              <button onClick={(e) => { e.stopPropagation(); handleCloseSession(session.id); }}
                className="ml-0.5 text-gray-500 hover:text-red-400 hover:bg-red-900/30 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" title="关闭会话">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </button>
          </div>
        ))}
        <button onClick={handleNewSession} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800/50 border-r border-gray-700 transition-colors" title="新建会话">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      {/* Chat area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        onClick={() => inputRef.current?.focus()}
      >
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center">
              <p>没有活动的会话</p>
              <button onClick={handleNewSession} className="mt-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors">新建会话</button>
            </div>
          </div>
        )}

        {displayMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-primary-600 text-white'
                : msg.role === 'system'
                ? 'bg-gray-800 text-gray-500 text-xs italic'
                : 'bg-gray-800 text-gray-200'
            }`}>
              <div className="whitespace-pre-wrap break-words">
                <RichText text={msg.text} onLinkClick={handleLinkClick} />
              </div>
              {msg.role !== 'system' && (
                <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-primary-200' : 'text-gray-600'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Inline progress indicator */}
        {showProgress && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="text-xs text-gray-500">处理中...</span>
            </div>
          </div>
        )}

        {/* Bottom anchor for auto-scroll */}
        <div ref={(el) => { if (el) el.scrollIntoView({ behavior: 'smooth' }); }} />
      </div>

      {/* Input bar */}
      {activeSession && activeSession.status !== 'completed' && (
        <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-2">
          <form onSubmit={handleInputSubmit} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">
              {activeSession.status === 'running' ? <span className="text-green-400">▶</span> : <span className="text-yellow-400 animate-pulse">◉</span>}
            </span>
            <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown} placeholder="输入消息..." className="flex-1 bg-transparent text-gray-200 text-sm outline-none font-mono placeholder-gray-600"
              autoFocus autoComplete="off" spellCheck={false} />
            <button type="submit" className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors" title="发送 (Enter)">↵</button>
            <button type="button" onClick={() => sendInput('\x03')} className="text-xs text-gray-500 hover:text-red-400 px-2 py-0.5 rounded hover:bg-red-900/30 transition-colors" title="中断 (Ctrl+C)">■</button>
          </form>
        </div>
      )}
    </div>
  );
}
