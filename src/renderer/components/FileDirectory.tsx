import React, { useCallback } from 'react';
import { Box, Button, Typography, styled, CircularProgress } from '@mui/material';
import { FolderOpenIcon } from './AppIcons';
import { FileDirectoryToolbar } from './FileDirectoryToolbar';
import { FileTreeNode } from './FileTreeNode';
import { useEditorState } from '../contexts';
import type { useFileDirectory } from '../hooks/useFileDirectory';

type FileDirectoryHook = ReturnType<typeof useFileDirectory>;

interface FileDirectoryProps {
    directory: FileDirectoryHook;
    attachedFilePaths: Set<string>;
    onToggleNexusAttachment: (filePath: string, fileName: string) => void;
}

const PanelContainer = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: theme.palette.background.default,
    borderRight: `1px solid ${theme.palette.divider}`,
}));

const TreeScrollArea = styled(Box)({
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '4px 0',
});

const EmptyStateContainer = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    padding: 24,
});

const LoadingContainer = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
});

export const FileDirectory = React.memo(function FileDirectory({
    directory,
    attachedFilePaths,
    onToggleNexusAttachment,
}: FileDirectoryProps) {
    const state = useEditorState();
    const activeFile = state.activeFileId
        ? state.openFiles.find(f => f.id === state.activeFileId)
        : null;
    const activeFilePath = activeFile?.path ?? null;

    const {
        tree,
        isLoading,
        expandedPaths,
        sortOrder,
        isAllExpanded,
        renamingPath,
        openFolder,
        closeFolder,
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
    } = directory;

    const handleToggleSort = useCallback(() => {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    }, [sortOrder, setSortOrder]);

    const handleToggleExpandCollapse = useCallback(() => {
        if (isAllExpanded) {
            collapseAll();
        } else {
            expandAll();
        }
    }, [isAllExpanded, expandAll, collapseAll]);

    const handleNewFile = useCallback(() => {
        createNewFile();
    }, [createNewFile]);

    const handleNewFolder = useCallback(() => {
        createNewFolder();
    }, [createNewFolder]);

    const handleDropOnRoot = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!tree) return;
        const sourcePath = e.dataTransfer.getData('text/plain');
        if (!sourcePath) return;
        moveItem(sourcePath, tree.path);
    }, [tree, moveItem]);

    const handleDragOverRoot = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    if (!tree) {
        return (
            <PanelContainer>
                <EmptyStateContainer>
                    <FolderOpenIcon fontSize="large" sx={{ color: 'text.secondary', opacity: 0.5 }} />
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                        No folder opened
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FolderOpenIcon fontSize="small" />}
                        onClick={openFolder}
                    >
                        Open Folder
                    </Button>
                </EmptyStateContainer>
            </PanelContainer>
        );
    }

    return (
        <PanelContainer>
            <FileDirectoryToolbar
                folderName={tree.name}
                folderPath={tree.path}
                sortOrder={sortOrder}
                isAllExpanded={isAllExpanded}
                onNewFile={handleNewFile}
                onNewFolder={handleNewFolder}
                onToggleSort={handleToggleSort}
                onToggleExpandCollapse={handleToggleExpandCollapse}
                onCloseFolder={closeFolder}
            />
            {isLoading ? (
                <LoadingContainer>
                    <CircularProgress size={24} />
                </LoadingContainer>
            ) : (
                <TreeScrollArea
                    onDrop={handleDropOnRoot}
                    onDragOver={handleDragOverRoot}
                >
                    {tree.children && tree.children.length > 0 ? (
                        tree.children.map(child => (
                            <FileTreeNode
                                key={child.path}
                                node={child}
                                depth={0}
                                isExpanded={expandedPaths.has(child.path)}
                                expandedPaths={expandedPaths}
                                sortOrder={sortOrder}
                                activeFilePath={activeFilePath}
                                isRenaming={renamingPath === child.path}
                                attachedFilePaths={attachedFilePaths}
                                onToggle={toggleNode}
                                onFileClick={openFileInEditor}
                                onNewFile={createNewFile}
                                onNewFolder={createNewFolder}
                                onMoveItem={moveItem}
                                onDeleteItem={deleteItem}
                                onRenameItem={renameItem}
                                onStartRename={startRename}
                                onCancelRename={cancelRename}
                                onToggleNexusAttachment={onToggleNexusAttachment}
                                renamingPath={renamingPath}
                            />
                        ))
                    ) : (
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ padding: '16px', textAlign: 'center' }}
                        >
                            No supported files found
                        </Typography>
                    )}
                </TreeScrollArea>
            )}
        </PanelContainer>
    );
});
