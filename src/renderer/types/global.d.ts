// Type definitions for the Electron API exposed via preload script

export type LineEnding = 'CRLF' | 'LF';
export type ViewMode = 'edit' | 'preview' | 'diff';
export type AIChatMode = 'chat' | 'edit' | 'research' | 'techresearch';

export interface IFileReference {
  fileName: string;
  mode: ViewMode;
}

export interface FileOpenResult {
  filePath: string;
  content: string;
  lineEnding: LineEnding;
}

export interface FileSaveResult {
  success: boolean;
  filePath: string;
  error?: string;
}

export interface FileAttachmentResult {
  type: 'image' | 'text' | 'unsupported' | 'error';
  mimeType?: string;
  data?: string;
  size?: number;
  error?: string;
}

export interface AIModelConfig {
  enabled: boolean;
}

export interface AIModelsConfig {
  xai?: Record<string, AIModelConfig>;
  claude?: Record<string, AIModelConfig>;
  openai?: Record<string, AIModelConfig>;
  gemini?: Record<string, AIModelConfig>;
}

export interface IConfig {
  recentFiles: IFileReference[];
  openFiles: IFileReference[];
  windowBounds?: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
  defaultLineEnding: LineEnding;
  devToolsOpen?: boolean;
  aiModels?: AIModelsConfig;
  silentFileUpdates?: boolean;
  imageSaveFolder?: string;
  aiChatDockWidth?: number;
  aiChatMode?: AIChatMode;
  aiChatModel?: string;
  aiResearchDepthLevel?: string;
  aiTechResearchDepthLevel?: string;
}

export interface ConfirmCloseResult {
  action: 'save' | 'discard' | 'cancel';
}

// AI Chat types
export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIModelOption {
  id: string;
  displayName: string;
}

export interface AIProviderStatus {
  enabled: boolean;
  status: 'success' | 'error' | 'unchecked';
}

export interface AIProviderStatuses {
  xai: AIProviderStatus;
  claude: AIProviderStatus;
  openai: AIProviderStatus;
  gemini: AIProviderStatus;
}

export interface AIChatResponse {
  success: boolean;
  response?: string;
  truncated?: boolean;
  error?: string;
}

export interface AIModelsResponse {
  success: boolean;
  models?: AIModelOption[];
  error?: string;
}

export interface AIEditResponse {
  success: boolean;
  modifiedContent?: string;
  summary?: string;
  error?: string;
}

export interface ImageSaveResult {
  success: boolean;
  relativePath?: string;
  error?: string;
}

export interface PdfExportResult {
  success: boolean;
  cancelled?: boolean;
  filePath?: string;
  error?: string;
}

export interface ElectronAPI {
  // File operations
  newFile: () => Promise<void>;
  openFile: () => Promise<FileOpenResult[] | null>;
  readFile: (filePath: string) => Promise<FileOpenResult | null>;
  readFileForAttachment: (filePath: string) => Promise<FileAttachmentResult>;
  saveFile: (filePath: string, content: string) => Promise<FileSaveResult>;
  saveFileAs: (content: string, defaultName?: string) => Promise<FileSaveResult | null>;
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean }>;
  watchFile: (filePath: string) => Promise<void>;
  unwatchFile: (filePath: string) => Promise<void>;
  saveClipboardImage: (base64Data: string, documentDir: string) => Promise<ImageSaveResult>;
  saveDroppedImage: (sourcePath: string, documentDir: string) => Promise<ImageSaveResult>;
  exportPdf: (html: string, defaultName?: string) => Promise<PdfExportResult | null>;
  
  // Config operations
  loadConfig: () => Promise<IConfig>;
  saveConfig: (config: IConfig) => Promise<void>;
  openConfig: () => Promise<FileOpenResult | null>;
  syncRecentFiles: (openFiles: IFileReference[]) => Promise<void>;
  
  // Get initial files from command line
  getInitialFiles: () => Promise<string[]>;
  
  // Signal that renderer is ready
  rendererReady: () => Promise<string[]>;
  
  // Dialog operations
  confirmClose: (fileName: string) => Promise<ConfirmCloseResult>;
  showExternalChangeDialog: (fileName: string) => Promise<'reload' | 'keep'>;
  openFileDialog: (options: { properties: string[] }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  
  // Window operations
  setWindowTitle: (title: string) => Promise<void>;
  getWindowBounds: () => Promise<{ width: number; height: number; x: number; y: number }>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;  
  // Shell operations
  showInFolder: (filePath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;

  // DevTools operations
  toggleDevTools: () => Promise<boolean>;
  getDevToolsState: () => Promise<boolean>;
  
  // Log operations
  getLogPath: () => Promise<string>;
  
  // Console logging
  sendConsoleLog: (level: string, ...args: any[]) => void;
  
  // Menu event listeners (return cleanup functions)
  onMenuNew: (callback: () => void) => () => void;
  onMenuOpen: (callback: () => void) => () => void;
  onMenuSave: (callback: () => void) => () => void;
  onMenuSaveAs: (callback: () => void) => () => void;
  onMenuSaveAll: (callback: () => void) => () => void;
  onMenuClose: (callback: () => void) => () => void;
  onMenuCloseAll: (callback: () => void) => () => void;
  onMenuShowInFolder: (callback: () => void) => () => void;
  onMenuOpenRecent: (callback: (filePath: string) => void) => () => void;
  onExternalFileChange: (callback: (filePath: string) => void) => () => void;
  onExternalFileRename: (callback: (filePath: string) => void) => () => void;
  onOpenFilesFromArgs: (callback: (filePaths: string[]) => void) => () => void;

  // AI Chat operations
  aiChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  claudeChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  openaiChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  geminiChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  cancelAIChatRequest: (requestId: string) => Promise<{ success: boolean; cancelled: boolean }>;
  cancelAIEditRequest: (requestId: string) => Promise<{ success: boolean; cancelled: boolean }>;
  aiEditRequest: (messages: AIMessage[], model: string, provider: 'claude' | 'openai' | 'gemini', requestId?: string) => Promise<AIEditResponse>;
  listAIModels: () => Promise<AIModelsResponse>;
  listClaudeModels: () => Promise<AIModelsResponse>;
  listOpenAIModels: () => Promise<AIModelsResponse>;
  listGeminiModels: () => Promise<AIModelsResponse>;
  getAIProviderStatuses: () => Promise<AIProviderStatuses>;

  // Secure Storage operations (API Keys)
  setApiKey: (provider: 'xai' | 'claude' | 'openai' | 'gemini', key: string) => Promise<{ success: boolean; error?: string }>;
  hasApiKeyInStorage: (provider: 'xai' | 'claude' | 'openai' | 'gemini') => Promise<boolean>;
  deleteApiKey: (provider: 'xai' | 'claude' | 'openai' | 'gemini') => Promise<{ success: boolean; error?: string }>;
  getApiKeyStatus: () => Promise<{ xai: boolean; claude: boolean; openai: boolean; gemini: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
