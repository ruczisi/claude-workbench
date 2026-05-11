import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export type AgentType = 'claude' | 'codex' | 'opencode' | 'custom';

export interface AgentConfig {
  agent_type: AgentType;
  command: string;
  args: string[];
  cwd?: string;
}

export type AgentStatus = 'stopped' | 'starting' | 'running' | { error: string };

export async function findAgentInPath(agentType: AgentType): Promise<string | null> {
  return invoke('find_agent_in_path', { agentType });
}

export async function startAgent(config: AgentConfig): Promise<void> {
  return invoke('start_agent', { config });
}

export async function stopAgent(): Promise<void> {
  return invoke('stop_agent');
}

export async function getAgentStatus(): Promise<AgentStatus> {
  return invoke('get_agent_status');
}

export async function writeToAgent(data: string): Promise<void> {
  return invoke('write_to_agent', { data });
}

export async function startShell(cwd?: string): Promise<void> {
  return invoke('start_shell', { workingDir: cwd || null });
}

export function onAgentOutput(callback: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>('agent-output', (event) => {
    callback(event.payload);
  });
}

export function onAgentError(callback: (error: string) => void): Promise<UnlistenFn> {
  return listen<string>('agent-error', (event) => {
    callback(event.payload);
  });
}

export function onAgentExit(callback: (code: number) => void): Promise<UnlistenFn> {
  return listen<number>('agent-exit', (event) => {
    callback(event.payload);
  });
}
