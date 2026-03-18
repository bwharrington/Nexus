import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorState, useEditorDispatch } from '../contexts';
import { getFileType } from './useFileOperations';
import type { DirectoryNode, FileDirectorySortOrder } from '../types';

interface UseFileDirectoryReturn {
    tree: DirectoryNode | null;
    rootPath: string | null;
    isLoading: boolean;
    expandedPaths: Set<string>;
    sortOrder: FileDirectorySortOrder;
    isAllExpanded: boolean;
    renamingPath: string | null;
    openFolder: () => Promise<void>;
    closeFolder: () => void;
    refreshTree: () => Promise<void>;
    toggleNode: (path: string) => void;
    expandAll: () => void;
    collapseAll: () => void;
    setSortOrder: (order: FileDirectorySortOrder) => void;
    createNewFile: (parentPath?: string) => Promise<void>;
    createNewFolder: (parentPath?: string) => Promise<void>;
    moveItem: (sourcePath: string, destDirPath: string) => Promise<void>;
    deleteItem: (itemPath: string) => Promise<void>;
    renameItem: (oldPath: string, newName: string) => Promise<void>;
    startRename: (path: string) => void;
    cancelRename: () => void;
    openFileInEditor: (filePath: string) => Promise<void>;
    openRecentDirectory: (dirPath: string) => Promise<void>;
}

function collectAllFolderPaths(node: DirectoryNode): string[] {
    const paths: string[] = [];
    if (node.isDirectory) {
        paths.push(node.path);
        if (node.children) {
            for (const child of node.children) {
                paths.push(...collectAllFolderPaths(child));
            }
        }
    }
    return paths;
}

