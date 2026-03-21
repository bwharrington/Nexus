import React, { useEffect, useState, useCallback, useRef, useMemo, Component, Suspense, lazy } from 'react';
import { CssBaseline, Box, Button, styled, Typography } from '@mui/material';
import { EditorProvider, useEditorState, useEditorDispatch, ThemeProvider, AIProviderCacheProvider } from './contexts';
import { Toolbar, TabBar, EditorPane, EmptyState, NotificationSnackbar, FileDirectoryContainer } from './components';

const AIChatDialog = lazy(() => import('./components/AIChatDialog').then(m => ({ default: m.AIChatDialog })));
const SettingsDialog = lazy(() => import('./components/SettingsDialog').then(m => ({ default: m.SettingsDialog })));
import { useWindowTitle, useFileOperations, useExternalFileWatcher, getFileType, useFileDirectories } from './hooks';
import { SplitDivider } from './styles/editor.styles';
import type { AttachedFile } from './components/FileAttachmentsList';
import type { IFile } from './types';

// Intercept console methods and forward to main process log file.
// error/warn are sent immediately; log/info are batched to reduce IPC traffic.
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
};

let logBatch: Array<{ level: string; args: unknown[] }> = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushLogBatch() {
    logFlushTimer = null;
    const entries = logBatch;
    logBatch = [];
    for (const entry of entries) {
        window.electronAPI.sendConsoleLog(entry.level, ...entry.args);
    }
}

function bufferLog(level: string, args: unknown[]) {
    logBatch.push({ level, args });
    if (!logFlushTimer) {
        logFlushTimer = setTimeout(flushLogBatch, 100);
    }
}

console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    bufferLog('log', args);
};

console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    bufferLog('info', args);
};

// Errors and warnings sent immediately — timing matters for diagnostics
console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    window.electronAPI.sendConsoleLog('warn', ...args);
};

console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    window.electronAPI.sendConsoleLog('error', ...args);
};

// Global renderer error handlers — forward uncaught errors to the main process log
window.onerror = (message, source, lineno, colno, error) => {
    console.error('[App] Uncaught error', { message, source, lineno, colno, stack: error?.stack });
    return false;
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    console.error('[App] Unhandled promise rejection', { message, stack });
};

// ErrorBoundary styled components
const ErrorContainer = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: theme.spacing(2),
    padding: theme.spacing(4),
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.primary,
}));

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[App] React render error caught by ErrorBoundary', {
            message: error.message,
            stack: error.stack,
            componentStack: info.componentStack,
        });
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <ErrorContainer>
                    <Typography variant="h5" fontWeight="bold">
                        Something went wrong
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, textAlign: 'center' }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </Typography>
                    <Button variant="contained" onClick={this.handleReload}>
                        Reload App
                    </Button>
                </ErrorContainer>
            );
        }
        return this.props.children;
    }
}

const AppContainer = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
});

const MainContent = styled(Box)({
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
});

const EditorArea = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
});

const DockedAIPanel = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    minWidth: 320,
});

const FileDirectoryPanel = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    minWidth: 180,
});

