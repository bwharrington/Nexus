import { app, BrowserWindow, dialog, Menu, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as dotenv from 'dotenv';
import { initLogger, log, logError, flushLogsSync, getLogFilePath, getLogsDir } from './logger';
import { registerAIIpcHandlers } from './aiIpcHandlers';
import { registerSecureStorageIpcHandlers } from './secureStorageIpcHandlers';
import { loadEncryptedKeys } from './services/secureStorage';
import { listModels as listXAIModels, hasApiKey as hasXaiApiKey } from './services/xaiApi';
import { listClaudeModels, hasApiKey as hasClaudeApiKey } from './services/claudeApi';
import { listOpenAIModels, hasApiKey as hasOpenAIApiKey } from './services/openaiApi';
import { listGeminiModels, hasApiKey as hasGeminiApiKey } from './services/geminiApi';

// Load .env file for development (optional - will be ignored if not present)
// In production builds, this file typically won't exist, and secure storage will be used
dotenv.config();

let mainWindow: BrowserWindow | null;
let pendingFilesToOpen: string[] = [];
let fileWatchers: Map<string, fsSync.FSWatcher> = new Map();

// Supported markdown file extensions (for Windows file associations)
const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx', '.mdwn', '.mdc'];

// All extensions the file directory tree should display
const DIRECTORY_SUPPORTED_EXTENSIONS = [
    ...MARKDOWN_EXTENSIONS,
    '.rst', '.rest',
    '.txt',
];

// Check if a file path is a markdown file
function isMarkdownFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return MARKDOWN_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
}

// Config file path - in user data directory (preserved during uninstall)
const getConfigPath = () => {
    // Use userData directory which is preserved across installations
    // Windows: C:\Users\<user>\AppData\Roaming\markdownplus
    // macOS: ~/Library/Application Support/markdownplus
    // Linux: ~/.config/markdownplus
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'config.json');
};

// Supported image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];

// Default config
const defaultConfig = {
    recentFiles: [] as { fileName: string; mode: 'edit' | 'preview' }[],
    openFiles: [] as { fileName: string; mode: 'edit' | 'preview' }[],
    defaultLineEnding: 'CRLF' as const,
    devToolsOpen: false,
    aiModels: {} as Record<string, Record<string, { enabled: boolean }>>,
    silentFileUpdates: true,
    imageSaveFolder: 'images' as string,
    aiChatDocked: false,
    aiChatDockWidth: 420,
};

// Detect line ending in content
function detectLineEnding(content: string): 'CRLF' | 'LF' {
    if (content.includes('\r\n')) {
        return 'CRLF';
    }
    return 'LF';
}

// Normalize line endings for saving
function normalizeLineEndings(content: string, lineEnding: 'CRLF' | 'LF'): string {
    // First normalize to LF
    const normalized = content.replace(/\r\n/g, '\n');
    // Then convert to target
    if (lineEnding === 'CRLF') {
        return normalized.replace(/\n/g, '\r\n');
    }
    return normalized;
}

// Load config from file
async function loadConfig() {
    try {
        const configPath = getConfigPath();
        const data = await fs.readFile(configPath, 'utf-8');
        const loadedConfig = JSON.parse(data);

        // Handle migration from old format (string arrays) to new format (object arrays)
        // If recentFiles or openFiles contain strings instead of objects, reset them
        if (loadedConfig.recentFiles && Array.isArray(loadedConfig.recentFiles) && loadedConfig.recentFiles.length > 0) {
            if (typeof loadedConfig.recentFiles[0] === 'string') {
                loadedConfig.recentFiles = [];
            }
        }
        if (loadedConfig.openFiles && Array.isArray(loadedConfig.openFiles) && loadedConfig.openFiles.length > 0) {
            if (typeof loadedConfig.openFiles[0] === 'string') {
                loadedConfig.openFiles = [];
            }
        }

        return { ...defaultConfig, ...loadedConfig };
    } catch {
        return defaultConfig;
    }
}

// Save config to file
async function saveConfig(config: typeof defaultConfig) {
    try {
        const configPath = getConfigPath();
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save config:', error);
    }
}

