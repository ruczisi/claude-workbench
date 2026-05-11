# Cospace — AI Agent Workbench

> Tauri 2.x + React + TypeScript desktop app for multi-agent orchestration
> Repo: https://github.com/ruczisi/cospace

---

## Quick Start (on a new machine)

```bash
# Prerequisites: Node.js 18+, Rust 1.77+, Windows SDK
git clone https://github.com/ruczisi/cospace.git
cd cospace
npm install
npx tauri dev     # dev mode with hot reload
npx tauri build   # production exe → src-tauri/target/release/
```

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  App.tsx (layout root, theme, startup overlay)   │
├──────────┬──────────────────────┬────────────────┤
│ Sidebar  │     Terminal         │   Preview      │
│ .tsx     │     .tsx             │   .tsx         │
│          │                      │                │
│ workspace│  chat area │ input   │ markdown/html  │
│ history  │  (scroll)  │ bar     │ image/pdf/vid  │
│ settings │            │         │                │
├──────────┴──────────────────────┴────────────────┤
│  StatusBar.tsx (agent status, task count, path)  │
├──────────────────────────────────────────────────┤
│  appStore.ts (Zustand — single source of truth)  │
│  agentService.ts (Tauri IPC wrappers)            │
└──────────────────────────────────────────────────┘
                          │
            Tauri IPC (invoke / listen)
                          │
┌──────────────────────────────────────────────────┐
│  src-tauri/src/main.rs                          │
│  AppState { watcher, watched_path, sessions }   │
│  SessionSlot { pty_pair, child, writer }         │
│  Commands: create/destroy/write/resize_session   │
│            scan_conversations, start_file_watcher│
│  Events: session-output, session-exit            │
└──────────────────────────────────────────────────┘
```

### Key Patterns

| Pattern | Detail |
|---------|--------|
| **State** | Zustand `useAppStore` — all shared state in `src/stores/appStore.ts` |
| **IPC** | Tauri `invoke()` for commands, `listen()` for events — wrappers in `src/services/agentService.ts` |
| **Sessions** | `HashMap<String, SessionSlot>` in Rust — each session is a PTY pair (shell + stdin/stdout) |
| **Terminal** | Custom chat UI — no xterm.js. PTY output → ANSI strip → classify (content/progress/status/noise) → render bubbles |
| **Preview** | Right panel, reacts to `previewFile` in store, supports markdown/html/image/pdf/video |
| **Persistence** | localStorage keys: `cospace-last-workspace`, `cospace-conversations-path`, `cospace-conversation-renames` |

---

## Project Structure

```
src/
├── App.tsx                    # Root — theme, startup phase, event listeners
├── index.css                  # Tailwind + global scrollbar styles
├── components/
│   ├── Sidebar.tsx            # Workspace picker, conversation list, settings
│   ├── Terminal.tsx           # Chat UI + PTY output classification + input bar
│   ├── Preview.tsx            # Right panel — file/URL preview
│   ├── StatusBar.tsx          # Bottom bar — agent status, progress, task count
│   └── StartupOverlay.tsx     # First-run workspace selection overlay
├── stores/
│   └── appStore.ts            # Zustand store — all app state
├── services/
│   └── agentService.ts        # Tauri IPC wrappers (createSession, writeToSession, etc.)
│
src-tauri/
├── Cargo.toml                 # Rust deps: tauri 2, portable-pty, notify, serde, tokio
├── tauri.conf.json            # Tauri config (window size, permissions, bundle)
└── src/
    └── main.rs                # All backend logic (712 lines)
        ├── AppState           # watcher + watched_path + sessions HashMap
        ├── SessionSlot        # PtyPair + Child + Writer per session
        ├── File watcher       # notify crate, emits "file-change" events
        ├── Session commands   # create/destroy/write_to/resize/list_sessions
        ├── Conversation scan  # scan_conversations → .jsonl files in ~/.claude/projects/
        └── Utilities          # get_default_shell, find_agent_in_path, fmt_time, quick_line_count