// Inner app component that uses context
function AppContent() {
    const DEFAULT_AI_DOCK_WIDTH = 505;
    const MIN_AI_DOCK_WIDTH = 320;
    const MIN_EDITOR_WIDTH = 320;
    const DEFAULT_FILE_DIR_WIDTH = 260;
    const MIN_FILE_DIR_WIDTH = 180;
    const MAX_FILE_DIR_WIDTH = 500;

    const state = useEditorState();
    const dispatch = useEditorDispatch();
    const { saveFile, saveFileAs, saveAllFiles, openFile, closeFile, closeAllFiles, showInFolder, createNewFile } = useFileOperations();
    const fileDirectories = useFileDirectories();

    // File directory panel state
    const [fileDirOpen, setFileDirOpen] = useState(state.config.fileDirectoryOpen ?? false);
    const [fileDirWidth, setFileDirWidth] = useState(state.config.fileDirectoryWidth ?? DEFAULT_FILE_DIR_WIDTH);
    const [isResizingFileDir, setIsResizingFileDir] = useState(false);
    const fileDirResizeStartRef = useRef({ x: 0, width: DEFAULT_FILE_DIR_WIDTH });
    const fileDirWidthRef = useRef(DEFAULT_FILE_DIR_WIDTH);

    // AI Chat dialog state
    const [aiChatOpen, setAiChatOpen] = useState(false);
    const [aiDockWidth, setAiDockWidth] = useState(DEFAULT_AI_DOCK_WIDTH);
    const [isResizingAiDock, setIsResizingAiDock] = useState(false);
    const mainContentRef = useRef<HTMLDivElement | null>(null);
    const aiDockResizeStartRef = useRef({ x: 0, width: DEFAULT_AI_DOCK_WIDTH });
    const aiDockWidthRef = useRef(DEFAULT_AI_DOCK_WIDTH);

    const appConfigRef = useRef(state.config);
    appConfigRef.current = state.config;

    const persistAiChatLayout = useCallback((updates: { aiChatDockWidth?: number }) => {
        const nextConfig = { ...appConfigRef.current, ...updates };
        dispatch({ type: 'SET_CONFIG', payload: nextConfig });
        void window.electronAPI.saveConfig(nextConfig).catch((error) => {
            console.error('Failed to save AI panel layout config:', error);
        });
    }, [dispatch]);

    // File directory panel persistence and resize
    const persistFileDirLayout = useCallback((updates: { fileDirectoryOpen?: boolean; fileDirectoryWidth?: number }) => {
        const nextConfig = { ...appConfigRef.current, ...updates };
        dispatch({ type: 'SET_CONFIG', payload: nextConfig });
        void window.electronAPI.saveConfig(nextConfig).catch((error) => {
            console.error('Failed to save file directory layout config:', error);
        });
    }, [dispatch]);

    const handleToggleFileDirectory = useCallback(() => {
        const next = !fileDirOpen;
        setFileDirOpen(next);
        persistFileDirLayout({ fileDirectoryOpen: next });
    }, [fileDirOpen, persistFileDirLayout]);

    fileDirWidthRef.current = fileDirWidth;

    useEffect(() => {
        setFileDirWidth(Math.max(MIN_FILE_DIR_WIDTH, state.config.fileDirectoryWidth ?? DEFAULT_FILE_DIR_WIDTH));
    }, [state.config.fileDirectoryWidth]);

    useEffect(() => {
        if (state.config.fileDirectoryOpen !== undefined) {
            setFileDirOpen(state.config.fileDirectoryOpen);
        }
    }, [state.config.fileDirectoryOpen]);

    const handleFileDirResizeStart = useCallback((e: React.MouseEvent) => {
        if (!fileDirOpen) return;
        fileDirResizeStartRef.current = { x: e.clientX, width: fileDirWidth };
        setIsResizingFileDir(true);
        e.preventDefault();
    }, [fileDirOpen, fileDirWidth]);

    useEffect(() => {
        if (!isResizingFileDir) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - fileDirResizeStartRef.current.x;
            const proposedWidth = fileDirResizeStartRef.current.width + deltaX;
            const clampedWidth = Math.max(MIN_FILE_DIR_WIDTH, Math.min(proposedWidth, MAX_FILE_DIR_WIDTH));
            setFileDirWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            setIsResizingFileDir(false);
            persistFileDirLayout({ fileDirectoryWidth: fileDirWidthRef.current });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingFileDir, persistFileDirLayout]);

    const handleOpenAIChat = useCallback(() => {
        setAiDockWidth(DEFAULT_AI_DOCK_WIDTH);
        setAiChatOpen(true);
    }, []);

    const handleCloseAIChat = useCallback(() => {
        setAiChatOpen(false);
    }, []);

    // Settings dialog state
    const [settingsOpen, setSettingsOpen] = useState(false);

    const handleOpenSettings = useCallback(() => {
        setSettingsOpen(true);
    }, []);

    const handleCloseSettings = useCallback(() => {
        setSettingsOpen(false);
    }, []);

    // AI Chat attached files state (lifted here so TabBar can also access it)
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

    const handleAddAttachedFiles = useCallback((newFiles: AttachedFile[]) => {
        setAttachedFiles(prev => [...prev, ...newFiles]);
    }, []);

    const handleRemoveAttachedFile = useCallback((filePath: string) => {
        setAttachedFiles(prev => prev.filter(f => f.path !== filePath));
    }, []);

    const handleToggleFileAttachment = useCallback((file: IFile) => {
        const filePath = file.path;
        if (!filePath) return;
        setAttachedFiles(prev => {
            const existing = prev.find(f => f.path === filePath);
            if (existing) {
                return prev.filter(f => f.path !== filePath);
            }
            const newAttachment: AttachedFile = {
                name: file.name,
                path: filePath,
                type: file.fileType,
                size: 0,
            };
            return [...prev, newAttachment];
        });
    }, []);

    const attachedFilePaths = useMemo(
        () => new Set(attachedFiles.map(f => f.path)),
        [attachedFiles],
    );

    const handleToggleNexusAttachmentFromTree = useCallback((filePath: string, fileName: string) => {
        setAttachedFiles(prev => {
            const existing = prev.find(f => f.path === filePath);
            if (existing) {
                return prev.filter(f => f.path !== filePath);
            }
            const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
            const type = ['rst', 'rest'].includes(ext) ? 'rst' : ['txt'].includes(ext) ? 'text' : 'markdown';
            const newAttachment: AttachedFile = {
                name: fileName,
                path: filePath,
                type,
                size: 0,
            };
            return [...prev, newAttachment];
        });
    }, []);

    const handleBulkAttachFromTree = useCallback((files: Array<{ path: string; name: string }>) => {
        setAttachedFiles(prev => {
            const existingPaths = new Set(prev.map(f => f.path));
            const newAttachments = files
                .filter(f => !existingPaths.has(f.path))
                .map(f => {
                    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
                    const type = ['rst', 'rest'].includes(ext) ? 'rst' : ['txt'].includes(ext) ? 'text' : 'markdown';
                    return { name: f.name, path: f.path, type, size: 0 } as AttachedFile;
                });
            return [...prev, ...newAttachments];
        });
    }, []);

    // Set up window title management
    useWindowTitle();

    // Set up keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+N - New File
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                createNewFile();
                return;
            }

            // Ctrl+O - Open File
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                openFile();
                return;
            }

            // Ctrl+S - Save File
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveFile();
                return;
            }

            // Ctrl+Shift+S - Save All Files
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                saveAllFiles();
                return;
            }

            // Ctrl+W - Close File
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                closeFile();
                return;
            }

            // Ctrl+F - Open Find Dialog
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('open-find-dialog', { detail: { tab: 'find' } }));
                return;
            }

            // Ctrl+H - Open Find and Replace Dialog
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('open-find-dialog', { detail: { tab: 'replace' } }));
                return;
            }

            // Ctrl+G - Go to Line (edit mode only)
            if (e.ctrlKey && e.key === 'g') {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('open-find-dialog', { detail: { tab: 'goto' } }));
                return;
            }

            // Ctrl+Shift+A - Open AI Chat Dialog
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                handleOpenAIChat();
                return;
            }

            // Ctrl+, - Open Settings Dialog
            if (e.ctrlKey && e.key === ',') {
                e.preventDefault();
                handleOpenSettings();
                return;
            }

            // Ctrl+E - Toggle Edit/Preview Mode (not available for .txt files)
            if (e.ctrlKey && e.key === 'e' && state.activeFileId) {
                e.preventDefault();
                const activeFile = state.openFiles.find(f => f.id === state.activeFileId);
                if (activeFile && activeFile.fileType !== 'text') {
                    // Get current scroll position before toggling
                    const element = activeFile.viewMode === 'edit'
                        ? document.querySelector('textarea') as HTMLTextAreaElement
                        : document.querySelector('[class*="MarkdownPreview"]') as HTMLDivElement;
                    const scrollPosition = element?.scrollTop || 0;

                    dispatch({
                        type: 'TOGGLE_VIEW_MODE',
                        payload: { id: state.activeFileId, scrollPosition }
                    });
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [createNewFile, openFile, saveFile, saveAllFiles, closeFile, state.activeFileId, state.openFiles, dispatch, handleOpenAIChat, handleOpenSettings]);

    // Set up AI Chat event listener
    useEffect(() => {
        const handleAIChatEvent = () => {
            handleOpenAIChat();
        };

        window.addEventListener('open-ai-chat', handleAIChatEvent);

        return () => {
            window.removeEventListener('open-ai-chat', handleAIChatEvent);
        };
    }, [handleOpenAIChat]);

    // Set up Settings event listener
    useEffect(() => {
        const handleSettingsEvent = () => {
            handleOpenSettings();
        };

        window.addEventListener('open-settings', handleSettingsEvent);

        return () => {
            window.removeEventListener('open-settings', handleSettingsEvent);
        };
    }, [handleOpenSettings]);

    // Set up menu event listeners
    useEffect(() => {
        const cleanups: (() => void)[] = [];

        cleanups.push(window.electronAPI.onMenuSave(() => {
            saveFile();
        }));

        cleanups.push(window.electronAPI.onMenuSaveAs(() => {
            saveFileAs();
        }));

        cleanups.push(window.electronAPI.onMenuSaveAll(() => {
            saveAllFiles();
        }));

        cleanups.push(window.electronAPI.onMenuClose(() => {
            closeFile();
        }));

        cleanups.push(window.electronAPI.onMenuCloseAll(() => {
            closeAllFiles();
        }));

        cleanups.push(window.electronAPI.onMenuShowInFolder(() => {
            showInFolder();
        }));

        return () => {
            cleanups.forEach(cleanup => cleanup());
        };
    }, [saveFile, saveFileAs, saveAllFiles, closeFile, closeAllFiles, showInFolder]);

    // Handle external file changes (silent reload or prompt based on config)
    useExternalFileWatcher({
        openFiles: state.openFiles,
        dispatch,
        silentFileUpdates: state.config.silentFileUpdates !== false,
    });

    // Keep aiDockWidthRef in sync so the resize mouseup handler always reads the latest width
    aiDockWidthRef.current = aiDockWidth;

    // Sync AI dock width from config once loaded.
    useEffect(() => {
        setAiDockWidth(Math.max(MIN_AI_DOCK_WIDTH, state.config.aiChatDockWidth ?? DEFAULT_AI_DOCK_WIDTH));
    }, [state.config.aiChatDockWidth]);

    const handleAiDockResizeStart = useCallback((e: React.MouseEvent) => {
        if (!aiChatOpen) {
            return;
        }

        aiDockResizeStartRef.current = { x: e.clientX, width: aiDockWidth };
        setIsResizingAiDock(true);
        e.preventDefault();
    }, [aiChatOpen, aiDockWidth]);

    useEffect(() => {
        if (!isResizingAiDock) {
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            const containerWidth = mainContentRef.current?.getBoundingClientRect().width ?? 0;
            const maxDockWidth = Math.max(MIN_AI_DOCK_WIDTH, containerWidth - MIN_EDITOR_WIDTH);
            const deltaX = e.clientX - aiDockResizeStartRef.current.x;
            const proposedWidth = aiDockResizeStartRef.current.width - deltaX;
            const clampedWidth = Math.max(MIN_AI_DOCK_WIDTH, Math.min(proposedWidth, maxDockWidth));
            setAiDockWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            setIsResizingAiDock(false);
            // Read from ref to avoid capturing stale aiDockWidth state in this closure
            persistAiChatLayout({ aiChatDockWidth: aiDockWidthRef.current });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingAiDock, persistAiChatLayout]);

    // Set up file opening from command line arguments (file associations)
    useEffect(() => {
        console.log('[App] Setting up file opening from command line');
        let hasReceivedInitialFiles = false;
        
        // Helper to extract filename from path (works on both Windows and Unix paths)
        const getFilename = (filePath: string) => {
            return filePath.split(/[\\/]/).pop() || filePath;
        };
        
        const isUnsupportedFormat = (filePath: string): boolean => {
            const fileType = getFileType(filePath);
            return fileType === 'unknown';
        };
        
        // Helper to open files
        const openFilesFromPaths = async (filePaths: string[]) => {
            console.log('[App] Opening files from paths:', filePaths);
            const unsupportedFiles: string[] = [];
            
            for (const filePath of filePaths) {
                try {
                    console.log('[App] Reading file:', filePath);
                    const fileData = await window.electronAPI.readFile(filePath);
                    console.log('[App] File data received:', { path: fileData?.filePath, contentLength: fileData?.content?.length });
                    if (fileData) {
                        // Track unsupported files
                        if (isUnsupportedFormat(fileData.filePath)) {
                            unsupportedFiles.push(getFilename(fileData.filePath));
                        }
                        const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                        const fileName = getFilename(fileData.filePath);
                        const fileType = getFileType(fileData.filePath);
                        console.log('[App] Dispatching OPEN_FILE action', { fileId, path: fileData.filePath, name: fileName, fileType });
                        dispatch({
                            type: 'OPEN_FILE',
                            payload: {
                                id: fileId,
                                path: fileData.filePath,
                                name: fileName,
                                content: fileData.content,
                                lineEnding: fileData.lineEnding,
                                fileType: fileType,
                            },
                        });
                        console.log('[App] File opened successfully, dispatched OPEN_FILE');
                    } else {
                        console.warn('[App] File data is null/undefined');
                    }
                } catch (error) {
                    console.error('[App] Failed to open file from args:', error);
                }
            }
            
            // Show notification for unsupported files
            if (unsupportedFiles.length > 0) {
                dispatch({
                    type: 'SHOW_NOTIFICATION',
                    payload: {
                        message: unsupportedFiles.length === 1
                            ? `"${unsupportedFiles[0]}" may not fully support preview.`
                            : `${unsupportedFiles.length} files may not fully support preview.`,
                        severity: 'warning',
                    },
                });
            }
        };

        // Listen for files from main process (this is the primary method)
        console.log('[App] Setting up onOpenFilesFromArgs listener');
        const cleanup = window.electronAPI.onOpenFilesFromArgs(async (filePaths: string[]) => {
            console.log('[App] *** Received files from main process via IPC event ***:', filePaths);
            hasReceivedInitialFiles = true;
            await openFilesFromPaths(filePaths);
        });

        // Signal to main process that renderer is ready and request initial files
        const loadInitialFiles = async () => {
            console.log('[App] Signaling renderer ready to main process');
            const filePaths = await window.electronAPI.rendererReady();
            console.log('[App] Renderer ready response - initial files:', filePaths);
            
            // If there are files from command line, open them
            if (filePaths && filePaths.length > 0) {
                console.log('[App] Opening files from renderer-ready response...');
                hasReceivedInitialFiles = true;
                await openFilesFromPaths(filePaths);
            } else {
                console.log('[App] No command line files from renderer-ready, checking via getInitialFiles...');
                
                // Fallback: also try getInitialFiles
                const fallbackFiles = await window.electronAPI.getInitialFiles();
                console.log('[App] getInitialFiles response:', fallbackFiles);
                
                if (fallbackFiles && fallbackFiles.length > 0) {
                    console.log('[App] Opening files from getInitialFiles...');
                    await openFilesFromPaths(fallbackFiles);
                } else {
                    console.log('[App] No command line files, restoring recent files from config...');
                    // No command line files, restore recent files from config
                    try {
                        const config = await window.electronAPI.loadConfig();
                        console.log('[App] Config loaded', { openFilesCount: config.openFiles.length });
                        for (const fileRef of config.openFiles) {
                            // Skip config.json - it should only be opened manually via Settings
                            if (fileRef.fileName.endsWith('config.json')) {
                                console.log('[App] Skipping config.json');
                                continue;
                            }
                            try {
                                console.log('[App] Restoring recent file:', fileRef.fileName, 'with mode:', fileRef.mode);
                                const result = await window.electronAPI.readFile(fileRef.fileName);
                                if (result) {
                                    const restoredFileType = getFileType(result.filePath);
                                    dispatch({
                                        type: 'OPEN_FILE',
                                        payload: {
                                            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                                            path: result.filePath,
                                            name: getFilename(result.filePath),
                                            content: result.content,
                                            lineEnding: result.lineEnding,
                                            // .txt files are always edit-only; ignore any saved preview mode
                                            viewMode: restoredFileType === 'text' ? 'edit' : fileRef.mode as 'edit' | 'preview',
                                            fileType: restoredFileType,
                                        },
                                    });
                                    console.log('[App] Recent file restored:', fileRef.fileName);
                                }
                            } catch (error) {
                                console.warn('[App] Failed to restore recent file:', fileRef.fileName, error);
                                // Silently skip files that can't be opened
                            }
                        }
                    } catch (error) {
                        console.error('[App] Failed to load recent files:', error);
                    }
                }
            }
        };
        
        console.log('[App] Calling loadInitialFiles...');
        loadInitialFiles();

        return cleanup;
    }, [dispatch]);

    const hasOpenFiles = state.openFiles.length > 0;

    return (
        <AppContainer>
            <Toolbar
                fileDirOpen={fileDirOpen}
                onToggleFileDirectory={handleToggleFileDirectory}
                onOpenFolder={fileDirectories.openFolder}
            />
            <TabBar
                attachedFiles={attachedFiles}
                onToggleFileAttachment={handleToggleFileAttachment}
            />
            <MainContent ref={mainContentRef}>
                <FileDirectoryPanel sx={{ width: fileDirWidth, display: fileDirOpen ? undefined : 'none' }}>
                    <FileDirectoryContainer
                        directories={fileDirectories.directories}
                        attachedFilePaths={attachedFilePaths}
                        onToggleNexusAttachment={handleToggleNexusAttachmentFromTree}
                        onAttachFiles={handleBulkAttachFromTree}
                        onOpenFolder={fileDirectories.openFolder}
                    />
                </FileDirectoryPanel>
                <SplitDivider
                    onMouseDown={handleFileDirResizeStart}
                    sx={{ flexShrink: 0, zIndex: 2, display: fileDirOpen ? undefined : 'none' }}
                />
                <EditorArea>
                    {hasOpenFiles ? <EditorPane /> : <EmptyState onOpenRecentDirectory={fileDirectories.openRecentDirectory} />}
                </EditorArea>
                <SplitDivider
                    onMouseDown={handleAiDockResizeStart}
                    sx={{ flexShrink: 0, zIndex: 2, display: aiChatOpen ? undefined : 'none' }}
                />
                <DockedAIPanel sx={{ width: aiDockWidth, display: aiChatOpen ? undefined : 'none' }}>
                    <Suspense fallback={null}>
                        <AIChatDialog
                            open={aiChatOpen}
                            onClose={handleCloseAIChat}
                            attachedFiles={attachedFiles}
                            setAttachedFiles={setAttachedFiles}
                            onAddAttachedFiles={handleAddAttachedFiles}
                            onRemoveAttachedFile={handleRemoveAttachedFile}
                            onToggleFileAttachment={handleToggleFileAttachment}
                        />
                    </Suspense>
                </DockedAIPanel>
                <Suspense fallback={null}>
                    <SettingsDialog open={settingsOpen} onClose={handleCloseSettings} />
                </Suspense>
            </MainContent>
            <NotificationSnackbar />
        </AppContainer>
    );
}

const App: React.FC = () => {
    return (
        <AppErrorBoundary>
            <ThemeProvider>
                <CssBaseline />
                <EditorProvider>
                    <AIProviderCacheProvider>
                        <AppContent />
                    </AIProviderCacheProvider>
                </EditorProvider>
            </ThemeProvider>
        </AppErrorBoundary>
    );
};

export default App;
