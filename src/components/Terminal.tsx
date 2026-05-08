import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { onAgentOutput, writeToAgent } from '../services/agentService';

export default function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Initialize xterm
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
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Welcome message
    xterm.writeln('\x1b[32m╔══════════════════════════════════════════════════════════╗\x1b[0m');
    xterm.writeln('\x1b[32m║\x1b[0m   \x1b[1;36mCospace\x1b[0m - AI Agent Terminal                    \x1b[32m║\x1b[0m');
    xterm.writeln('\x1b[32m╠══════════════════════════════════════════════════════════╣\x1b[0m');
    xterm.writeln('\x1b[32m║\x1b[0m   Type \x1b[33mclaude\x1b[0m to start, or enter any command.       \x1b[32m║\x1b[0m');
    xterm.writeln('\x1b[32m║\x1b[0m   Press \x1b[33mCtrl+C\x1b[0m to interrupt, \x1b[33mCtrl+L\x1b[0m to clear.     \x1b[32m║\x1b[0m');
    xterm.writeln('\x1b[32m╚══════════════════════════════════════════════════════════╝\x1b[0m');
    xterm.writeln('');
    xterm.write('\x1b[36m$\x1b[0m ');

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

    // Send keyboard input to agent
    xterm.onData((data) => {
      writeToAgent(data).catch(() => {
        // Agent not running, ignore
      });
    });

    return () => {
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
      <div ref={terminalRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
}
