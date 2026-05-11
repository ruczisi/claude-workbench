import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface ClaudeConversation {
  id: string;
  name: string;
  updated_at: string;
  message_count: number;
}

export interface SessionOutput {
  sessionId: string;
  data: string;
}

export interface SessionExit {
  sessionId: string;
  code: number;
}

// ===== Session Management =====

export async function createSession(
  sessionId: string,
  workingDir?: string,
): Promise<string> {
  return invoke('create_session', {
    sessionId,
    workingDir: workingDir || null,
  });
}

export async function destroySession(sessionId: string): Promise<string> {
  return invoke('destroy_session', { sessionId });
}

export async function writeToSession(
  sessionId: string,
  data: string,
): Promise<void> {
  return invoke('write_to_session', { sessionId, data });
}

export async function listSessions(): Promise<string[]> {
  return invoke('list_sessions');
}

export async function resizeSession(
  sessionId: string,
  rows: number,
  cols: number,
): Promise<void> {
  return invoke('resize_session', { sessionId, rows, cols });
}

// ===== Conversation Scanning =====

export async function scanConversations(
  workspacePath?: string,
  additionalPaths: string[] = [],
): Promise<ClaudeConversation[]> {
  return invoke('scan_conversations', {
    workspacePath: workspacePath || null,
    additionalPaths,
  });
}

// ===== Event Listeners =====

export function onSessionOutput(
  callback: (data: SessionOutput) => void,
): Promise<UnlistenFn> {
  return listen<{ session_id: string; data: string }>('session-output', (event) => {
    callback({
      sessionId: event.payload.session_id,
      data: event.payload.data,
    });
  });
}

export function onSessionExit(
  callback: (data: SessionExit) => void,
): Promise<UnlistenFn> {
  return listen<{ session_id: string; code: number }>('session-exit', (event) => {
    callback({
      sessionId: event.payload.session_id,
      code: event.payload.code,
    });
  });
}
