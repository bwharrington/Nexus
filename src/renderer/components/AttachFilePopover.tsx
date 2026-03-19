import React, { useMemo, useCallback } from 'react';
import { Popover, Box, Typography, IconButton, Divider, styled } from '@mui/material';
import { CloseIcon, FolderOpenIcon, DescriptionIcon, PlusIcon, MinusIcon } from './AppIcons';
import type { AttachedFile } from './FileAttachmentsList';
import type { IFile } from '../types';

const PopoverHeader = styled(Box)({
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '2px 4px 0 4px',
});

const FileListContainer = styled(Box)({
    maxHeight: 240,
    overflowY: 'auto',
});

const FileRow = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    cursor: 'pointer',
    '&:hover': {
        backgroundColor: theme.palette.action.hover,
    },
}));

const DisabledFileRow = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    opacity: 0.4,
    cursor: 'default',
    color: theme.palette.text.disabled,
}));

interface AttachFilePopoverProps {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    openFiles: IFile[];
    attachedFiles: AttachedFile[];
    onAttachFromDisk: () => void;
    onToggleFileAttachment: (file: IFile) => void;
}

export function AttachFilePopover({
    anchorEl,
    onClose,
    openFiles,
    attachedFiles,
    onAttachFromDisk,
    onToggleFileAttachment,
}: AttachFilePopoverProps) {
    const isOpen = Boolean(anchorEl);

    // Set of attached file paths
    const attachedPaths = useMemo(
        () => new Set(attachedFiles.map(f => f.path)),
        [attachedFiles],
    );

    // Filter out diff tabs; keep all non-diff open files
    const eligibleFiles = useMemo(
        () => openFiles.filter(f => f.viewMode !== 'diff'),
        [openFiles],
    );

    const handleFilesAndFolders = useCallback(() => {
        onAttachFromDisk();
        onClose();
    }, [onAttachFromDisk, onClose]);

    const handleToggle = useCallback((file: IFile) => {
        onToggleFileAttachment(file);
    }, [onToggleFileAttachment]);

    return (
        <Popover
            open={isOpen}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            slotProps={{
                paper: { sx: { width: 280, maxHeight: 360 } },
            }}
        >
            <PopoverHeader>
                <IconButton size="small" onClick={onClose} title="Close">
                    <CloseIcon size={14} />
                </IconButton>
            </PopoverHeader>

            <FileRow onClick={handleFilesAndFolders}>
                <FolderOpenIcon size={18} sx={{ color: 'text.secondary' }} />
                <Typography variant="body2" sx={{ flex: 1 }}>
                    Files and Folders
                </Typography>
            </FileRow>

            {eligibleFiles.length > 0 && (
                <>
                    <Divider />
                    <FileListContainer>
                        {eligibleFiles.map(file => {
                            if (!file.path) {
                                return (
                                    <DisabledFileRow key={file.id}>
                                        <DescriptionIcon size={16} sx={{ color: 'text.disabled' }} />
                                        <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {file.name}
                                        </Typography>
                                    </DisabledFileRow>
                                );
                            }

                            const isAttached = attachedPaths.has(file.path);

                            return (
                                <FileRow key={file.id} onClick={() => handleToggle(file)}>
                                    <DescriptionIcon size={16} sx={{ color: 'text.secondary' }} />
                                    <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {file.name}
                                    </Typography>
                                    {isAttached
                                        ? <MinusIcon size={16} sx={{ color: 'error.main', flexShrink: 0 }} />
                                        : <PlusIcon size={16} sx={{ color: 'success.main', flexShrink: 0 }} />
                                    }
                                </FileRow>
                            );
                        })}
                    </FileListContainer>
                </>
            )}
        </Popover>
    );
}