// Open config file for editing - creates if doesn't exist
async function openConfigFile(): Promise<{ filePath: string; content: string; lineEnding: 'CRLF' | 'LF' } | null> {
    const configPath = getConfigPath();
    try {
        // Check if file exists, if not create it with defaults
        try {
            await fs.access(configPath);
        } catch {
            // File doesn't exist, create it
            await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        }
        
        const content = await fs.readFile(configPath, 'utf-8');
        const lineEnding = detectLineEnding(content);
        return { filePath: configPath, content, lineEnding };
    } catch (error) {
        console.error('Failed to open config file:', error);
        return null;
    }
}

// Sync AI models with config - adds new models, preserves existing enabled/disabled state
async function syncAIModelsConfig() {
    try {
        const config = await loadConfig();

        // Initialize aiModels if it doesn't exist
        if (!config.aiModels) {
            config.aiModels = {};
        }

        let configUpdated = false;

        // Sync xAI models
        if (hasXaiApiKey()) {
            try {
                const models = await listXAIModels();
                if (!config.aiModels.xai) {
                    config.aiModels.xai = {};
                    configUpdated = true;
                }

                for (const model of models) {
                    if (!config.aiModels.xai[model.id]) {
                        config.aiModels.xai[model.id] = { enabled: true };
                        configUpdated = true;
                        log('Added new xAI model to config', { modelId: model.id });
                    }
                }

                // Remove models that no longer pass the filter (e.g. image/video models)
                const allowedXaiIds = new Set(models.map(m => m.id));
                for (const modelId of Object.keys(config.aiModels.xai)) {
                    if (!allowedXaiIds.has(modelId)) {
                        delete config.aiModels.xai[modelId];
                        configUpdated = true;
                        log('Removed filtered-out xAI model from config', { modelId });
                    }
                }
            } catch (error) {
                logError('Failed to sync xAI models', error as Error);
            }
        }

        // Sync Claude models
        if (hasClaudeApiKey()) {
            try {
                const models = await listClaudeModels();
                if (!config.aiModels.claude) {
                    config.aiModels.claude = {};
                    configUpdated = true;
                }

                for (const model of models) {
                    if (!config.aiModels.claude[model.id]) {
                        config.aiModels.claude[model.id] = { enabled: true };
                        configUpdated = true;
                        log('Added new Claude model to config', { modelId: model.id });
                    }
                }

                // Remove models that no longer pass the filter (e.g. old claude-3- base generation)
                const allowedClaudeIds = new Set(models.map(m => m.id));
                for (const modelId of Object.keys(config.aiModels.claude)) {
                    if (!allowedClaudeIds.has(modelId)) {
                        delete config.aiModels.claude[modelId];
                        configUpdated = true;
                        log('Removed filtered-out Claude model from config', { modelId });
                    }
                }
            } catch (error) {
                logError('Failed to sync Claude models', error as Error);
            }
        }

        // Sync OpenAI models
        if (hasOpenAIApiKey()) {
            try {
                const models = await listOpenAIModels();
                if (!config.aiModels.openai) {
                    config.aiModels.openai = {};
                    configUpdated = true;
                }

                for (const model of models) {
                    if (!config.aiModels.openai[model.id]) {
                        config.aiModels.openai[model.id] = { enabled: true };
                        configUpdated = true;
                        log('Added new OpenAI model to config', { modelId: model.id });
                    }
                }
            } catch (error) {
                logError('Failed to sync OpenAI models', error as Error);
            }
        }

        // Sync Gemini models
        if (hasGeminiApiKey()) {
            try {
                const models = await listGeminiModels();
                if (!config.aiModels.gemini) {
                    config.aiModels.gemini = {};
                    configUpdated = true;
                }

                // Add any new models not yet in config
                for (const model of models) {
                    if (!config.aiModels.gemini[model.id]) {
                        config.aiModels.gemini[model.id] = { enabled: true };
                        configUpdated = true;
                        log('Added new Gemini model to config', { modelId: model.id });
                    }
                }

                // Remove models that no longer pass the filter (e.g. previously synced
                // image-only or deprecated models that were since filtered out)
                const allowedIds = new Set(models.map(m => m.id));
                for (const modelId of Object.keys(config.aiModels.gemini)) {
                    if (!allowedIds.has(modelId)) {
                        delete config.aiModels.gemini[modelId];
                        configUpdated = true;
                        log('Removed filtered-out Gemini model from config', { modelId });
                    }
                }
            } catch (error) {
                logError('Failed to sync Gemini models', error as Error);
            }
        }

        // Save config if it was updated
        if (configUpdated) {
            await saveConfig(config);
            log('AI models config synced and saved');
        }
    } catch (error) {
        logError('Failed to sync AI models config', error as Error);
    }
}

