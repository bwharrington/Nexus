import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CssBaseline, Box, styled } from '@mui/material';
import { EditorProvider, useEditorState, useEditorDispatch, ThemeProvider, AIProviderCacheProvider } from './contexts';
import { Toolbar, TabBar, EditorPane, EmptyState, NotificationSnackbar, AIChatDialog, SettingsDialog } from './components';
import { useWindowTitle, useFileOperations, useExternalFileWatcher, getFileType } from './hooks';
import { SplitDivider } from './styles/editor.styles';
import type { AttachedFile } from './components/FileAttachmentsList';
import type { IFile } from './types';

// Intercept console methods and send to main process
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
};

console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    window.electronAPI.sendConsoleLog('log', ...args);
};

console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    window.electronAPI.sendConsoleLog('warn', ...args);
};

console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    window.electronAPI.sendConsoleLog('error', ...args);
};

console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    window.electronAPI.sendConsoleLog('info', ...args);
};

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

// Inner app component that uses context
function AppContent() {
    const DEFAULT_AI_DOCK_WIDTH = 420;
    const MIN_AI_DOCK_WIDTH = 320;
    const MIN_EDITOR_WIDTH = 320;

    const state = useEditorState();
    const dispatch = useEditorDispatch();
    const { saveFile, saveFileAs, saveAllFiles, openFile, closeFile, closeAllFiles, showInFolder, createNewFile } = useFileOperations();

    // AI Chat dialog state
    const [aiChatOpen, setAiChatOpen] = useState(false);
    const [aiDockWidth, setAiDockWidth] = useState(DEFAULT_AI_DOCK_WIDTH);
    const [isResizingAiDock, setIsResizingAiDock] = useState(false);
    const mainContentRef = useRef<HTMLDivElement | null>(null);
    const aiDockResizeStartRef = useRef({ x: 0, width: DEFAULT_AI_DOCK_WIDTH });

    const persistAiChatLayout = useCallback((updates: { aiChatDockWidth?: number }) => {
        const nextConfig = {
            ...state.config,
            ...updates,
        };
        dispatch({ type: 'SET_CONFIG', payload: nextConfig });
        void window.electronAPI.saveConfig(nextConfig).catch((error) => {
            console.error('Failed to save AI panel layout config:', error);
        });
    }, [dispatch, state.config]);

    const handleOpenAIChat = useCallback(() => {
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

    // Tracks whether the context doc was enabled/disabled so the preference is
    // preserved when the active file changes and the old one gets demoted.
    const contextDocEnabledRef = useRef(true);

    // Keep the context doc chip in sync with the active file at all times,
    // not just when the AI chat dialog is open.
    useEffect(() => {
        const activeFile = state.activeFileId
            ? state.openFiles.find(f => f.id === state.activeFileId)
            : null;

        const isValidContextFile = activeFile &&
            activeFile.path &&
            (activeFile.fileType === 'markdown' || activeFile.fileType === 'text');

        setAttachedFiles(prev => {
            const currentContextDoc = prev.find(f => f.isContextDoc);
            const manualFiles = prev.filter(f => !f.isContextDoc);

            if (!isValidContextFile) {
                if (!currentContextDoc) return prev;
                const demoted: AttachedFile = {
                    name: currentContextDoc.name,
                    path: currentContextDoc.path,
                    type: currentContextDoc.type,
                    size: currentContextDoc.size,
                };
                return [...manualFiles, demoted];
            }

            if (currentContextDoc?.path === activeFile.path) return prev;

            if (currentContextDoc) {
                contextDocEnabledRef.current = currentContextDoc.enabled !== false;
            }

            const newContextDoc: AttachedFile = {
                name: activeFile.name,
                path: activeFile.path!,
                type: activeFile.fileType,
                size: 0,
                isContextDoc: true,
                enabled: contextDocEnabledRef.current,
            };

            const deduplicatedManual = manualFiles.filter(f => f.path !== activeFile.path);

            if (currentContextDoc) {
                const demoted: AttachedFile = {
                    name: currentContextDoc.name,
                    path: currentContextDoc.path,
                    type: currentContextDoc.type,
                    size: currentContextDoc.size,
                };
                return [newContextDoc, ...deduplicatedManual, demoted];
            }

            return [newContextDoc, ...deduplicatedManual];
        });
    }, [state.activeFileId, state.openFiles]);

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
            // Never add a duplicate if the file is already the active context doc
            if (prev.some(f => f.path === filePath && f.isContextDoc)) return prev;
            const existing = prev.find(f => f.path === filePath && !f.isContextDoc);
            if (existing) {
                return prev.filter(f => f !== existing);
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

    const handleToggleContextDoc = useCallback((filePath: string) => {
        setAttachedFiles(prev => prev.map(f =>
            f.path === filePath && f.isContextDoc
                ? { ...f, enabled: !f.enabled }
                : f
        ));
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

            // Ctrl+E - Toggle Edit/Preview Mode
            if (e.ctrlKey && e.key === 'e' && state.activeFileId) {
                e.preventDefault();
                const activeFile = state.openFiles.find(f => f.id === state.activeFileId);
                if (activeFile) {
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
    useExternalFileWatcher({ openFiles: state.openFiles, dispatch });

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
            persistAiChatLayout({ aiChatDockWidth: aiDockWidth });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [aiDockWidth, isResizingAiDock, persistAiChatLayout]);

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
                                    dispatch({
                                        type: 'OPEN_FILE',
                                        payload: {
                                            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                                            path: result.filePath,
                                            name: getFilename(result.filePath),
                                            content: result.content,
                                            lineEnding: result.lineEnding,
                                            viewMode: fileRef.mode as 'edit' | 'preview',
                                            fileType: getFileType(result.filePath),
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
            <Toolbar />
            <TabBar
                attachedFiles={attachedFiles}
                onToggleFileAttachment={handleToggleFileAttachment}
                onToggleContextDoc={handleToggleContextDoc}
            />
            <MainContent ref={mainContentRef}>
                <EditorArea>
                    {hasOpenFiles ? <EditorPane /> : <EmptyState />}
                </EditorArea>
                <SplitDivider
                    onMouseDown={handleAiDockResizeStart}
                    sx={{ flexShrink: 0, zIndex: 2, display: aiChatOpen ? undefined : 'none' }}
                />
                <DockedAIPanel sx={{ width: aiDockWidth, display: aiChatOpen ? undefined : 'none' }}>
                    <AIChatDialog
                        open={aiChatOpen}
                        onClose={handleCloseAIChat}
                        attachedFiles={attachedFiles}
                        setAttachedFiles={setAttachedFiles}
                        onAddAttachedFiles={handleAddAttachedFiles}
                        onRemoveAttachedFile={handleRemoveAttachedFile}
                        onToggleFileAttachment={handleToggleFileAttachment}
                        onToggleContextDoc={handleToggleContextDoc}
                    />
                </DockedAIPanel>
                <SettingsDialog open={settingsOpen} onClose={handleCloseSettings} />
            </MainContent>
            <NotificationSnackbar />
        </AppContainer>
    );
}

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <CssBaseline />
            <EditorProvider>
                <AIProviderCacheProvider>
                    <AppContent />
                </AIProviderCacheProvider>
            </EditorProvider>
        </ThemeProvider>
    );
};

export default App;
