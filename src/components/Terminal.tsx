import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { onAgentExit, onAgentOutput, startShell, writeToAgent } from '../services/agentService';

export default function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Initialize xterm with all features enabled
    const xterm = new XTerm({
      theme: {
        background: '#1f2937',
        foreground: '#e5e7eb',
        cursor: '#10b981',
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
      },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      convertEol: true,
      macOptionIsMeta: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // Open terminal
    xterm.open(terminalRef.current);
    fitAddon.fit();

    // Focus terminal
    xterm.focus();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Start system shell for a fully functional terminal
    startShell().catch((err) => {
      console.error('[Cospace] Failed to start shell:', err);
      xterm.writeln('\x1b[31mFailed to start shell. Please check the console.\x1b[0m');
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    // Subscribe to Agent output
    let unlistenAgentOutput: (() => void) | null = null;
    onAgentOutput((line) => {
      if (xtermRef.current) {
        xtermRef.current.write(line);
      }
    }).then((unlisten) => {
      unlistenAgentOutput = unlisten;
    });

    // Subscribe to Agent/Shell exit to restart shell if needed
    let unlistenExit: (() => void) | null = null;
    onAgentExit(() => {
      // Restart shell after a brief delay to avoid racing with agent startup
      setTimeout(() => {
        startShell().catch(() => {
          // Agent may have started, that's fine
        });
      }, 300);
    }).then((unlisten) => {
      unlistenExit = unlisten;
    });

    // Handle terminal input - forward to shell/agent
    xterm.onData((data) => {
      writeToAgent(data).catch(() => {
        // No process running - that's ok
      });
    });

    return () => {
      if (unlistenExit) unlistenExit();
      if (unlistenAgentOutput) unlistenAgentOutput();
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
      xtermRef.current = null;
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-gray-800">
      <div className="px-3 py-1 bg-gray-900 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400">Terminal</span>
        <span className="text-xs text-gray-500">bash</span>
      </div>
      <div ref={terminalRef} className="flex-1 p-2 overflow-hidden" style={{ cursor: 'text' }} tabIndex={0} />
    </div>
  );
}
