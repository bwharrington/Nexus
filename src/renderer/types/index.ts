// Re-export all types
export * from './global.d';
export * from './diffTypes';

// File type for different document formats
export type FileType = 'markdown' | 'rst' | 'text' | 'unknown';

// File interface for editor state
export interface IFile {
  id: string;
  path: string | null; // null for untitled files
  name: string; // "Untitled-1", "README.md"
  content: string;
  originalContent: string; // Track original content for dirty detection
  isDirty: boolean;
  viewMode: 'edit' | 'preview' | 'diff';
  lineEnding: 'CRLF' | 'LF';
  undoStack: string[];
  redoStack: string[];
  undoStackPointer: number;
  scrollPosition: number; // Track scroll position when switching modes
  fileType: FileType; // Type of file for rendering
  sourceFileId?: string; // For diff tabs: ID of the original file being diffed
  diffSession?: import('./diffTypes').DiffSession; // For diff tabs: the diff session data
  pendingExternalPath?: string; // set when user declines external reload in prompt mode
}

// Editor state interface
export interface EditorState {
  openFiles: IFile[];
  activeFileId: string | null;
  untitledCounter: number;
  config: IConfig;
  notifications: Notification[];
}

// Notification interface
export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface Notification {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  action?: NotificationAction;
  variant?: 'go-deeper';
}

// Import IConfig from global
import type { IConfig } from './global.d';
export type { IConfig };