// Watch a file for external changes
function watchFile(filePath: string) {
    // Never watch any file inside the logs directory — doing so creates an infinite
    // feedback loop: writing a log entry triggers the watcher, which logs the event,
    // which triggers another write, ad infinitum.
    const logsDir = getLogsDir();
    if (logsDir && filePath.startsWith(logsDir + path.sep)) {
        return;
    }

    // Don't watch if already watching
    if (fileWatchers.has(filePath)) {
        return;
    }

    try {
        const watcher = fsSync.watch(filePath, (eventType) => {
            if (eventType === 'change') {
                log('File changed externally', { filePath });
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('file:external-change', filePath);
                }
            } else if (eventType === 'rename') {
                // 'rename' fires when the file is renamed or deleted externally.
                // Stop watching the now-invalid path and notify the renderer.
                log('File renamed/deleted externally', { filePath });
                unwatchFile(filePath);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('file:external-rename', filePath);
                }
            }
        });

        fileWatchers.set(filePath, watcher);
        log('Started watching file', { filePath });
    } catch (error) {
        logError(`Failed to watch file: ${filePath}`, error as Error);
    }
}

// Stop watching a file
function unwatchFile(filePath: string) {
    const watcher = fileWatchers.get(filePath);
    if (watcher) {
        watcher.close();
        fileWatchers.delete(filePath);
        log('Stopped watching file', { filePath });
    }
}

