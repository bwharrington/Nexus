import React, { useCallback } from 'react';
import { Box, Typography, styled, CircularProgress } from '@mui/material';
import { FileDirectoryToolbar } from './FileDirectoryToolbar';
import { FileTreeNode, sortChildren } from './FileTreeNode';
import type { DirectoryInstance } from '../hooks/useFileDirectories';

interface FileDirectoryProps {
    directory: DirectoryInstance;
    attachedFilePaths: Set<string>;
    onToggleNexusAttachment: (filePath: string, fileName: string) => void;
    onAttachFiles: (files: Array<{ path: string; name: string }>) => void;
}

const DirectorySection = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderBottom: `1px solid ${theme.palette.divider}`,
}));

const TreeScrollArea = styled(Box)({
    overflowX: 'hidden',
    padding: '4px 0',
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
    onAttachFiles,
}: FileDirectoryProps) {
    const {
        tree,
        isLoading,
        expandedPaths,
        sortOrder,
        isAllExpanded,
        renamingPath,
        selectedPaths,
        showAllFiles,
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

    const handleOpenAllSelected = useCallback(() => {
        openMultipleFiles(Array.from(selectedPaths));
    }, [openMultipleFiles, selectedPaths]);

    const handleAttachAllSelected = useCallback(() => {
        const files = Array.from(selectedPaths)
            .filter(p => !attachedFilePaths.has(p))
            .map(p => ({ path: p, name: p.split(/[\\/]/).pop() || p }));
        if (files.length > 0) onAttachFiles(files);
    }, [selectedPaths, attachedFilePaths, onAttachFiles]);

    const handleDeleteAllSelected = useCallback(() => {
        const paths = Array.from(selectedPaths);
        if (window.confirm(`Are you sure you want to delete ${paths.length} files? This cannot be undone.`)) {
            deleteMultipleItems(paths);
        }
    }, [selectedPaths, deleteMultipleItems]);

    const folderName = tree?.name ?? directory.rootPath.split(/[\\/]/).pop() ?? directory.rootPath;
    const folderPath = tree?.path ?? directory.rootPath;

    return (
        <DirectorySection>
            <FileDirectoryToolbar
                folderName={folderName}
                folderPath={folderPath}
                sortOrder={sortOrder}
                isAllExpanded={isAllExpanded}
                showAllFiles={showAllFiles}
                onNewFile={handleNewFile}
                onNewFolder={handleNewFolder}
                onToggleSort={handleToggleSort}
                onToggleExpandCollapse={handleToggleExpandCollapse}
                onToggleShowAllFiles={toggleShowAllFiles}
                onCloseFolder={closeDirectory}
            />
            {isLoading ? (
                <LoadingContainer>
                    <CircularProgress size={24} />
                </LoadingContainer>
            ) : tree ? (
                <TreeScrollArea
                    onDrop={handleDropOnRoot}
                    onDragOver={handleDragOverRoot}
                >
                    {tree.children && tree.children.length > 0 ? (
                        sortChildren(tree.children, sortOrder).map(child => (
                            <FileTreeNode
                                key={child.path}
                                node={child}
                                depth={0}
                                isExpanded={expandedPaths.has(child.path)}
                                expandedPaths={expandedPaths}
                                sortOrder={sortOrder}
                                selectedPaths={selectedPaths}
                                isRenaming={renamingPath === child.path}
                                attachedFilePaths={attachedFilePaths}
                                onToggle={toggleNode}
                                onFileClick={openFileInEditor}
                                onFileSelect={selectFileMulti}
                                onNewFile={createNewFile}
                                onNewFolder={createNewFolder}
                                onMoveItem={moveItem}
                                onDeleteItem={deleteItem}
                                onRenameItem={renameItem}
                                onStartRename={startRename}
                                onCancelRename={cancelRename}
                                onToggleNexusAttachment={onToggleNexusAttachment}
                                onOpenAllSelected={handleOpenAllSelected}
                                onAttachAllSelected={handleAttachAllSelected}
                                onDeleteAllSelected={handleDeleteAllSelected}
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
            ) : null}
        </DirectorySection>
    );
});
