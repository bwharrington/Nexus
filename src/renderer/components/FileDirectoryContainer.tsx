import React from 'react';
import { Box, Button, Typography, styled } from '@mui/material';
import { FolderOpenIcon } from './AppIcons';
import { FileDirectory } from './FileDirectory';
import type { DirectoryInstance } from '../hooks/useFileDirectories';

interface FileDirectoryContainerProps {
    directories: DirectoryInstance[];
    attachedFilePaths: Set<string>;
    onToggleNexusAttachment: (filePath: string, fileName: string) => void;
    onAttachFiles: (files: Array<{ path: string; name: string }>) => void;
    onOpenFolder: () => void;
}

const ScrollablePanel = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    backgroundColor: theme.palette.background.default,
    borderRight: `1px solid ${theme.palette.divider}`,
}));

const EmptyStateContainer = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    padding: 24,
});

export const FileDirectoryContainer = React.memo(function FileDirectoryContainer({
    directories,
    attachedFilePaths,
    onToggleNexusAttachment,
    onAttachFiles,
    onOpenFolder,
}: FileDirectoryContainerProps) {
    if (directories.length === 0) {
        return (
            <ScrollablePanel>
                <EmptyStateContainer>
                    <FolderOpenIcon fontSize="large" sx={{ color: 'text.secondary', opacity: 0.5 }} />
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                        No folders opened
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FolderOpenIcon fontSize="small" />}
                        onClick={onOpenFolder}
                    >
                        Open Folder
                    </Button>
                </EmptyStateContainer>
            </ScrollablePanel>
        );
    }

    return (
        <ScrollablePanel>
            {directories.map(dir => (
                <FileDirectory
                    key={dir.id}
                    directory={dir}
                    attachedFilePaths={attachedFilePaths}
                    onToggleNexusAttachment={onToggleNexusAttachment}
                    onAttachFiles={onAttachFiles}
                />
            ))}
        </ScrollablePanel>
    );
});