// Register IPC handlers
function registerIpcHandlers() {
    // File: Open dialog
    ipcMain.handle('file:open', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            filters: [
                { name: 'Markup Files', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx', 'mdwn', 'mdc', 'rst', 'rest'] },
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'Other Markup', extensions: ['adoc', 'asciidoc', 'org', 'textile'] },
                { name: 'All Files', extensions: ['*'] },
            ],
            properties: ['openFile', 'multiSelections'],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        // Read all selected files
        const files = [];
        for (const filePath of result.filePaths) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lineEnding = detectLineEnding(content);
                files.push({ filePath, content, lineEnding });
            } catch (error) {
                console.error(`Failed to read file ${filePath}:`, error);
            }
        }
        
        return files.length > 0 ? files : null;
    });

    // File: Read specific file
    ipcMain.handle('file:read', async (_event, filePath: string) => {
        log('IPC: file:read called', { filePath });
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lineEnding = detectLineEnding(content);
            log('IPC: file:read success', { filePath, contentLength: content.length, lineEnding });
            return { filePath, content, lineEnding };
        } catch (error) {
            logError('IPC: file:read failed', error);
            return null;
        }
    });

    // File: Read for attachment (supports images and text files)
    ipcMain.handle('file:read-for-attachment', async (_event, filePath: string) => {
        log('IPC: file:read-for-attachment called', { filePath });
        try {
            const ext = path.extname(filePath).toLowerCase();
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
            const textExtensions = ['.txt', '.md', '.markdown', '.mdc', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.xml', '.yaml', '.yml', '.log'];

            if (imageExtensions.includes(ext)) {
                // Read as binary and base64 encode
                const buffer = await fs.readFile(filePath);
                const base64 = buffer.toString('base64');
                const mimeType = ext === '.png' ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                    : ext === '.gif' ? 'image/gif'
                    : ext === '.webp' ? 'image/webp'
                    : 'image/bmp';

                log('IPC: file:read-for-attachment success (image)', { filePath, size: buffer.length });
                return {
                    type: 'image',
                    mimeType,
                    data: base64,
                    size: buffer.length,
                };
            } else if (textExtensions.includes(ext) || !ext) {
                // Read as text
                const content = await fs.readFile(filePath, 'utf-8');
                log('IPC: file:read-for-attachment success (text)', { filePath, size: content.length });
                return {
                    type: 'text',
                    data: content,
                    size: content.length,
                };
            } else {
                // Unsupported file type
                return {
                    type: 'unsupported',
                    error: `File type ${ext} is not supported`,
                };
            }
        } catch (error) {
            logError('IPC: file:read-for-attachment failed', error);
            return {
                type: 'error',
                error: error instanceof Error ? error.message : 'Failed to read file',
            };
        }
    });

    // File: Save to existing path
    ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
        try {
            // Detect original line ending and preserve it
            let lineEnding: 'CRLF' | 'LF' = 'LF';
            try {
                const originalContent = await fs.readFile(filePath, 'utf-8');
                lineEnding = detectLineEnding(originalContent);
            } catch {
                // File might not exist yet, use default
                lineEnding = process.platform === 'win32' ? 'CRLF' : 'LF';
            }
            
            const normalizedContent = normalizeLineEndings(content, lineEnding);
            await fs.writeFile(filePath, normalizedContent, 'utf-8');
            return { success: true, filePath };
        } catch (error) {
            console.error('Failed to save file:', error);
            return { success: false, filePath, error: String(error) };
        }
    });

    // File: Save As dialog
    ipcMain.handle('file:save-as', async (_event, content: string, defaultName?: string) => {
        const result = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: defaultName || 'Untitled.md',
            filters: [
                { name: 'Markdown', extensions: ['md', 'mdc'] },
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });

        if (result.canceled || !result.filePath) {
            return null;
        }

        try {
            const lineEnding = process.platform === 'win32' ? 'CRLF' : 'LF';
            const normalizedContent = normalizeLineEndings(content, lineEnding);
            await fs.writeFile(result.filePath, normalizedContent, 'utf-8');
            return { success: true, filePath: result.filePath };
        } catch (error) {
            console.error('Failed to save file:', error);
            return { success: false, filePath: result.filePath, error: String(error) };
        }
    });

    // File: Export rendered content as PDF
    ipcMain.handle('file:export-pdf', async (_event, html: string, defaultName?: string) => {
        const result = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: defaultName || 'Untitled.pdf',
            filters: [
                { name: 'PDF', extensions: ['pdf'] },
            ],
        });

        if (result.canceled || !result.filePath) {
            return { success: false, cancelled: true };
        }

        let exportWindow: BrowserWindow | null = null;
        try {
            exportWindow = new BrowserWindow({
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            const dataUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
            await exportWindow.loadURL(dataUrl);

            // Allow async rendering (notably Mermaid SVG generation) to settle before printing.
            await new Promise((resolve) => setTimeout(resolve, 250));

            const pdfBuffer = await exportWindow.webContents.printToPDF({
                printBackground: true,
                preferCSSPageSize: true,
            });
            await fs.writeFile(result.filePath, pdfBuffer);

            return { success: true, filePath: result.filePath };
        } catch (error) {
            logError('IPC: file:export-pdf failed', error as Error);
            return { success: false, filePath: result.filePath, error: String(error) };
        } finally {
            if (exportWindow && !exportWindow.isDestroyed()) {
                exportWindow.destroy();
            }
        }
    });

    // File: Rename
    ipcMain.handle('file:rename', async (_event, oldPath: string, newPath: string) => {
        try {
            await fs.rename(oldPath, newPath);
            return { success: true };
        } catch (error) {
            console.error('Failed to rename file:', error);
            throw error;
        }
    });

    // Config: Load
    ipcMain.handle('config:load', async () => {
        return await loadConfig();
    });

    // Config: Save
    ipcMain.handle('config:save', async (_event, config) => {
        await saveConfig(config);
    });

    // Config: Open for editing
    ipcMain.handle('config:open', async () => {
        return await openConfigFile();
    });

    // Get initial files to open (from command line)
    ipcMain.handle('get-initial-files', () => {
        log('IPC: get-initial-files called', { pendingFiles: pendingFilesToOpen });
        const files = pendingFilesToOpen;
        pendingFilesToOpen = []; // Clear after retrieving
        log('IPC: Returning files and clearing pending', { files });
        return files;
    });

    // Renderer ready - send pending files
    ipcMain.handle('renderer-ready', () => {
        log('IPC: renderer-ready called', { pendingFiles: pendingFilesToOpen });
        if (pendingFilesToOpen.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
            log('Sending files to renderer after ready signal', { files: pendingFilesToOpen });
            mainWindow.webContents.send('open-files-from-args', pendingFilesToOpen);
            log('IPC event "open-files-from-args" sent to renderer');
            const files = [...pendingFilesToOpen];
            pendingFilesToOpen = []; // Clear after sending
            log('Returning files from renderer-ready', { files });
            return files;
        }
        log('No files to send from renderer-ready');
        return [];
    });

    // Config: Sync recent files with open files
    ipcMain.handle('config:sync-recent-files', async (_event, openFiles: { fileName: string; mode: 'edit' | 'preview' }[]) => {
        const config = await loadConfig();
        const newConfig = {
            ...config,
            recentFiles: openFiles,
            openFiles: openFiles,
        };
        await saveConfig(newConfig);
    });

    // Dialog: Confirm close
    ipcMain.handle('dialog:confirm-close', async (_event, fileName: string) => {
        const result = await dialog.showMessageBox(mainWindow!, {
            type: 'question',
            buttons: ['Save', "Don't Save", 'Cancel'],
            defaultId: 0,
            cancelId: 2,
            title: 'Unsaved Changes',
            message: `Do you want to save changes to "${fileName}"?`,
            detail: 'Your changes will be lost if you don\'t save them.',
        });

        const actions = ['save', 'discard', 'cancel'] as const;
        return { action: actions[result.response] };
    });

    // DevTools: Toggle
    ipcMain.handle('devtools:toggle', async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
                // Config will be saved by devtools-closed event listener
                return false;
            } else {
                mainWindow.webContents.openDevTools();
                // Config will be saved by devtools-opened event listener
                return true;
            }
        }
        return false;
    });

    // DevTools: Get state
    ipcMain.handle('devtools:get-state', async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            return mainWindow.webContents.isDevToolsOpened();
        }
        return false;
    });

    // Log: Get path
    ipcMain.handle('log:get-path', () => {
        return getLogFilePath();
    });

    // Console: Log message (from renderer)
    ipcMain.on('console:log', (_event, level: string, ...args: any[]) => {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        log(`[RENDERER ${level.toUpperCase()}] ${message}`);
    });

    // Dialog: External change
    ipcMain.handle('dialog:external-change', async (_event, fileName: string) => {
        const result = await dialog.showMessageBox(mainWindow!, {
            type: 'question',
            buttons: ['Yes', 'No'],
            defaultId: 0,
            title: 'File Changed Externally',
            message: `"${fileName}" has been changed externally.`,
            detail: 'Would you like to reload it with the latest changes?\n\nSelecting "No" keeps your current version — saving will overwrite the external changes.',
        });

        return result.response === 0 ? 'reload' : 'keep';
    });

    // Dialog: Confirm overwrite of externally changed file
    ipcMain.handle('dialog:confirm-overwrite-external', async (_event, fileName: string) => {
        const result = await dialog.showMessageBox(mainWindow!, {
            type: 'warning',
            buttons: ['Overwrite', 'Cancel'],
            defaultId: 1,
            title: 'Overwrite External Changes?',
            message: `Save "${fileName}"?`,
            detail: 'The file was changed by an external editor. Saving will overwrite those external changes with your current version.',
        });
        return result.response === 0 ? 'overwrite' : 'cancel';
    });

    // Dialog: Open file
    ipcMain.handle('dialog:open-file', async (_event, options: { properties: string[] }) => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: options.properties as any,
        });

        return result;
    });

    // Window: Set title
    ipcMain.handle('window:set-title', async (_event, title: string) => {
        mainWindow?.setTitle(title);
    });

    // Window: Get bounds
    ipcMain.handle('window:get-bounds', async () => {
        return mainWindow?.getBounds();
    });

    // Window: Minimize
    ipcMain.handle('window:minimize', async () => {
        mainWindow?.minimize();
    });

    // Window: Maximize/Unmaximize
    ipcMain.handle('window:maximize', async () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });

    // Window: Close
    ipcMain.handle('window:close', async () => {
        mainWindow?.close();
    });

    // Shell: Show in folder
    ipcMain.handle('shell:show-in-folder', async (_event, filePath: string) => {
        shell.showItemInFolder(filePath);
    });

    // Shell: Open external URL
    ipcMain.handle('shell:open-external', async (_event, url: string) => {
        await shell.openExternal(url);
    });

    // File watching
    ipcMain.handle('file:watch', async (_event, filePath: string) => {
        watchFile(filePath);
    });

    ipcMain.handle('file:unwatch', async (_event, filePath: string) => {
        unwatchFile(filePath);
    });

    // File: Save clipboard image to disk
    ipcMain.handle('file:save-image', async (_event, base64Data: string, documentDir: string) => {
        log('IPC: file:save-image called', { documentDir });
        try {
            // Load config to get image save folder name
            const config = await loadConfig();
            const folderName = config.imageSaveFolder || 'images';
            const imageDir = path.join(documentDir, folderName);

            // Create images folder if it doesn't exist
            await fs.mkdir(imageDir, { recursive: true });

            // Generate unique filename with timestamp
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '-' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0') + '-' +
                String(now.getMilliseconds()).padStart(3, '0');
            let fileName = `image-${timestamp}.png`;
            let filePath = path.join(imageDir, fileName);

            // Handle unlikely collision by appending random suffix
            try {
                await fs.access(filePath);
                // File exists, add random suffix
                const suffix = Math.random().toString(36).substring(2, 6);
                fileName = `image-${timestamp}-${suffix}.png`;
                filePath = path.join(imageDir, fileName);
            } catch {
                // File doesn't exist, good to go
            }

            // Decode base64 and write to disk
            const buffer = Buffer.from(base64Data, 'base64');
            await fs.writeFile(filePath, buffer);

            // Build relative path with forward slashes
            const relativePath = `./${folderName}/${fileName}`.replace(/\\/g, '/');

            log('IPC: file:save-image success', { filePath, relativePath, size: buffer.length });
            return { success: true, relativePath };
        } catch (error) {
            logError('IPC: file:save-image failed', error as Error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to save image' };
        }
    });

    // Dialog: Open folder
    ipcMain.handle('dialog:open-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

    // File: Read directory recursively (returns tree of supported files)
    ipcMain.handle('file:read-directory', async (_event, dirPath: string) => {
        log('IPC: file:read-directory called', { dirPath });

        interface DirNode {
            name: string;
            path: string;
            isDirectory: boolean;
            children?: DirNode[];
        }

        async function readDirRecursive(currentPath: string): Promise<DirNode[]> {
            let entries;
            try {
                entries = await fs.readdir(currentPath, { withFileTypes: true });
            } catch {
                return [];
            }

            const nodes: DirNode[] = [];

            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;

                const fullPath = path.join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    const children = await readDirRecursive(fullPath);
                    nodes.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: true,
                        children,
                    });
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (DIRECTORY_SUPPORTED_EXTENSIONS.includes(ext)) {
                        nodes.push({
                            name: entry.name,
                            path: fullPath,
                            isDirectory: false,
                        });
                    }
                }
            }

            return nodes;
        }

        try {
            const children = await readDirRecursive(dirPath);
            const rootNode: DirNode = {
                name: path.basename(dirPath),
                path: dirPath,
                isDirectory: true,
                children,
            };
            return rootNode;
        } catch (error) {
            logError('IPC: file:read-directory failed', error as Error);
            return null;
        }
    });

    // File: Create new file on disk
    ipcMain.handle('file:create-file', async (_event, dirPath: string) => {
        log('IPC: file:create-file called', { dirPath });
        try {
            let name = 'Untitled.md';
            let filePath = path.join(dirPath, name);
            let counter = 1;
            while (true) {
                try {
                    await fs.access(filePath);
                    name = `Untitled ${counter}.md`;
                    filePath = path.join(dirPath, name);
                    counter++;
                } catch {
                    break;
                }
            }
            await fs.writeFile(filePath, '', 'utf-8');
            log('IPC: file:create-file success', { filePath });
            return { success: true, filePath, name };
        } catch (error) {
            logError('IPC: file:create-file failed', error as Error);
            return { success: false, error: String(error) };
        }
    });

    // File: Create new folder on disk
    ipcMain.handle('file:create-folder', async (_event, dirPath: string) => {
        log('IPC: file:create-folder called', { dirPath });
        try {
            let name = 'New Folder';
            let folderPath = path.join(dirPath, name);
            let counter = 1;
            while (true) {
                try {
                    await fs.access(folderPath);
                    name = `New Folder ${counter}`;
                    folderPath = path.join(dirPath, name);
                    counter++;
                } catch {
                    break;
                }
            }
            await fs.mkdir(folderPath, { recursive: true });
            log('IPC: file:create-folder success', { folderPath });
            return { success: true, folderPath, name };
        } catch (error) {
            logError('IPC: file:create-folder failed', error as Error);
            return { success: false, error: String(error) };
        }
    });

    // File: Move file or folder to a new parent directory
    ipcMain.handle('file:move', async (_event, sourcePath: string, destDir: string) => {
        log('IPC: file:move called', { sourcePath, destDir });
        try {
            const baseName = path.basename(sourcePath);
            const destPath = path.join(destDir, baseName);
            if (sourcePath === destPath) {
                return { success: true, destPath: sourcePath };
            }
            await fs.rename(sourcePath, destPath);
            log('IPC: file:move success', { destPath });
            return { success: true, destPath };
        } catch (error) {
            logError('IPC: file:move failed', error as Error);
            return { success: false, error: String(error) };
        }
    });

    // File: Delete file or folder
    ipcMain.handle('file:delete', async (_event, itemPath: string) => {
        log('IPC: file:delete called', { itemPath });
        try {
            const stat = await fs.stat(itemPath);
            if (stat.isDirectory()) {
                await fs.rm(itemPath, { recursive: true, force: true });
            } else {
                await fs.unlink(itemPath);
            }
            log('IPC: file:delete success', { itemPath });
            return { success: true };
        } catch (error) {
            logError('IPC: file:delete failed', error as Error);
            return { success: false, error: String(error) };
        }
    });

    // File: Save dropped image (copy existing file to images folder)
    ipcMain.handle('file:save-dropped-image', async (_event, sourcePath: string, documentDir: string) => {
        log('IPC: file:save-dropped-image called', { sourcePath, documentDir });
        try {
            const ext = path.extname(sourcePath).toLowerCase();
            if (!IMAGE_EXTENSIONS.includes(ext)) {
                return { success: false, error: `Unsupported image format: ${ext}` };
            }

            // Load config to get image save folder name
            const config = await loadConfig();
            const folderName = config.imageSaveFolder || 'images';
            const imageDir = path.join(documentDir, folderName);

            // Create images folder if it doesn't exist
            await fs.mkdir(imageDir, { recursive: true });

            // Generate unique filename preserving original extension
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '-' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0') + '-' +
                String(now.getMilliseconds()).padStart(3, '0');
            let fileName = `image-${timestamp}${ext}`;
            let filePath = path.join(imageDir, fileName);

            // Handle unlikely collision
            try {
                await fs.access(filePath);
                const suffix = Math.random().toString(36).substring(2, 6);
                fileName = `image-${timestamp}-${suffix}${ext}`;
                filePath = path.join(imageDir, fileName);
            } catch {
                // File doesn't exist, good to go
            }

            // Copy the source image to the images folder
            await fs.copyFile(sourcePath, filePath);

            // Build relative path with forward slashes
            const relativePath = `./${folderName}/${fileName}`.replace(/\\/g, '/');

            log('IPC: file:save-dropped-image success', { filePath, relativePath });
            return { success: true, relativePath };
        } catch (error) {
            logError('IPC: file:save-dropped-image failed', error as Error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to save image' };
        }
    });
}