```

---

## Terminal Architecture (most complex component)

### Output Pipeline

```
PTY raw data (ANSI escape codes, OMC noise, agent responses)
  │
  ▼
createAnsiStripper()  — strip CSI/OSC/backspace/CR
  │
  ▼
classifyOutput()      — per-line classification
  │
  ├─ progress  ──►  3-dot bouncing animation (3s auto-clear timeout)
  ├─ status    ──►  agentStatusText in store → StatusBar
  ├─ noise     ──►  discarded
  └─ content   ──►  appended to agent message bubble (left-aligned gray)
```

### Classification Rules (Terminal.tsx ~lines 43-90)

- **STATUS_RE**: `[OMC`, `thinking|`, `session:`, `ctx:`, `tokens)`
- **PROGRESS_NOISE_RE**: `Newspapering`, `Sketching`, `Cooked for`, `thinking with`, `thought for`, `xhigh effort`, `↓ tokens`, hook errors
- **Content**: everything not matching above

### Message Model

```typescript
interface Message {
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
}
```

- User submits input → `appendUserMessage()` flushes pending agent output, adds user bubble
- All PTY content between user inputs → accumulates in single agent bubble
- Switching tabs: messages are stored per session in `sessionMessages` ref
- Streaming: raw buffer merged into last agent message on every render tick

---

## Conversation Scanning (main.rs)

- Scans `.jsonl` files in: `~/.claude/projects/`, `~/.claude/`, workspace `.claude/`, workspace root, user-specified paths
- Name: date-based (`2026-05-11T14:30 对话`) — rename in-app by double-clicking conversation name
- Renames persist to localStorage (`cospace-conversation-renames`)
- Only 10 most recent conversations loaded (Rust `truncate(10)`)
- `quick_line_count()` reads 64KB chunks for message count
- No JSONL content parsing (avoided because attachment lines can be 6MB+)

---

## Store (appStore.ts) — Key State

| State | Type | Purpose |
|-------|------|---------|
| `sessions` | `SessionState[]` | Multi-PTY sessions (id, name, status, conversationId) |
| `activeSessionId` | `string \| null` | Currently selected session tab |
| `conversations` | `ClaudeConversation[]` | Scanned conversation history |
| `conversationRenames` | `Record<string, string>` | User-customized names (persisted) |
| `agentStatusText` | `string` | Live status for StatusBar display |
| `previewFile` | `PreviewFile \| null` | Current preview content (triggers Preview.tsx) |
| `startupPhase` | `'loading' \| 'select-workspace' \| 'ready'` | App lifecycle |

---

## Known Limitations & Next Steps

1. **Preview**: Only loads via file picker or link click. No file-watcher-driven auto-refresh.
2. **Conversation resume**: Sends `claude -r <id>` to PTY — assumes Claude Code is the agent.
3. **Multi-agent**: Agent selector in settings, but `claude` is hardcoded in resume logic.
4. **Scrollbar**: Uses WebKit `::-webkit-scrollbar` CSS — no Firefox support.
5. **PTY resize**: `resize_session` command exists but Terminal no longer calls it (chat UI doesn't need it).
6. **ANSI stripping**: Line-based. Complex multi-line ANSI sequences (cursor save/restore) may leave artifacts.

---

## Build & Test

```bash
npm run build              # TypeScript check + Vite build
cd src-tauri && cargo check # Rust check
npx tauri dev               # Full app with hot reload
npx tauri build             # Production exe + MSI/NSIS installers
```

Output:
- `src-tauri/target/release/cospace.exe` (portable)
- `src-tauri/target/release/bundle/nsis/Cospace_0.1.0_x64-setup.exe` (installer)
- `src-tauri/target/release/bundle/msi/Cospace_0.1.0_x64_en-US.msi` (MSI)

---

*Last updated: 2026-05-11 | Cospace v0.1.0*
