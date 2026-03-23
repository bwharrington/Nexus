// Type definitions for the Electron API exposed via preload script

export type LineEnding = 'CRLF' | 'LF';
export type ViewMode = 'edit' | 'preview' | 'diff';
export type AIChatMode = 'ask' | 'edit' | 'create';

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
  logLevel?: string;
  imageSaveFolder?: string;
  aiChatDockWidth?: number;
  aiChatMode?: AIChatMode;
  aiChatModel?: string;
  fileDirectoryPath?: string;
  fileDirectoryOpen?: boolean;
  fileDirectoryWidth?: number;
  fileDirectorySort?: FileDirectorySortOrder;
  openDirectoryPaths?: string[];
  openDirectorySort?: Record<string, FileDirectorySortOrder>;
  openDirectories?: string[];
  recentDirectories?: string[];
  openDirectoryShowAllFiles?: Record<string, boolean>;
  aiChatContextEnabled?: boolean;
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

export interface AIMultiAgentResponse {
  success: boolean;
  response?: string;
  responseId?: string;
  usage?: { input_tokens: number; output_tokens: number; reasoning_tokens?: number };
  error?: string;
}

// Multi-agent verbose streaming types (mirrors shared/multiAgentStreamTypes.ts)
export interface MultiAgentStreamEventGlobal {
  eventType: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface MultiAgentStreamUpdateGlobal {
  type: 'agent-activity' | 'tool-call' | 'reasoning' | 'content-delta' | 'raw' | 'done' | 'error';
  agentName?: string;
  agentIndex?: number;
  toolName?: string;
  toolInput?: string;
  reasoningTokens?: number;
  contentDelta?: string;
  message?: string;
  rawEvent: MultiAgentStreamEventGlobal;
}

export interface MultiAgentStreamDataGlobal {
  requestId: string;
  event: MultiAgentStreamUpdateGlobal;
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

export type ClipboardOperation = 'cut' | 'copy';

export interface FileClipboard {
  sourcePath: string;
  sourceName: string;
  operation: ClipboardOperation;
}

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
}

export interface WebSearchResponse {
  success: boolean;
  results?: WebSearchResult[];
  error?: string;
}

export interface PageFetchResult {
  success: boolean;
  content?: string;
  title?: string;
  error?: string;
}

export interface DirectoryNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DirectoryNode[];
}

export type FileDirectorySortOrder = 'asc' | 'desc';

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
  watchDirectory: (dirPath: string) => Promise<void>;
  unwatchDirectory: (dirPath: string) => Promise<void>;
  saveClipboardImage: (base64Data: string, documentDir: string) => Promise<ImageSaveResult>;
  saveDroppedImage: (sourcePath: string, documentDir: string) => Promise<ImageSaveResult>;
  exportPdf: (html: string, defaultName?: string) => Promise<PdfExportResult | null>;

  // Directory operations
  openFolderDialog: () => Promise<string | null>;
  readDirectory: (dirPath: string, showAllFiles?: boolean) => Promise<DirectoryNode | null>;
  createFileOnDisk: (dirPath: string) => Promise<{ success: boolean; filePath?: string; name?: string; error?: string }>;
  createFolder: (dirPath: string) => Promise<{ success: boolean; folderPath?: string; name?: string; error?: string }>;
  moveItem: (sourcePath: string, destDir: string) => Promise<{ success: boolean; destPath?: string; error?: string }>;
  copyItem: (sourcePath: string, destDir: string) => Promise<{ success: boolean; destPath?: string; error?: string }>;
  deleteItem: (itemPath: string) => Promise<{ success: boolean; error?: string }>;

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
  confirmOverwriteExternal: (fileName: string) => Promise<'overwrite' | 'cancel'>;
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
  setLogLevel: (level: string) => Promise<void>;

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
  onDirectoryChange: (callback: (dirPath: string) => void) => () => void;
  onOpenFilesFromArgs: (callback: (filePaths: string[]) => void) => () => void;
  onBeforeClose: (callback: () => void) => () => void;
  signalCloseReady: () => void;

  // AI Chat operations
  aiChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  claudeChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  openaiChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  geminiChatRequest: (messages: AIMessage[], model: string, requestId?: string, maxTokens?: number) => Promise<AIChatResponse>;
  multiAgentRequest: (
    input: Array<{ role: string; content: string }>,
    model: string,
    tools?: Array<{ type: string }>,
    reasoningEffort?: string,
    previousResponseId?: string,
    requestId?: string,
  ) => Promise<AIMultiAgentResponse>;
  onMultiAgentStream: (callback: (data: MultiAgentStreamDataGlobal) => void) => () => void;
  cancelAIChatRequest: (requestId: string) => Promise<{ success: boolean; cancelled: boolean }>;
  cancelAIEditRequest: (requestId: string) => Promise<{ success: boolean; cancelled: boolean }>;
  aiEditRequest: (messages: AIMessage[], model: string, provider: 'claude' | 'openai' | 'gemini' | 'xai', requestId?: string) => Promise<AIEditResponse>;
  listAIModels: () => Promise<AIModelsResponse>;
  listClaudeModels: () => Promise<AIModelsResponse>;
  listOpenAIModels: () => Promise<AIModelsResponse>;
  listGeminiModels: () => Promise<AIModelsResponse>;
  getAIProviderStatuses: () => Promise<AIProviderStatuses>;

  // Web Search operations (Serper)
  webSearch: (query: string, numResults?: number, requestId?: string) => Promise<WebSearchResponse>;
  webFetchPage: (url: string, requestId?: string) => Promise<PageFetchResult>;
  hasSerperKey: () => Promise<boolean>;
  serperSearch: (query: string, numResults?: number) => Promise<WebSearchResponse>;

  // Secure Storage operations (API Keys)
  setApiKey: (provider: 'xai' | 'claude' | 'openai' | 'gemini' | 'serper', key: string) => Promise<{ success: boolean; error?: string }>;
  hasApiKeyInStorage: (provider: 'xai' | 'claude' | 'openai' | 'gemini' | 'serper') => Promise<boolean>;
  deleteApiKey: (provider: 'xai' | 'claude' | 'openai' | 'gemini' | 'serper') => Promise<{ success: boolean; error?: string }>;
  getApiKeyStatus: () => Promise<{ xai: boolean; claude: boolean; openai: boolean; gemini: boolean; serper: boolean }>;

  // Spellcheck operations
  onSpellCheckContextMenu: (callback: (data: {
    misspelledWord: string;
    dictionarySuggestions: string[];
    x: number;
    y: number;
  }) => void) => () => void;
  addToDictionary: (word: string) => Promise<void>;
  replaceMisspelling: (word: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