function createWindow() {
    // Create the browser window with secure settings
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        frame: false,
        icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    // Load the index.html file
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Open the DevTools in development mode or if saved in config
    if (process.env.NODE_ENV === 'development') {
        log('Opening DevTools', { isDev: true });
        mainWindow.webContents.openDevTools();
    } else {
        // Check config for DevTools state
        loadConfig().then(config => {
            if (config.devToolsOpen && mainWindow && !mainWindow.isDestroyed()) {
                log('Opening DevTools from config', { devToolsOpen: config.devToolsOpen });
                mainWindow.webContents.openDevTools();
            }
        });
    }

    // Listen for DevTools open/close events (for native UI interactions)
    mainWindow.webContents.on('devtools-opened', async () => {
        log('DevTools opened via native UI');
        const config = await loadConfig();
        await saveConfig({ ...config, devToolsOpen: true });
    });

    mainWindow.webContents.on('devtools-closed', async () => {
        log('DevTools closed via native UI');
        const config = await loadConfig();
        await saveConfig({ ...config, devToolsOpen: false });
    });

    // Flush config to disk before the window actually closes.
    // The renderer persists config on every action, but this covers any
    // edge cases where the latest state hasn't reached disk yet.
    let isClosing = false;
    mainWindow.on('close', (e) => {
        if (isClosing) return;
        if (mainWindow && !mainWindow.isDestroyed()) {
            isClosing = true;
            e.preventDefault();
            mainWindow.webContents.send('app:before-close');

            const timeout = setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.destroy();
                }
            }, 3000);

            ipcMain.once('app:close-ready', () => {
                clearTimeout(timeout);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.destroy();
                }
            });
        }
    });

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
    // Initialize logger first
    initLogger();
    log('=== App Starting ===');
    log('Electron app ready');
    log('Config file location', { path: getConfigPath() });

    // Load encrypted API keys from disk
    loadEncryptedKeys();

    // Handle command line arguments (file associations) - MUST be done before creating window
    const args = process.argv.slice(1); // Skip the first argument (electron executable)
    log('Command line arguments received', { args, length: args.length });
    
    // Filter for markdown files (case-insensitive) and exclude flags
    pendingFilesToOpen = args.filter(arg => {
        const isMarkdown = isMarkdownFile(arg);
        const isNotFlag = !arg.startsWith('--') && !arg.startsWith('-');
        const result = isMarkdown && isNotFlag;
        log('Filtering argument', { arg, isMarkdown, isNotFlag, included: result });
        return result;
    });
    
    log('Pending files to open after filtering', { pendingFilesToOpen, count: pendingFilesToOpen.length });

    log('Registering IPC handlers');
    registerIpcHandlers();
    registerAIIpcHandlers();
    registerSecureStorageIpcHandlers();

    // Sync AI models with config
    log('Syncing AI models config');
    await syncAIModelsConfig();

    // Remove the native menu bar
    Menu.setApplicationMenu(null);
    log('Creating main window');
    createWindow();
    log('Main window created');
});

