import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer process
const electronAPI = {
  // File operations
  newFile: () => ipcRenderer.invoke('file:new'),
  openFile: () => ipcRenderer.invoke('file:open'),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke('file:save', filePath, content),
  saveFileAs: (content: string, defaultName?: string) => ipcRenderer.invoke('file:save-as', content, defaultName),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  watchFile: (filePath: string) => ipcRenderer.invoke('file:watch', filePath),
  unwatchFile: (filePath: string) => ipcRenderer.invoke('file:unwatch', filePath),
  saveClipboardImage: (base64Data: string, documentDir: string) =>
    ipcRenderer.invoke('file:save-image', base64Data, documentDir),
  saveDroppedImage: (sourcePath: string, documentDir: string) =>
    ipcRenderer.invoke('file:save-dropped-image', sourcePath, documentDir),
  exportPdf: (html: string, defaultName?: string) =>
    ipcRenderer.invoke('file:export-pdf', html, defaultName),
  
  // Config operations
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),
  openConfig: () => ipcRenderer.invoke('config:open'),
  syncRecentFiles: (openFiles: { fileName: string; mode: 'edit' | 'preview' }[]) => ipcRenderer.invoke('config:sync-recent-files', openFiles),
  
  // Get initial files from command line
  getInitialFiles: () => ipcRenderer.invoke('get-initial-files'),
  
  // Signal that renderer is ready
  rendererReady: () => ipcRenderer.invoke('renderer-ready'),
  
  // Dialog operations
  confirmClose: (fileName: string) => ipcRenderer.invoke('dialog:confirm-close', fileName),
  showExternalChangeDialog: (fileName: string) => ipcRenderer.invoke('dialog:external-change', fileName),
  openFileDialog: (options: { properties: string[] }) => ipcRenderer.invoke('dialog:open-file', options),
  readFileForAttachment: (filePath: string) => ipcRenderer.invoke('file:read-for-attachment', filePath),

  // Window operations
  setWindowTitle: (title: string) => ipcRenderer.invoke('window:set-title', title),
  getWindowBounds: () => ipcRenderer.invoke('window:get-bounds'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  
  // Shell operations
  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // DevTools operations
  toggleDevTools: () => ipcRenderer.invoke('devtools:toggle'),
  getDevToolsState: () => ipcRenderer.invoke('devtools:get-state'),
  
  // Log operations
  getLogPath: () => ipcRenderer.invoke('log:get-path'),
  
  // Console logging
  sendConsoleLog: (level: string, ...args: any[]) => ipcRenderer.send('console:log', level, ...args),
  
  // Menu event listeners
  onMenuNew: (callback: () => void) => {
    ipcRenderer.on('menu:new', callback);
    return () => ipcRenderer.removeListener('menu:new', callback);
  },
  onMenuOpen: (callback: () => void) => {
    ipcRenderer.on('menu:open', callback);
    return () => ipcRenderer.removeListener('menu:open', callback);
  },
  onMenuSave: (callback: () => void) => {
    ipcRenderer.on('menu:save', callback);
    return () => ipcRenderer.removeListener('menu:save', callback);
  },
  onMenuSaveAs: (callback: () => void) => {
    ipcRenderer.on('menu:save-as', callback);
    return () => ipcRenderer.removeListener('menu:save-as', callback);
  },
  onMenuSaveAll: (callback: () => void) => {
    ipcRenderer.on('menu:save-all', callback);
    return () => ipcRenderer.removeListener('menu:save-all', callback);
  },
  onMenuClose: (callback: () => void) => {
    ipcRenderer.on('menu:close', callback);
    return () => ipcRenderer.removeListener('menu:close', callback);
  },
  onMenuCloseAll: (callback: () => void) => {
    ipcRenderer.on('menu:close-all', callback);
    return () => ipcRenderer.removeListener('menu:close-all', callback);
  },
  onMenuShowInFolder: (callback: () => void) => {
    ipcRenderer.on('menu:show-in-folder', callback);
    return () => ipcRenderer.removeListener('menu:show-in-folder', callback);
  },
  onMenuOpenRecent: (callback: (filePath: string) => void) => {
    ipcRenderer.on('menu:open-recent', (_event, filePath: string) => callback(filePath));
    return () => ipcRenderer.removeAllListeners('menu:open-recent');
  },
  onExternalFileChange: (callback: (filePath: string) => void) => {
    ipcRenderer.on('file:external-change', (_event, filePath: string) => callback(filePath));
    return () => ipcRenderer.removeAllListeners('file:external-change');
  },
  onExternalFileRename: (callback: (filePath: string) => void) => {
    ipcRenderer.on('file:external-rename', (_event, filePath: string) => callback(filePath));
    return () => ipcRenderer.removeAllListeners('file:external-rename');
  },
  onOpenFilesFromArgs: (callback: (filePaths: string[]) => void) => {
    ipcRenderer.on('open-files-from-args', (_event, filePaths: string[]) => callback(filePaths));
    return () => ipcRenderer.removeAllListeners('open-files-from-args');
  },

  // AI Chat operations
  aiChatRequest: (messages: Array<{ role: string; content: string }>, model: string, requestId?: string, maxTokens?: number) =>
    ipcRenderer.invoke('ai:chat-request', { messages, model, requestId, maxTokens }),
  claudeChatRequest: (messages: Array<{ role: string; content: string }>, model: string, requestId?: string, maxTokens?: number) =>
    ipcRenderer.invoke('ai:claude-chat-request', { messages, model, requestId, maxTokens }),
  openaiChatRequest: (messages: Array<{ role: string; content: string }>, model: string, requestId?: string, maxTokens?: number) =>
    ipcRenderer.invoke('ai:openai-chat-request', { messages, model, requestId, maxTokens }),
  geminiChatRequest: (messages: Array<{ role: string; content: string }>, model: string, requestId?: string, maxTokens?: number) =>
    ipcRenderer.invoke('ai:gemini-chat-request', { messages, model, requestId, maxTokens }),
  cancelAIChatRequest: (requestId: string) =>
    ipcRenderer.invoke('ai:cancel-request', requestId),
  cancelAIEditRequest: (requestId: string) =>
    ipcRenderer.invoke('ai:cancel-edit-request', requestId),
  aiEditRequest: (messages: Array<{ role: string; content: string }>, model: string, provider: 'claude' | 'openai' | 'gemini', requestId?: string) =>
    ipcRenderer.invoke('ai:edit-request', { messages, model, provider, requestId }),
  listAIModels: () => ipcRenderer.invoke('ai:list-models'),
  listClaudeModels: () => ipcRenderer.invoke('ai:list-claude-models'),
  listOpenAIModels: () => ipcRenderer.invoke('ai:list-openai-models'),
  listGeminiModels: () => ipcRenderer.invoke('ai:list-gemini-models'),
  getAIProviderStatuses: () => ipcRenderer.invoke('ai:get-provider-status'),

  // Secure Storage operations (API Keys)
  setApiKey: (provider: 'xai' | 'claude' | 'openai' | 'gemini', key: string) =>
    ipcRenderer.invoke('secure-storage:set-api-key', { provider, key }),
  hasApiKeyInStorage: (provider: 'xai' | 'claude' | 'openai' | 'gemini') =>
    ipcRenderer.invoke('secure-storage:has-api-key', provider),
  deleteApiKey: (provider: 'xai' | 'claude' | 'openai' | 'gemini') =>
    ipcRenderer.invoke('secure-storage:delete-api-key', provider),
  getApiKeyStatus: () => ipcRenderer.invoke('secure-storage:get-key-status'),
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Export type for use in renderer
export type ElectronAPI = typeof electronAPI;
