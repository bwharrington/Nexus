import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, Tab, Box, IconButton, Tooltip, styled, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
import {
    CloseIcon,
    SaveIcon,
    CodeIcon,
    DescriptionIcon,
    EditIcon,
    FolderOpenIcon,
    FileDiffIcon,
    PlusIcon,
    MinusIcon,
    VisibilityIcon,
    VisibilityOffIcon,
    CopyIcon,
    ClipboardCopyIcon,
    SaveAsIcon,
} from './AppIcons';
import { useEditorState, useEditorDispatch } from '../contexts';
import { useFileOperations } from '../hooks';
import type { IFile } from '../types';
import type { AttachedFile } from './FileAttachmentsList';

const TabContainer = styled(Box)(({ theme }) => ({
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
}));

const StyledTab = styled(Tab)(({ theme }) => ({
    textTransform: 'none',
    minHeight: 40,
    padding: '6px 12px',
    '&.Mui-selected': {
        backgroundColor: theme.palette.action.selected,
    },
}));

const TabContent = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
});

const FileName = styled('span')({
    whiteSpace: 'nowrap',
});

const MeasureContainer = styled(Box)({
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    display: 'flex',
    top: 0,
    left: 0,
});

interface FileTabProps {
    file: IFile;
    isActive: boolean;
}

const FileTab = React.memo(function FileTab({ file, isActive }: FileTabProps) {
    const dispatch = useEditorDispatch();
    const { closeFile } = useFileOperations();
    const isDiffTab = file.viewMode === 'diff';

    const handleToggleViewMode = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_VIEW_MODE', payload: { id: file.id } });
    }, [file.id, dispatch]);

    const handleClose = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDiffTab) {
            dispatch({ type: 'CLOSE_DIFF_TAB', payload: { diffTabId: file.id } });
        } else {
            closeFile(file.id);
        }
    }, [file.id, isDiffTab, dispatch, closeFile]);

    const tooltipTitle = isDiffTab ? 'AI Changes' : (file.path || 'Unsaved file');

    return (
        <Tooltip title={tooltipTitle} enterDelay={600} placement="bottom">
        <TabContent>
            {isDiffTab ? (
                <Tooltip title="AI Diff">
                    <FileDiffIcon
                        size={16}
                        sx={{
                            opacity: 0.7,
                            color: 'info.main',
                        }}
                    />
                </Tooltip>
            ) : file.isDirty ? (
                <Tooltip title="Unsaved changes">
                    <SaveIcon
                        size={16}
                        sx={{
                            opacity: 0.7,
                            color: 'warning.main',
                        }}
                    />
                </Tooltip>
            ) : null}
            <FileName>{file.name}</FileName>
            {!isDiffTab && (
                <Tooltip title={file.viewMode === 'edit' ? 'Switch to preview (Ctrl+E)' : 'Switch to edit (Ctrl+E)'}>
                    <IconButton
                        component="span"
                        size="small"
                        onClick={handleToggleViewMode}
                        sx={{ padding: 0.5 }}
                    >
                        {file.viewMode === 'edit' ? (
                            <CodeIcon size={16} />
                        ) : (
                            <DescriptionIcon size={16} />
                        )}
                    </IconButton>
                </Tooltip>
            )}
            <Tooltip title="Close">
                <IconButton
                    component="span"
                    size="small"
                    onClick={handleClose}
                    sx={{ padding: 0.5 }}
                >
                    <CloseIcon size={16} />
                </IconButton>
            </Tooltip>
        </TabContent>
        </Tooltip>
    );
});

interface TabBarProps {
    attachedFiles: AttachedFile[];
    onToggleFileAttachment: (file: IFile) => void;
    onToggleContextDoc: (filePath: string) => void;
}