// Handle second instance (when user tries to open another file while app is running)
app.on('second-instance', (_event, commandLine) => {
    log('Second instance detected', { commandLine });
    
    // Focus the existing window
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }

    // Handle command line arguments from second instance
    const args = commandLine.slice(1); // Skip the first argument
    log('Second instance args', { args });
    
    const filesToOpen = args.filter(arg => {
        const isMarkdown = isMarkdownFile(arg);
        const isNotFlag = !arg.startsWith('--') && !arg.startsWith('-');
        return isMarkdown && isNotFlag;
    });
    
    log('Second instance files to open', { filesToOpen });

    if (filesToOpen.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
        log('Sending second instance files to renderer', { filesToOpen });
        mainWindow.webContents.send('open-files-from-args', filesToOpen);
    }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

// Global error handlers — catch crashes that would otherwise produce a blank screen
process.on('uncaughtException', async (error: Error) => {
    logError('Main process uncaught exception', error);
    await flushLogsSync();
});

process.on('unhandledRejection', async (reason: unknown) => {
    logError('Main process unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
    await flushLogsSync();
});

app.on('render-process-gone', (_event, webContents, details) => {
    logError('Renderer process gone', {
        message: `Renderer process gone: ${details.reason}`,
        exitCode: details.exitCode,
        reason: details.reason,
    });
    flushLogsSync();
});

// Flush logs before quit
app.on('before-quit', async () => {
    log('App quitting, flushing logs');
    await flushLogsSync();
});