export function useFileDirectory(): UseFileDirectoryReturn {
    const state = useEditorState();
    const dispatch = useEditorDispatch();

    const [tree, setTree] = useState<DirectoryNode | null>(null);
    const [rootPath, setRootPath] = useState<string | null>(state.config.fileDirectoryPath ?? null);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [sortOrder, setSortOrderState] = useState<FileDirectorySortOrder>(state.config.fileDirectorySort ?? 'asc');
    const [renamingPath, setRenamingPath] = useState<string | null>(null);

    const rootPathRef = useRef(rootPath);
    rootPathRef.current = rootPath;

    // Refs that always point at the latest state, used inside callbacks
    // so that the callbacks themselves have stable identities.
    const configRef = useRef(state.config);
    configRef.current = state.config;

    const openFilesRef = useRef(state.openFiles);
    openFilesRef.current = state.openFiles;

    const persistConfig = useCallback((updates: Partial<{
        fileDirectoryPath: string | undefined;
        fileDirectoryOpen: boolean;
        fileDirectoryWidth: number;
        fileDirectorySort: FileDirectorySortOrder;
        openDirectories: string[];
        recentDirectories: string[];
    }>) => {
        const nextConfig = { ...configRef.current, ...updates };
        dispatch({ type: 'SET_CONFIG', payload: nextConfig });
        window.electronAPI.saveConfig(nextConfig).catch((err) => {
            console.error('Failed to save file directory config:', err);
        });
    }, [dispatch]);

    const readTree = useCallback(async (dirPath: string) => {
        setIsLoading(true);
        try {
            const result = await window.electronAPI.readDirectory(dirPath);
            if (result) {
                setTree(result);
            }
        } catch (err) {
            console.error('Failed to read directory:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshTree = useCallback(async () => {
        const rp = rootPathRef.current;
        if (rp) {
            await readTree(rp);
        }
    }, [readTree]);

    // Restore saved directory when config finishes loading.
    // Config loads asynchronously so fileDirectoryPath is initially undefined;
    // this effect fires once the real config arrives via SET_CONFIG.
    // hasRestoredRef is a one-shot guard -- never reset it.
    const hasRestoredRef = useRef(false);
    useEffect(() => {
        if (hasRestoredRef.current) return;
        if (state.config.fileDirectoryPath && !tree) {
            hasRestoredRef.current = true;
            const dirPath = state.config.fileDirectoryPath;
            setRootPath(dirPath);
            rootPathRef.current = dirPath;
            readTree(dirPath);

            const needsOpen = !state.config.fileDirectoryOpen;
            const existingOpen = state.config.openDirectories ?? [];
            const needsDir = !existingOpen.includes(dirPath);
            if (needsOpen || needsDir) {
                persistConfig({
                    ...(needsOpen && { fileDirectoryOpen: true }),
                    ...(needsDir && { openDirectories: [dirPath, ...existingOpen] }),
                });
            }
        }
    }, [state.config.fileDirectoryPath, state.config.fileDirectoryOpen, tree, readTree, persistConfig]);

    // Auto-expand root when tree first loads
    useEffect(() => {
        if (tree && expandedPaths.size === 0) {
            setExpandedPaths(new Set([tree.path]));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tree?.path]);

    const pushRecentDirectory = useCallback((dirPath: string) => {
        const existing = configRef.current.recentDirectories ?? [];
        const filtered = existing.filter(p => p !== dirPath);
        const updated = [dirPath, ...filtered].slice(0, 10);
        persistConfig({ recentDirectories: updated });
    }, [persistConfig]);

    const openFolder = useCallback(async () => {
        const folderPath = await window.electronAPI.openFolderDialog();
        if (!folderPath) return;

        hasRestoredRef.current = true;
        setRootPath(folderPath);
        rootPathRef.current = folderPath;

        const existingOpen = configRef.current.openDirectories ?? [];
        const openDirectories = existingOpen.includes(folderPath)
            ? existingOpen
            : [folderPath, ...existingOpen];

        const existingRecent = configRef.current.recentDirectories ?? [];
        const recentDirectories = [folderPath, ...existingRecent.filter(p => p !== folderPath)].slice(0, 10);

        persistConfig({ fileDirectoryPath: folderPath, fileDirectoryOpen: true, openDirectories, recentDirectories });
        await readTree(folderPath);
        setExpandedPaths(new Set([folderPath]));
    }, [readTree, persistConfig]);

    const closeFolder = useCallback(() => {
        const closingPath = rootPathRef.current;
        setTree(null);
        setRootPath(null);
        rootPathRef.current = null;
        setExpandedPaths(new Set());
        const openDirectories = (configRef.current.openDirectories ?? []).filter(p => p !== closingPath);
        persistConfig({ fileDirectoryPath: undefined, fileDirectoryOpen: false, openDirectories });
    }, [persistConfig]);

    const openRecentDirectory = useCallback(async (dirPath: string) => {
        hasRestoredRef.current = true;
        setRootPath(dirPath);
        rootPathRef.current = dirPath;

        const existingOpen = configRef.current.openDirectories ?? [];
        const openDirectories = existingOpen.includes(dirPath)
            ? existingOpen
            : [dirPath, ...existingOpen];

        pushRecentDirectory(dirPath);
        persistConfig({ fileDirectoryPath: dirPath, fileDirectoryOpen: true, openDirectories });
        await readTree(dirPath);
        setExpandedPaths(new Set([dirPath]));
    }, [readTree, persistConfig, pushRecentDirectory]);

    const toggleNode = useCallback((nodePath: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(nodePath)) {
                next.delete(nodePath);
            } else {
                next.add(nodePath);
            }
            return next;
        });
    }, []);

    const isAllExpanded = tree
        ? collectAllFolderPaths(tree).every(p => expandedPaths.has(p))
        : false;

    const expandAll = useCallback(() => {
        if (!tree) return;
        const allPaths = collectAllFolderPaths(tree);
        setExpandedPaths(new Set(allPaths));
    }, [tree]);

    const collapseAll = useCallback(() => {
        setExpandedPaths(new Set());
    }, []);

    const setSortOrder = useCallback((order: FileDirectorySortOrder) => {
        setSortOrderState(order);
        persistConfig({ fileDirectorySort: order });
    }, [persistConfig]);

    const openFileInEditor = useCallback(async (filePath: string) => {
        const existing = openFilesRef.current.find(f => f.path === filePath);
        if (existing) {
            dispatch({ type: 'SELECT_TAB', payload: { id: existing.id } });
            return;
        }

        try {
            const fileData = await window.electronAPI.readFile(filePath);
            if (fileData) {
                const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                const fileName = filePath.split(/[\\/]/).pop() || filePath;
                dispatch({
                    type: 'OPEN_FILE',
                    payload: {
                        id: fileId,
                        path: fileData.filePath,
                        name: fileName,
                        content: fileData.content,
                        lineEnding: fileData.lineEnding,
                        fileType: getFileType(fileData.filePath),
                    },
                });

                const newRef = { fileName: fileData.filePath, mode: 'edit' as const };
                const openFileRefs = [
                    ...openFilesRef.current
                        .filter(f => f.path !== null && !f.path.endsWith('config.json') && f.viewMode !== 'diff')
                        .map(f => ({ fileName: f.path!, mode: f.viewMode as 'edit' | 'preview' })),
                    newRef,
                ].filter((ref, idx, self) =>
                    idx === self.findIndex(r => r.fileName === ref.fileName)
                );
                const newRecentFiles = [
                    newRef,
                    ...configRef.current.recentFiles.filter(ref => ref.fileName !== fileData.filePath),
                ].slice(0, 10);

                const nextConfig = { ...configRef.current, openFiles: openFileRefs, recentFiles: newRecentFiles };
                dispatch({ type: 'SET_CONFIG', payload: nextConfig });
                window.electronAPI.saveConfig(nextConfig).catch((err) => {
                    console.error('Failed to persist config after opening file:', err);
                });
            }
        } catch (err) {
            console.error('Failed to open file from directory tree:', err);
        }
    }, [dispatch]);

    const createNewFile = useCallback(async (parentPath?: string) => {
        const targetDir = parentPath ?? rootPathRef.current;
        if (!targetDir) return;

        try {
            const result = await window.electronAPI.createFileOnDisk(targetDir);
            if (result.success && result.filePath) {
                await refreshTree();
                if (parentPath) {
                    setExpandedPaths(prev => {
                        const next = new Set(prev);
                        next.add(parentPath);
                        return next;
                    });
                }
                await openFileInEditor(result.filePath);
            }
        } catch (err) {
            console.error('Failed to create file:', err);
        }
    }, [refreshTree, openFileInEditor]);

    const createNewFolder = useCallback(async (parentPath?: string) => {
        const targetDir = parentPath ?? rootPathRef.current;
        if (!targetDir) return;

        try {
            const result = await window.electronAPI.createFolder(targetDir);
            if (result.success && result.folderPath) {
                await refreshTree();
                if (parentPath) {
                    setExpandedPaths(prev => {
                        const next = new Set(prev);
                        next.add(parentPath);
                        return next;
                    });
                }
                setRenamingPath(result.folderPath);
            }
        } catch (err) {
            console.error('Failed to create folder:', err);
        }
    }, [refreshTree]);

    const moveItem = useCallback(async (sourcePath: string, destDirPath: string) => {
        try {
            const result = await window.electronAPI.moveItem(sourcePath, destDirPath);
            if (result.success && result.destPath) {
                const openFile = openFilesRef.current.find(f => f.path === sourcePath);
                if (openFile) {
                    const newName = result.destPath.split(/[\\/]/).pop() || openFile.name;
                    dispatch({
                        type: 'UPDATE_FILE_PATH',
                        payload: { id: openFile.id, path: result.destPath, name: newName },
                    });
                }
                await refreshTree();
            }
        } catch (err) {
            console.error('Failed to move item:', err);
        }
    }, [dispatch, refreshTree]);

    const deleteItem = useCallback(async (itemPath: string) => {
        try {
            const result = await window.electronAPI.deleteItem(itemPath);
            if (result.success) {
                for (const file of openFilesRef.current) {
                    if (file.path && (file.path === itemPath || file.path.startsWith(itemPath + '\\') || file.path.startsWith(itemPath + '/'))) {
                        dispatch({ type: 'CLOSE_FILE', payload: { id: file.id } });
                    }
                }
                await refreshTree();
            }
        } catch (err) {
            console.error('Failed to delete item:', err);
        }
    }, [dispatch, refreshTree]);

    const renameItem = useCallback(async (oldPath: string, newName: string) => {
        if (!newName.trim()) {
            setRenamingPath(null);
            return;
        }

        const parentDir = oldPath.substring(0, oldPath.lastIndexOf('\\') === -1
            ? oldPath.lastIndexOf('/')
            : oldPath.lastIndexOf('\\'));
        const separator = oldPath.includes('\\') ? '\\' : '/';
        const newPath = parentDir + separator + newName;

        if (oldPath === newPath) {
            setRenamingPath(null);
            return;
        }

        try {
            const result = await window.electronAPI.renameFile(oldPath, newPath);
            if (result.success) {
                const openFile = openFilesRef.current.find(f => f.path === oldPath);
                if (openFile) {
                    dispatch({
                        type: 'UPDATE_FILE_PATH',
                        payload: { id: openFile.id, path: newPath, name: newName },
                    });
                }
                await refreshTree();
                setExpandedPaths(prev => {
                    if (!prev.has(oldPath)) return prev;
                    const next = new Set(prev);
                    next.delete(oldPath);
                    next.add(newPath);
                    return next;
                });
            }
        } catch (err) {
            console.error('Failed to rename item:', err);
        } finally {
            setRenamingPath(null);
        }
    }, [dispatch, refreshTree]);

    const startRename = useCallback((path: string) => {
        setRenamingPath(path);
    }, []);

    const cancelRename = useCallback(() => {
        setRenamingPath(null);
    }, []);

    return {
        tree,
        rootPath,
        isLoading,
        expandedPaths,
        sortOrder,
        isAllExpanded,
        renamingPath,
        openFolder,
        closeFolder,
        refreshTree,
        toggleNode,
        expandAll,
        collapseAll,
        setSortOrder,
        createNewFile,
        createNewFolder,
        moveItem,
        deleteItem,
        renameItem,
        startRename,
        cancelRename,
        openFileInEditor,
        openRecentDirectory,
    };
}
