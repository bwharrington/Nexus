import React, { useState, useCallback } from 'react';
import { Box, IconButton, Tooltip, Typography, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, styled } from '@mui/material';
import {
    FilePlusIcon,
    FolderPlusIcon,
    ArrowDownAZIcon,
    ArrowUpZAIcon,
    ChevronsDownUpIcon,
    ChevronsUpDownIcon,
    CloseIcon,
} from './AppIcons';
import type { FileDirectorySortOrder } from '../types';

interface FileDirectoryToolbarProps {
    folderName: string;
    folderPath: string;
    sortOrder: FileDirectorySortOrder;
    isAllExpanded: boolean;
    onNewFile: () => void;
    onNewFolder: () => void;
    onToggleSort: () => void;
    onToggleExpandCollapse: () => void;
    onCloseFolder: () => void;
}

const ToolbarContainer = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '2px 4px',
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexShrink: 0,
    gap: 2,
}));

const FolderLabel = styled(Typography)(({ theme }) => ({
    flex: 1,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: theme.palette.text.secondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingLeft: 6,
    minWidth: 0,
}));

const ToolbarButton = styled(IconButton)({
    padding: 4,
});

export const FileDirectoryToolbar = React.memo(function FileDirectoryToolbar({
    folderName,
    folderPath,
    sortOrder,
    isAllExpanded,
    onNewFile,
    onNewFolder,
    onToggleSort,
    onToggleExpandCollapse,
    onCloseFolder,
}: FileDirectoryToolbarProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);

    const handleCloseClick = useCallback(() => {
        setConfirmOpen(true);
    }, []);

    const handleConfirm = useCallback(() => {
        setConfirmOpen(false);
        onCloseFolder();
    }, [onCloseFolder]);

    const handleCancel = useCallback(() => {
        setConfirmOpen(false);
    }, []);

    return (
        <>
            <ToolbarContainer>
                <Tooltip title={folderPath} placement="bottom-start">
                    <FolderLabel>{folderName}</FolderLabel>
                </Tooltip>
                <Tooltip title="New File">
                    <ToolbarButton onClick={onNewFile} size="small">
                        <FilePlusIcon fontSize="small" />
                    </ToolbarButton>
                </Tooltip>
                <Tooltip title="New Folder">
                    <ToolbarButton onClick={onNewFolder} size="small">
                        <FolderPlusIcon fontSize="small" />
                    </ToolbarButton>
                </Tooltip>
                <Tooltip title={sortOrder === 'asc' ? 'Sort Z to A' : 'Sort A to Z'}>
                    <ToolbarButton onClick={onToggleSort} size="small">
                        {sortOrder === 'asc'
                            ? <ArrowDownAZIcon fontSize="small" />
                            : <ArrowUpZAIcon fontSize="small" />}
                    </ToolbarButton>
                </Tooltip>
                <Tooltip title={isAllExpanded ? 'Collapse All' : 'Expand All'}>
                    <ToolbarButton onClick={onToggleExpandCollapse} size="small">
                        {isAllExpanded
                            ? <ChevronsDownUpIcon fontSize="small" />
                            : <ChevronsUpDownIcon fontSize="small" />}
                    </ToolbarButton>
                </Tooltip>
                <Tooltip title="Close Folder">
                    <ToolbarButton onClick={handleCloseClick} size="small">
                        <CloseIcon fontSize="small" />
                    </ToolbarButton>
                </Tooltip>
            </ToolbarContainer>

            <Dialog open={confirmOpen} onClose={handleCancel} maxWidth="xs" fullWidth>
                <DialogTitle>Close Folder</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Close <strong>{folderName}</strong>? The folder will no longer appear in the directory panel.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancel}>Cancel</Button>
                    <Button onClick={handleConfirm} color="error" variant="contained">
                        Close Folder
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
});
