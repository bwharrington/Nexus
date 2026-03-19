import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEditorState, useEditorDispatch } from '../contexts';
import { getFileType } from '../utils/fileHelpers';
import type { DirectoryNode, FileDirectorySortOrder, IConfig } from '../types';
import { sortChildren } from '../components/FileTreeNode';
import { useDirectoryWatcher } from './useDirectoryWatcher';

export interface DirectoryInstance {
    id: string;
    rootPath: string;
    tree: DirectoryNode | null;
    isLoading: boolean;
    expandedPaths: Set<string>;
    sortOrder: FileDirectorySortOrder;
    isAllExpanded: boolean;
    renamingPath: string | null;
    selectedPaths: Set<string>;
    showAllFiles: boolean;
    refreshTree: () => Promise<void>;
    closeDirectory: () => void;
    toggleNode: (path: string) => void;
    expandAll: () => void;
    collapseAll: () => void;
    setSortOrder: (order: FileDirectorySortOrder) => void;
    selectFileMulti: (path: string, ctrlKey: boolean, shiftKey: boolean) => void;
    toggleShowAllFiles: () => Promise<void>;
    createNewFile: (parentPath?: string) => Promise<void>;
    createNewFolder: (parentPath?: string) => Promise<void>;
    moveItem: (sourcePath: string, destDirPath: string) => Promise<void>;
    deleteItem: (itemPath: string) => Promise<void>;
    deleteMultipleItems: (paths: string[]) => Promise<void>;
    renameItem: (oldPath: string, newName: string) => Promise<void>;
    startRename: (path: string) => void;
    cancelRename: () => void;
    openFileInEditor: (filePath: string) => Promise<void>;
    openMultipleFiles: (paths: string[]) => Promise<void>;
}

export interface UseFileDirectoriesReturn {
    directories: DirectoryInstance[];
    openFolder: () => Promise<void>;
    openRecentDirectory: (dirPath: string) => Promise<void>;
}