export function TabBar({ attachedFiles, onToggleFileAttachment, onToggleContextDoc }: TabBarProps) {
    const state = useEditorState();
    const dispatch = useEditorDispatch();
    const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
    const [contextMenu, setContextMenu] = React.useState<{ mouseX: number; mouseY: number; fileId: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [splitIndex, setSplitIndex] = useState<number>(Infinity);
    const [renameDialog, setRenameDialog] = React.useState<{ open: boolean; fileId: string; currentName: string }>({ open: false, fileId: '', currentName: '' });
    const [newFileName, setNewFileName] = React.useState('');
    const { renameFile, showInFolder, saveFileAs } = useFileOperations();

    const handleTabChange = useCallback((_event: React.SyntheticEvent, newValue: string) => {
        dispatch({ type: 'SELECT_TAB', payload: { id: newValue } });
    }, [dispatch]);

    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (draggedIndex !== null && draggedIndex !== index) {
            dispatch({
                type: 'REORDER_TABS',
                payload: { fromIndex: draggedIndex, toIndex: index },
            });
            setDraggedIndex(index);
        }
    }, [draggedIndex, dispatch]);

    const handleDragEnd = useCallback(() => {
        setDraggedIndex(null);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent, fileId: string) => {
        e.preventDefault();
        setContextMenu(prev => prev === null ? { mouseX: e.clientX - 2, mouseY: e.clientY - 4, fileId } : null);
    }, []);

    const handleContextMenuClose = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleRenameClick = useCallback(() => {
        setContextMenu(prev => {
            if (prev) {
                const file = state.openFiles.find(f => f.id === prev.fileId);
                if (file) {
                    setNewFileName(file.name);
                    setRenameDialog({ open: true, fileId: file.id, currentName: file.name });
                }
            }
            return null;
        });
    }, [state.openFiles]);

    const handleOpenLocationClick = useCallback(async () => {
        if (contextMenu) {
            const file = state.openFiles.find(f => f.id === contextMenu.fileId);
            if (file && file.path) {
                await window.electronAPI.showInFolder(file.path);
            }
        }
        setContextMenu(null);
    }, [contextMenu, state.openFiles]);

    const handleCopyFileContent = useCallback(async () => {
        if (contextMenu) {
            const file = state.openFiles.find(f => f.id === contextMenu.fileId);
            if (file) {
                await navigator.clipboard.writeText(file.content);
            }
        }
        setContextMenu(null);
    }, [contextMenu, state.openFiles]);

    const handleCopyFilePath = useCallback(async () => {
        if (contextMenu) {
            const file = state.openFiles.find(f => f.id === contextMenu.fileId);
            if (file?.path) {
                await navigator.clipboard.writeText(file.path);
            }
        }
        setContextMenu(null);
    }, [contextMenu, state.openFiles]);

    const handleCopyFileName = useCallback(async () => {
        if (contextMenu) {
            const file = state.openFiles.find(f => f.id === contextMenu.fileId);
            if (file) {
                await navigator.clipboard.writeText(file.name);
            }
        }
        setContextMenu(null);
    }, [contextMenu, state.openFiles]);

    const handleSaveAsClick = useCallback(async () => {
        if (contextMenu) {
            await saveFileAs(contextMenu.fileId);
        }
        setContextMenu(null);
    }, [contextMenu, saveFileAs]);

    const handleAttachToggleClick = useCallback(() => {
        if (contextMenu) {
            const file = state.openFiles.find(f => f.id === contextMenu.fileId);
            if (file) {
                onToggleFileAttachment(file);
            }
        }
        setContextMenu(null);
    }, [contextMenu, state.openFiles, onToggleFileAttachment]);

    const handleContextDocToggleClick = useCallback(() => {
        if (contextMenu) {
            const file = state.openFiles.find(f => f.id === contextMenu.fileId);
            if (file?.path) {
                onToggleContextDoc(file.path);
            }
        }
        setContextMenu(null);
    }, [contextMenu, state.openFiles, onToggleContextDoc]);

    const handleRenameDialogClose = useCallback(() => {
        setRenameDialog({ open: false, fileId: '', currentName: '' });
        setNewFileName('');
    }, []);

    const handleRenameConfirm = useCallback(async () => {
        if (renameDialog.fileId && newFileName && newFileName !== renameDialog.currentName) {
            await renameFile(renameDialog.fileId, newFileName);
        }
        setRenameDialog({ open: false, fileId: '', currentName: '' });
        setNewFileName('');
    }, [renameDialog.fileId, renameDialog.currentName, newFileName, renameFile]);

    // Recalculate which files go on row 1 vs row 2.
    // Each measured span gives the text width; we add TAB_OVERHEAD px for
    // padding (12px * 2), icons (~16px each), gaps, and the MUI indicator.
    const TAB_OVERHEAD = 80;

    const recalcSplit = useCallback(() => {
        if (!containerRef.current || !measureRef.current) return;
        const containerWidth = containerRef.current.offsetWidth;
        const spans = measureRef.current.querySelectorAll('span');
        let accumulated = 0;
        let split = Infinity;
        for (let i = 0; i < spans.length; i++) {
            accumulated += spans[i].offsetWidth + TAB_OVERHEAD;
            if (accumulated > containerWidth) {
                split = i;
                break;
            }
        }
        setSplitIndex(split);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => recalcSplit());
        observer.observe(containerRef.current);
        recalcSplit();
        return () => observer.disconnect();
    }, [state.openFiles, recalcSplit]);

    if (state.openFiles.length === 0) {
        return null;
    }

    const row1Files = state.openFiles.slice(0, splitIndex);
    const row2Files = state.openFiles.slice(splitIndex);

    const renderTab = (file: IFile, globalIndex: number) => (
        <StyledTab
            key={file.id}
            value={file.id}
            label={<FileTab file={file} isActive={file.id === state.activeFileId} />}
            draggable
            onDragStart={(e) => handleDragStart(e, globalIndex)}
            onDragOver={(e) => handleDragOver(e, globalIndex)}
            onDragEnd={handleDragEnd}
            onContextMenu={(e) => handleContextMenu(e, file.id)}
            sx={{
                cursor: 'grab',
                '&:active': { cursor: 'grabbing' },
                opacity: draggedIndex === globalIndex ? 0.5 : 1,
            }}
        />
    );

    return (
        <TabContainer ref={containerRef} sx={{ position: 'relative' }}>
            {/* Hidden measurement layer — one span per tab to read natural text widths */}
            <MeasureContainer ref={measureRef} aria-hidden="true">
                {state.openFiles.map(f => <span key={f.id}>{f.name}</span>)}
            </MeasureContainer>

            {/* Row 1 — fills available width, no scroll */}
            <Tabs
                value={state.openFiles.find(f => f.id === state.activeFileId) && row1Files.some(f => f.id === state.activeFileId) ? state.activeFileId : false}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 40 }}
            >
                {row1Files.map((file, i) => renderTab(file, i))}
            </Tabs>

            {/* Row 2 — only shown when there are overflow tabs; scrollable as fallback */}
            {row2Files.length > 0 && (
                <Tabs
                    value={row2Files.some(f => f.id === state.activeFileId) ? state.activeFileId : false}
                    onChange={handleTabChange}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ minHeight: 40, borderTop: 1, borderColor: 'divider' }}
                >
                    {row2Files.map((file, i) => renderTab(file, splitIndex + i))}
                </Tabs>
            )}
            <Menu
                open={contextMenu !== null}
                onClose={handleContextMenuClose}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
            >
                <MenuItem onClick={handleRenameClick}>
                    <EditIcon size={18} sx={{ mr: 1 }} />
                    Rename
                </MenuItem>
                <MenuItem
                    onClick={handleOpenLocationClick}
                    disabled={!state.openFiles.find(f => f.id === contextMenu?.fileId)?.path}
                >
                    <FolderOpenIcon size={18} sx={{ mr: 1 }} />
                    Open File Location
                </MenuItem>
                <MenuItem
                    onClick={handleCopyFileContent}
                    disabled={state.openFiles.find(f => f.id === contextMenu?.fileId)?.viewMode === 'diff'}
                >
                    <CopyIcon size={18} sx={{ mr: 1 }} />
                    Copy File Contents
                </MenuItem>
                <MenuItem
                    onClick={handleCopyFilePath}
                    disabled={!state.openFiles.find(f => f.id === contextMenu?.fileId)?.path}
                >
                    <ClipboardCopyIcon size={18} sx={{ mr: 1 }} />
                    Copy File Path
                </MenuItem>
                <MenuItem onClick={handleCopyFileName}>
                    <CopyIcon size={18} sx={{ mr: 1 }} />
                    Copy File Name
                </MenuItem>
                <MenuItem onClick={handleSaveAsClick}>
                    <SaveAsIcon size={18} sx={{ mr: 1 }} />
                    Save As
                </MenuItem>
                {(() => {
                    const contextFile = contextMenu
                        ? state.openFiles.find(f => f.id === contextMenu.fileId)
                        : null;
                    const attachedEntry = contextFile?.path
                        ? attachedFiles.find(af => af.path === contextFile.path)
                        : undefined;
                    const isContextDoc = attachedEntry?.isContextDoc === true;
                    const isContextDocEnabled = attachedEntry?.enabled !== false;
                    const isManuallyAttached = attachedEntry !== undefined && !isContextDoc;

                    if (isContextDoc) {
                        return (
                            <MenuItem
                                onClick={handleContextDocToggleClick}
                                disabled={!contextFile?.path || contextFile?.viewMode === 'diff'}
                            >
                                {isContextDocEnabled ? (
                                    <VisibilityIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
                                ) : (
                                    <VisibilityOffIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} />
                                )}
                                {isContextDocEnabled ? `Hide "${contextFile?.name}" from AI` : `Show "${contextFile?.name}" to AI`}
                            </MenuItem>
                        );
                    }

                    return (
                        <MenuItem
                            onClick={handleAttachToggleClick}
                            disabled={!contextFile?.path || contextFile?.viewMode === 'diff'}
                        >
                            {isManuallyAttached ? (
                                <MinusIcon size={18} sx={{ mr: 1, color: 'error.main' }} />
                            ) : (
                                <PlusIcon size={18} sx={{ mr: 1, color: 'success.main' }} />
                            )}
                            {isManuallyAttached ? `Remove '${contextFile?.name}' from Nexus` : `Attach '${contextFile?.name}' to Nexus`}
                        </MenuItem>
                    );
                })()}
            </Menu>
            <Dialog open={renameDialog.open} onClose={handleRenameDialogClose}>
                <DialogTitle>Rename File</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="File Name"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleRenameConfirm();
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleRenameDialogClose}>Cancel</Button>
                    <Button onClick={handleRenameConfirm} variant="contained" disabled={!newFileName || newFileName === renameDialog.currentName}>
                        Rename
                    </Button>
                </DialogActions>
            </Dialog>
        </TabContainer>
    );
}
