import React from 'react';
import { Box, Chip, styled } from '@mui/material';

const AttachmentsContainer = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '8px 12px',
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
    maxHeight: 100,
    overflowY: 'auto',
}));

export interface AttachedFile {
    name: string;
    path: string;
    type: string;
    size: number;
}

interface FileAttachmentsListProps {
    files: AttachedFile[];
    onRemove: (filePath: string) => void;
}

export function FileAttachmentsList({
    files,
    onRemove,
}: FileAttachmentsListProps) {
    if (files.length === 0) return null;

    return (
        <AttachmentsContainer>
            {files.map((file) => (
                <Chip
                    key={file.path}
                    label={file.name}
                    size="small"
                    title={file.path}
                    onDelete={() => onRemove(file.path)}
                    sx={{ fontSize: '0.75rem' }}
                />
            ))}
        </AttachmentsContainer>
    );
}
