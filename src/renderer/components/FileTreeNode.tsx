import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Typography, styled, InputBase } from '@mui/material';
import { ChevronRightIcon, FolderClosedIcon, FolderOpenIcon, DescriptionIcon } from './AppIcons';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { MultiSelectContextMenu } from './MultiSelectContextMenu';
import type { DirectoryNode, FileDirectorySortOrder } from '../types';

interface FileTreeNodeProps {
    node: DirectoryNode;
    depth: number;
    isExpanded: boolean;
    expandedPaths: Set<string>;
    sortOrder: FileDirectorySortOrder;
    selectedPaths: Set<string>;
    isRenaming: boolean;
    attachedFilePaths: Set<string>;
    onToggle: (path: string) => void;
    onFileClick: (filePath: string) => void;
    onFileSelect: (filePath: string, ctrlKey: boolean, shiftKey: boolean) => void;
    onNewFile: (parentPath: string) => void;
    onNewFolder: (parentPath: string) => void;
    onMoveItem: (sourcePath: string, destDirPath: string) => void;
    onDeleteItem: (path: string) => void;
    onRenameItem: (oldPath: string, newName: string) => void;
    onStartRename: (path: string) => void;
    onCancelRename: () => void;
    onToggleNexusAttachment: (filePath: string, fileName: string) => void;
    onOpenAllSelected: () => void;
    onAttachAllSelected: () => void;
    onDeleteAllSelected: () => void;
    renamingPath: string | null;
}

interface ContextMenuPosition {
    mouseX: number;
    mouseY: number;
}

const NodeRow = styled(Box, {
    shouldForwardProp: (prop) => prop !== 'isActive' && prop !== 'isDragOver',
})<{ isActive?: boolean; isDragOver?: boolean }>(({ theme, isActive, isDragOver }) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '2px 8px 2px 0',
    cursor: 'pointer',
    userSelect: 'none',
    borderRadius: 4,
    backgroundColor: isDragOver
        ? theme.palette.action.hover
        : isActive
            ? theme.palette.action.selected
            : 'transparent',
    '&:hover': {
        backgroundColor: isDragOver
            ? theme.palette.action.focus
            : isActive
                ? theme.palette.action.selected
                : theme.palette.action.hover,
    },
}));

const ChevronContainer = styled(Box, {
    shouldForwardProp: (prop) => prop !== 'isExpanded',
})<{ isExpanded?: boolean }>(({ isExpanded }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    flexShrink: 0,
    transition: 'transform 0.15s ease',
    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
}));

const IconContainer = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    flexShrink: 0,
    marginRight: 4,
});