interface InstanceState {
    tree: DirectoryNode | null;
    isLoading: boolean;
    expandedPaths: Set<string>;
    sortOrder: FileDirectorySortOrder;
    renamingPath: string | null;
    selectedPaths: Set<string>;
    lastSelectedPath: string | null;
    showAllFiles: boolean;
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

function collectVisibleFiles(
    nodes: DirectoryNode[],
    expandedPaths: Set<string>,
    sortOrder: FileDirectorySortOrder,
): string[] {
    const result: string[] = [];
    for (const node of sortChildren(nodes, sortOrder)) {
        if (!node.isDirectory) {
            result.push(node.path);
        } else if (node.children && expandedPaths.has(node.path)) {
            result.push(...collectVisibleFiles(node.children, expandedPaths, sortOrder));
        }
    }
    return result;
}

export function useFileDirectories(): UseFileDirectoriesReturn {
    const state = useEditorState();
    const dispatch = useEditorDispatch();

    const configRef = useRef(state.config);
    configRef.current = state.config;

    const openFilesRef = useRef(state.openFiles);
    openFilesRef.current = state.openFiles;

    const [instances, setInstances] = useState<Map<string, InstanceState>>(new Map());
    const [orderedPaths, setOrderedPaths] = useState<string[]>([]);

    const instancesRef = useRef(instances);
    instancesRef.current = instances;

    const orderedPathsRef = useRef(orderedPaths);
    orderedPathsRef.current = orderedPaths;

    const persistConfig = useCallback((updates: Partial<IConfig>) => {
        const nextConfig = { ...configRef.current, ...updates };
        dispatch({ type: 'SET_CONFIG', payload: nextConfig });
        window.electronAPI.saveConfig(nextConfig).catch((err) => {
            console.error('Failed to save file directory config:', err);
        });
    }, [dispatch]);

    const updateInstance = useCallback((dirPath: string, updater: (prev: InstanceState) => InstanceState) => {
        setInstances(prev => {
            const existing = prev.get(dirPath);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(dirPath, updater(existing));
            return next;
        });
    }, []);

    // Sync selectedPaths across all directory instances whenever the active tab changes.
    // This ensures selection resets to just the active file when switching tabs.
    useEffect(() => {
        const activeFile = state.openFiles.find(f => f.id === state.activeFileId);
        const activeFilePath = activeFile?.path ?? null;

        orderedPathsRef.current.forEach(dirPath => {
            const isInDir = activeFilePath &&
                (activeFilePath.startsWith(dirPath + '\\') || activeFilePath.startsWith(dirPath + '/'));
            updateInstance(dirPath, s => {
                const newSelected = isInDir ? activeFilePath : null;
                // Avoid no-op updates
                if (s.selectedPaths.size === (newSelected ? 1 : 0) &&
                    (!newSelected || s.selectedPaths.has(newSelected))) return s;
                return {
                    ...s,
                    selectedPaths: newSelected ? new Set([newSelected]) : new Set<string>(),
                    lastSelectedPath: newSelected,
                };
            });
        });
    }, [state.activeFileId, state.openFiles, updateInstance]);

    const readTree = useCallback(async (dirPath: string) => {
        updateInstance(dirPath, s => ({ ...s, isLoading: true }));
        try {
            const inst = instancesRef.current.get(dirPath);
            const showAllFiles = inst?.showAllFiles ?? false;
            const result = await window.electronAPI.readDirectory(dirPath, showAllFiles);
            updateInstance(dirPath, s => {
                const newState = { ...s, isLoading: false };
                if (result) {
                    newState.tree = result;
                    if (s.expandedPaths.size === 0) {
                        newState.expandedPaths = new Set([result.path]);
                    }
                }
                return newState;
            });
            window.electronAPI.watchDirectory(dirPath);
        } catch (err) {
            console.error('Failed to read directory:', err);
            updateInstance(dirPath, s => ({ ...s, isLoading: false }));
        }
    }, [updateInstance]);

    const addDirectory = useCallback((dirPath: string, sortOrder?: FileDirectorySortOrder, showAllFiles?: boolean) => {
        setInstances(prev => {
            if (prev.has(dirPath)) return prev;
            const next = new Map(prev);
            next.set(dirPath, {
                tree: null,
                isLoading: false,
                expandedPaths: new Set<string>(),
                sortOrder: sortOrder ?? 'asc',
                renamingPath: null,
                selectedPaths: new Set<string>(),
                lastSelectedPath: null,
                showAllFiles: showAllFiles ?? false,
            });
            return next;
        });
        setOrderedPaths(prev => prev.includes(dirPath) ? prev : [...prev, dirPath]);
    }, []);

    const removeDirectory = useCallback((dirPath: string) => {
        setInstances(prev => {
            if (!prev.has(dirPath)) return prev;
            const next = new Map(prev);
            next.delete(dirPath);
            return next;
        });
        setOrderedPaths(prev => prev.filter(p => p !== dirPath));
    }, []);

    // --- Config persistence helpers ---

    const pushRecentDirectory = useCallback((dirPath: string) => {
        const existing = configRef.current.recentDirectories ?? [];
        const filtered = existing.filter(p => p !== dirPath);
        const updated = [dirPath, ...filtered].slice(0, 10);
        persistConfig({ recentDirectories: updated });
    }, [persistConfig]);

    const persistDirectoryList = useCallback((newOrderedPaths: string[]) => {
        const existingOpen = configRef.current.openDirectories ?? [];
        const openDirectories = [...new Set([...newOrderedPaths, ...existingOpen])];
        persistConfig({
            openDirectoryPaths: newOrderedPaths,
            openDirectories,
            fileDirectoryOpen: newOrderedPaths.length > 0 ? true : undefined,
        });
    }, [persistConfig]);

    // --- Auto-restore on startup ---

    const hasRestoredRef = useRef(false);
    useEffect(() => {
        if (hasRestoredRef.current) return;

        // Migrate old single-directory config
        const legacyPath = state.config.fileDirectoryPath;
        const savedPaths = state.config.openDirectoryPaths;

        let pathsToRestore: string[] = [];
        if (savedPaths && savedPaths.length > 0) {
            pathsToRestore = savedPaths;
        } else if (legacyPath) {
            pathsToRestore = [legacyPath];
        }

        if (pathsToRestore.length === 0) return;

        hasRestoredRef.current = true;
        const savedSorts = state.config.openDirectorySort ?? {};
        const savedShowAllFiles = state.config.openDirectoryShowAllFiles ?? {};

        for (const dirPath of pathsToRestore) {
            addDirectory(dirPath, savedSorts[dirPath], savedShowAllFiles[dirPath]);
        }

        // If migrating from legacy, persist the new format and clear legacy
        if (!savedPaths && legacyPath) {
            const legacySort = state.config.fileDirectorySort ?? 'asc';
            persistConfig({
                openDirectoryPaths: pathsToRestore,
                openDirectorySort: { [legacyPath]: legacySort },
                fileDirectoryPath: undefined,
                fileDirectorySort: undefined,
                fileDirectoryOpen: true,
            });
        } else if (!state.config.fileDirectoryOpen) {
            persistConfig({ fileDirectoryOpen: true });
        }

        for (const dirPath of pathsToRestore) {
            readTree(dirPath);
        }
    }, [state.config.openDirectoryPaths, state.config.fileDirectoryPath, state.config.openDirectorySort, state.config.fileDirectorySort, state.config.fileDirectoryOpen, addDirectory, readTree, persistConfig]);

    // --- Public actions ---

    const openFolder = useCallback(async () => {
        const folderPath = await window.electronAPI.openFolderDialog();
        if (!folderPath) return;

        hasRestoredRef.current = true;

        if (instancesRef.current.has(folderPath)) return;

        const savedSorts = configRef.current.openDirectorySort ?? {};
        addDirectory(folderPath, savedSorts[folderPath]);

        const newOrdered = [...orderedPathsRef.current, folderPath];
        const existingOpen = configRef.current.openDirectories ?? [];
        const openDirectories = existingOpen.includes(folderPath)
            ? existingOpen
            : [folderPath, ...existingOpen];
        const existingRecent = configRef.current.recentDirectories ?? [];
        const recentDirectories = [folderPath, ...existingRecent.filter(p => p !== folderPath)].slice(0, 10);

        persistConfig({
            openDirectoryPaths: newOrdered,
            openDirectories,
            recentDirectories,
            fileDirectoryOpen: true,
        });

        await readTree(folderPath);
    }, [addDirectory, readTree, persistConfig]);

    const openRecentDirectory = useCallback(async (dirPath: string) => {
        hasRestoredRef.current = true;

        if (instancesRef.current.has(dirPath)) return;

        const savedSorts = configRef.current.openDirectorySort ?? {};
        addDirectory(dirPath, savedSorts[dirPath]);

        const newOrdered = [...orderedPathsRef.current, dirPath];
        const existingOpen = configRef.current.openDirectories ?? [];
        const openDirectories = existingOpen.includes(dirPath)
            ? existingOpen
            : [dirPath, ...existingOpen];

        pushRecentDirectory(dirPath);
        persistConfig({
            openDirectoryPaths: newOrdered,
            openDirectories,
            fileDirectoryOpen: true,
        });

        await readTree(dirPath);
    }, [addDirectory, readTree, persistConfig, pushRecentDirectory]);

    // --- Shared openFileInEditor (same for all directories) ---

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
                const fileType = getFileType(fileData.filePath);
                dispatch({
                    type: 'OPEN_FILE',
                    payload: {
                        id: fileId,
                        path: fileData.filePath,
                        name: fileName,
                        content: fileData.content,
                        lineEnding: fileData.lineEnding,
                        fileType,
                        viewMode: fileType === 'text' ? 'edit' : undefined,
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

    // --- Build DirectoryInstance objects ---

    const directories: DirectoryInstance[] = useMemo(() => {
        return orderedPaths.map(dirPath => {
            const inst = instances.get(dirPath);
            if (!inst) return null;

            const { tree, isLoading, expandedPaths, sortOrder, renamingPath, selectedPaths, showAllFiles } = inst;
            const isAllExpanded = tree
                ? collectAllFolderPaths(tree).every(p => expandedPaths.has(p))
                : false;

            const refreshTree = async () => {
                const current = instancesRef.current.get(dirPath);
                if (current) {
                    updateInstance(dirPath, s => ({ ...s, isLoading: true }));
                    try {
                        const result = await window.electronAPI.readDirectory(dirPath, current.showAllFiles);
                        updateInstance(dirPath, s => ({
                            ...s,
                            isLoading: false,
                            tree: result ?? s.tree,
                        }));
                    } catch {
                        updateInstance(dirPath, s => ({ ...s, isLoading: false }));
                    }
                }
            };

            const closeDirectory = () => {
                window.electronAPI.unwatchDirectory(dirPath);
                removeDirectory(dirPath);
                const newOrdered = orderedPathsRef.current.filter(p => p !== dirPath);
                const openDirs = (configRef.current.openDirectories ?? []).filter(p => p !== dirPath);
                const sortMap = { ...(configRef.current.openDirectorySort ?? {}) };
                delete sortMap[dirPath];
                persistConfig({
                    openDirectoryPaths: newOrdered,
                    openDirectories: openDirs,
                    openDirectorySort: sortMap,
                    ...(newOrdered.length === 0 ? { fileDirectoryOpen: false } : {}),
                });
            };

            const toggleNode = (nodePath: string) => {
                updateInstance(dirPath, s => {
                    const next = new Set(s.expandedPaths);
                    if (next.has(nodePath)) next.delete(nodePath);
                    else next.add(nodePath);
                    return { ...s, expandedPaths: next };
                });
            };

            const expandAll = () => {
                const currentInst = instancesRef.current.get(dirPath);
                if (!currentInst?.tree) return;
                const allPaths = collectAllFolderPaths(currentInst.tree);
                updateInstance(dirPath, s => ({ ...s, expandedPaths: new Set(allPaths) }));
            };

            const collapseAll = () => {
                updateInstance(dirPath, s => ({ ...s, expandedPaths: new Set<string>() }));
            };

            const setSortOrder = (order: FileDirectorySortOrder) => {
                updateInstance(dirPath, s => ({ ...s, sortOrder: order }));
                const sortMap = { ...(configRef.current.openDirectorySort ?? {}), [dirPath]: order };
                persistConfig({ openDirectorySort: sortMap });
            };

            const selectFileMulti = (filePath: string, ctrlKey: boolean, shiftKey: boolean) => {
                updateInstance(dirPath, s => {
                    if (shiftKey && s.lastSelectedPath) {
                        const rootChildren = s.tree?.children ?? [];
                        const visibleFiles = collectVisibleFiles(rootChildren, s.expandedPaths, s.sortOrder);
                        const anchorIdx = visibleFiles.indexOf(s.lastSelectedPath);
                        const targetIdx = visibleFiles.indexOf(filePath);
                        if (anchorIdx === -1 || targetIdx === -1) {
                            return { ...s, selectedPaths: new Set([filePath]), lastSelectedPath: filePath };
                        }
                        const start = Math.min(anchorIdx, targetIdx);
                        const end = Math.max(anchorIdx, targetIdx);
                        const range = visibleFiles.slice(start, end + 1);
                        const newSet = ctrlKey ? new Set([...s.selectedPaths, ...range]) : new Set(range);
                        return { ...s, selectedPaths: newSet };
                    } else if (ctrlKey) {
                        const next = new Set(s.selectedPaths);
                        if (next.has(filePath)) next.delete(filePath);
                        else next.add(filePath);
                        return { ...s, selectedPaths: next, lastSelectedPath: filePath };
                    } else {
                        return { ...s, selectedPaths: new Set([filePath]), lastSelectedPath: filePath };
                    }
                });
                // Plain click: switch tab if file is already open
                if (!ctrlKey && !shiftKey) {
                    const openFile = openFilesRef.current.find(f => f.path === filePath);
                    if (openFile) {
                        dispatch({ type: 'SELECT_TAB', payload: { id: openFile.id } });
                    }
                }
            };

            const toggleShowAllFiles = async () => {
                const newValue = !showAllFiles;
                updateInstance(dirPath, s => ({ ...s, showAllFiles: newValue }));
                const showAllMap = { ...(configRef.current.openDirectoryShowAllFiles ?? {}), [dirPath]: newValue };
                persistConfig({ openDirectoryShowAllFiles: showAllMap });
                // Re-read tree with new filter setting
                updateInstance(dirPath, s => ({ ...s, isLoading: true }));
                try {
                    const result = await window.electronAPI.readDirectory(dirPath, newValue);
                    updateInstance(dirPath, s => ({
                        ...s,
                        isLoading: false,
                        tree: result ?? s.tree,
                    }));
                } catch {
                    updateInstance(dirPath, s => ({ ...s, isLoading: false }));
                }
            };

            const createNewFile = async (parentPath?: string) => {
                const targetDir = parentPath ?? dirPath;
                try {
                    const result = await window.electronAPI.createFileOnDisk(targetDir);
                    if (result.success && result.filePath) {
                        await refreshTree();
                        if (parentPath) {
                            updateInstance(dirPath, s => {
                                const next = new Set(s.expandedPaths);
                                next.add(parentPath);
                                return { ...s, expandedPaths: next };
                            });
                        }
                        await openFileInEditor(result.filePath);
                    }
                } catch (err) {
                    console.error('Failed to create file:', err);
                }
            };

            const createNewFolder = async (parentPath?: string) => {
                const targetDir = parentPath ?? dirPath;
                try {
                    const result = await window.electronAPI.createFolder(targetDir);
                    if (result.success && result.folderPath) {
                        await refreshTree();
                        if (parentPath) {
                            updateInstance(dirPath, s => {
                                const next = new Set(s.expandedPaths);
                                next.add(parentPath);
                                return { ...s, expandedPaths: next };
                            });
                        }
                        updateInstance(dirPath, s => ({ ...s, renamingPath: result.folderPath! }));
                    }
                } catch (err) {
                    console.error('Failed to create folder:', err);
                }
            };

            const moveItem = async (sourcePath: string, destDirPath: string) => {
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
            };

            const deleteItem = async (itemPath: string) => {
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
            };

            const deleteMultipleItems = async (paths: string[]) => {
                let deletedCount = 0;
                for (const itemPath of paths) {
                    try {
                        const result = await window.electronAPI.deleteItem(itemPath);
                        if (result.success) {
                            deletedCount++;
                            for (const file of openFilesRef.current) {
                                if (file.path && (file.path === itemPath || file.path.startsWith(itemPath + '\\') || file.path.startsWith(itemPath + '/'))) {
                                    dispatch({ type: 'CLOSE_FILE', payload: { id: file.id } });
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Failed to delete item:', err);
                    }
                }
                await refreshTree();
                updateInstance(dirPath, s => ({ ...s, selectedPaths: new Set<string>(), lastSelectedPath: null }));
                // Persist updated open files config after closing tabs
                const openFileRefs = openFilesRef.current
                    .filter(f => f.path !== null && !f.path.endsWith('config.json') && f.viewMode !== 'diff')
                    .map(f => ({ fileName: f.path!, mode: f.viewMode as 'edit' | 'preview' }));
                const nextConfig = { ...configRef.current, openFiles: openFileRefs };
                dispatch({ type: 'SET_CONFIG', payload: nextConfig });
                window.electronAPI.saveConfig(nextConfig).catch(err => {
                    console.error('Failed to persist config after bulk delete:', err);
                });
                if (deletedCount > 0) {
                    dispatch({
                        type: 'SHOW_NOTIFICATION',
                        payload: { message: `${deletedCount} file${deletedCount !== 1 ? 's' : ''} deleted.`, severity: 'success' },
                    });
                }
            };

            const openMultipleFiles = async (paths: string[]) => {
                if (paths.length === 0) return;
                // Open all files, then focus the first one
                for (const filePath of paths) {
                    await openFileInEditor(filePath);
                }
                // Ensure the first file is focused
                const firstFile = openFilesRef.current.find(f => f.path === paths[0]);
                if (firstFile) {
                    dispatch({ type: 'SELECT_TAB', payload: { id: firstFile.id } });
                }
            };

            const renameItem = async (oldPath: string, newName: string) => {
                if (!newName.trim()) {
                    updateInstance(dirPath, s => ({ ...s, renamingPath: null }));
                    return;
                }
                const parentDir = oldPath.substring(0, oldPath.lastIndexOf('\\') === -1
                    ? oldPath.lastIndexOf('/')
                    : oldPath.lastIndexOf('\\'));
                const separator = oldPath.includes('\\') ? '\\' : '/';
                const newPath = parentDir + separator + newName;

                if (oldPath === newPath) {
                    updateInstance(dirPath, s => ({ ...s, renamingPath: null }));
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
                        updateInstance(dirPath, s => {
                            if (!s.expandedPaths.has(oldPath)) return { ...s, renamingPath: null };
                            const next = new Set(s.expandedPaths);
                            next.delete(oldPath);
                            next.add(newPath);
                            return { ...s, expandedPaths: next, renamingPath: null };
                        });
                    }
                } catch (err) {
                    console.error('Failed to rename item:', err);
                } finally {
                    updateInstance(dirPath, s => ({ ...s, renamingPath: null }));
                }
            };

            const startRename = (path: string) => {
                updateInstance(dirPath, s => ({ ...s, renamingPath: path }));
            };

            const cancelRename = () => {
                updateInstance(dirPath, s => ({ ...s, renamingPath: null }));
            };

            return {
                id: dirPath,
                rootPath: dirPath,
                tree,
                isLoading,
                expandedPaths,
                sortOrder,
                isAllExpanded,
                renamingPath,
                selectedPaths,
                showAllFiles,
                refreshTree,
                closeDirectory,
                toggleNode,
                expandAll,
                collapseAll,
                setSortOrder,
                selectFileMulti,
                toggleShowAllFiles,
                createNewFile,
                createNewFolder,
                moveItem,
                deleteItem,
                deleteMultipleItems,
                renameItem,
                startRename,
                cancelRename,
                openFileInEditor,
                openMultipleFiles,
            };
        }).filter((d): d is DirectoryInstance => d !== null);
    }, [orderedPaths, instances, updateInstance, removeDirectory, persistConfig, openFileInEditor, dispatch]);

    // Keep a ref to the latest directories array so useDirectoryWatcher can
    // read current state without re-subscribing the IPC listener on each render.
    const directoriesRef = useRef(directories);
    directoriesRef.current = directories;

    useDirectoryWatcher(directoriesRef);

    return { directories, openFolder, openRecentDirectory };
}