const RenameInput = styled(InputBase)(({ theme }) => ({
    flex: 1,
    fontSize: '0.8125rem',
    padding: '0 4px',
    '& input': {
        padding: 0,
        height: '1.4em',
    },
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.primary.main}`,
    borderRadius: 2,
}));

export function sortChildren(children: DirectoryNode[], sortOrder: FileDirectorySortOrder): DirectoryNode[] {
    const folders = children.filter(c => c.isDirectory);
    const files = children.filter(c => !c.isDirectory);

    const sortedFolders = [...folders].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    const sortedFiles = [...files].sort((a, b) => {
        const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return sortOrder === 'asc' ? cmp : -cmp;
    });

    return [...sortedFolders, ...sortedFiles];
}

export const FileTreeNode = React.memo(function FileTreeNode({
    node,
    depth,
    isExpanded,
    expandedPaths,
    sortOrder,
    selectedPaths,
    isRenaming,
    attachedFilePaths,
    onToggle,
    onFileClick,
    onFileSelect,
    onNewFile,
    onNewFolder,
    onMoveItem,
    onDeleteItem,
    onRenameItem,
    onStartRename,
    onCancelRename,
    onToggleNexusAttachment,
    onOpenAllSelected,
    onAttachAllSelected,
    onDeleteAllSelected,
    renamingPath,
}: FileTreeNodeProps) {
    const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [renameValue, setRenameValue] = useState(node.name);
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            setRenameValue(node.name);
            setTimeout(() => {
                const input = renameInputRef.current;
                if (input) {
                    input.focus();
                    const dotIndex = node.name.lastIndexOf('.');
                    if (dotIndex > 0 && !node.isDirectory) {
                        input.setSelectionRange(0, dotIndex);
                    } else {
                        input.select();
                    }
                }
            }, 0);
        }
    }, [isRenaming, node.name, node.isDirectory]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (node.isDirectory) {
            onToggle(node.path);
        } else {
            onFileSelect(node.path, e.ctrlKey || e.metaKey, e.shiftKey);
        }
    }, [node.isDirectory, node.path, onToggle, onFileSelect]);

    const handleDoubleClick = useCallback(() => {
        if (!node.isDirectory) {
            onFileClick(node.path);
        }
    }, [node.isDirectory, node.path, onFileClick]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // If right-clicking a file not in the current selection, select only it
        if (!node.isDirectory && !selectedPaths.has(node.path)) {
            onFileSelect(node.path, false, false);
        }
        setContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
    }, [node.isDirectory, node.path, selectedPaths, onFileSelect]);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', node.path);
        e.dataTransfer.effectAllowed = 'move';
    }, [node.path]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!node.isDirectory) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
    }, [node.isDirectory]);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!node.isDirectory) return;
        const sourcePath = e.dataTransfer.getData('text/plain');
        if (!sourcePath || sourcePath === node.path) return;
        // Don't drop into itself or a child of itself
        if (node.path.startsWith(sourcePath + '\\') || node.path.startsWith(sourcePath + '/')) return;
        onMoveItem(sourcePath, node.path);
    }, [node.isDirectory, node.path, onMoveItem]);

    const handleRenameSubmit = useCallback(() => {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== node.name) {
            onRenameItem(node.path, trimmed);
        } else {
            onCancelRename();
        }
    }, [renameValue, node.name, node.path, onRenameItem, onCancelRename]);

    const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRenameSubmit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancelRename();
        }
    }, [handleRenameSubmit, onCancelRename]);

    const handleCopyPath = useCallback(() => {
        navigator.clipboard.writeText(node.path);
    }, [node.path]);

    const handleCopyName = useCallback(() => {
        navigator.clipboard.writeText(node.name);
    }, [node.name]);

    const handleRevealInExplorer = useCallback(() => {
        window.electronAPI.showInFolder(node.path);
    }, [node.path]);

    const handleDelete = useCallback(() => {
        if (window.confirm(`Are you sure you want to delete "${node.name}"?${node.isDirectory ? ' This will delete all contents.' : ''}`)) {
            onDeleteItem(node.path);
        }
    }, [node.name, node.isDirectory, node.path, onDeleteItem]);

    const handleToggleNexusAttachment = useCallback(() => {
        onToggleNexusAttachment(node.path, node.name);
    }, [node.path, node.name, onToggleNexusAttachment]);

    const isActive = !node.isDirectory && selectedPaths.has(node.path);
    const isMultiSelected = selectedPaths.size > 1 && selectedPaths.has(node.path);
    const isAttachedToNexus = !node.isDirectory && attachedFilePaths.has(node.path);
    const paddingLeft = 8 + depth * 16;
    const sortedChildren = node.isDirectory && node.children
        ? sortChildren(node.children, sortOrder)
        : [];

    return (
        <>
            <NodeRow
                isActive={isActive}
                isDragOver={isDragOver}
                sx={{ paddingLeft: `${paddingLeft}px` }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
                draggable={!node.isDirectory && !isRenaming}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {node.isDirectory ? (
                    <ChevronContainer isExpanded={isExpanded}>
                        <ChevronRightIcon fontSize="small" size={14} />
                    </ChevronContainer>
                ) : (
                    <Box sx={{ width: 18, flexShrink: 0 }} />
                )}

                <IconContainer>
                    {node.isDirectory
                        ? (isExpanded
                            ? <FolderOpenIcon fontSize="small" size={16} sx={{ color: 'action.active' }} />
                            : <FolderClosedIcon fontSize="small" size={16} sx={{ color: 'action.active' }} />)
                        : <DescriptionIcon fontSize="small" size={16} sx={{ color: 'text.secondary' }} />}
                </IconContainer>

                {isRenaming ? (
                    <RenameInput
                        inputRef={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={handleRenameKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        fullWidth
                    />
                ) : (
                    <Typography
                        variant="body2"
                        noWrap
                        sx={{
                            flex: 1,
                            fontSize: '0.8125rem',
                            lineHeight: 1.5,
                        }}
                    >
                        {node.name}
                    </Typography>
                )}
            </NodeRow>

            {node.isDirectory && isExpanded && sortedChildren.map(child => (
                <FileTreeNode
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    isExpanded={expandedPaths.has(child.path)}
                    expandedPaths={expandedPaths}
                    sortOrder={sortOrder}
                    selectedPaths={selectedPaths}
                    isRenaming={renamingPath === child.path}
                    attachedFilePaths={attachedFilePaths}
                    onToggle={onToggle}
                    onFileClick={onFileClick}
                    onFileSelect={onFileSelect}
                    onNewFile={onNewFile}
                    onNewFolder={onNewFolder}
                    onMoveItem={onMoveItem}
                    onDeleteItem={onDeleteItem}
                    onRenameItem={onRenameItem}
                    onStartRename={onStartRename}
                    onCancelRename={onCancelRename}
                    onToggleNexusAttachment={onToggleNexusAttachment}
                    onOpenAllSelected={onOpenAllSelected}
                    onAttachAllSelected={onAttachAllSelected}
                    onDeleteAllSelected={onDeleteAllSelected}
                    renamingPath={renamingPath}
                />
            ))}

            {isMultiSelected ? (
                <MultiSelectContextMenu
                    position={contextMenu}
                    selectedCount={selectedPaths.size}
                    onClose={handleCloseContextMenu}
                    onOpenAll={onOpenAllSelected}
                    onAttachAll={onAttachAllSelected}
                    onDeleteAll={onDeleteAllSelected}
                />
            ) : (
                <FileTreeContextMenu
                    position={contextMenu}
                    isDirectory={node.isDirectory}
                    itemPath={node.path}
                    itemName={node.name}
                    isAttachedToNexus={isAttachedToNexus}
                    onClose={handleCloseContextMenu}
                    onNewFile={() => onNewFile(node.path)}
                    onNewFolder={() => onNewFolder(node.path)}
                    onRename={() => onStartRename(node.path)}
                    onDelete={handleDelete}
                    onRevealInExplorer={handleRevealInExplorer}
                    onCopyPath={handleCopyPath}
                    onCopyName={handleCopyName}
                    onToggleNexusAttachment={handleToggleNexusAttachment}
                />
            )}
        </>
    );
});
