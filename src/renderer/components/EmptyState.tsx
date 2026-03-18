import React from 'react';
import { Box, Typography, Button, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, styled } from '@mui/material';
import { NoteAddIcon, FolderOpenIcon, HistoryIcon, FolderClosedIcon } from './AppIcons';
import { useFileOperations } from '../hooks';
import { useEditorState } from '../contexts';

interface EmptyStateProps {
    onOpenRecentDirectory?: (dirPath: string) => Promise<void>;
}

const Container = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: theme.spacing(4),
    backgroundColor: theme.palette.background.default,
}));

const WelcomeCard = styled(Box)(({ theme }) => ({
    textAlign: 'center',
    maxWidth: 500,
    padding: theme.spacing(4),
    backgroundColor: theme.palette.background.paper,
    borderRadius: 16,
    boxShadow: theme.shadows[2],
}));

const ButtonGroup = styled(Box)(({ theme }) => ({
    display: 'flex',
    gap: theme.spacing(2),
    justifyContent: 'center',
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(3),
}));

const RecentSection = styled(Box)(({ theme }) => ({
    marginTop: theme.spacing(3),
    width: '100%',
    textAlign: 'left',
}));

export function EmptyState({ onOpenRecentDirectory }: EmptyStateProps) {
    const state = useEditorState();
    const { createNewFile, openFile, openRecentFile, openAllRecentFiles } = useFileOperations();

    const recentFiles = state.config.recentFiles.slice(0, 5);
    const openDirs = (state.config.openDirectories ?? []).slice(0, 5);
    const recentDirs = (state.config.recentDirectories ?? []).slice(0, 5);

    const hasOpenDirs = openDirs.length > 0 && !!onOpenRecentDirectory;
    const hasRecentDirs = recentDirs.length > 0 && !!onOpenRecentDirectory;
    const hasRecentFiles = recentFiles.length > 0;

    return (
        <Container>
            <WelcomeCard>
                <Typography variant="h4" component="h1" gutterBottom>
                    Welcome to Markdown Nexus
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    A simple, elegant Markdown editor for creating and editing your documents.
                </Typography>

                <ButtonGroup>
                    <Button
                        variant="contained"
                        startIcon={<NoteAddIcon />}
                        onClick={createNewFile}
                        size="large"
                    >
                        New File
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<FolderOpenIcon />}
                        onClick={openFile}
                        size="large"
                    >
                        Open File
                    </Button>
                    {hasRecentFiles && (
                        <Button
                            variant="outlined"
                            startIcon={<HistoryIcon />}
                            onClick={openAllRecentFiles}
                            size="large"
                        >
                            Open All Recent
                        </Button>
                    )}
                </ButtonGroup>

                {hasOpenDirs && (
                    <RecentSection>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Open Directories
                        </Typography>
                        <List dense>
                            {openDirs.map((dirPath) => (
                                <ListItem key={dirPath} disablePadding>
                                    <ListItemButton onClick={() => onOpenRecentDirectory!(dirPath)}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                            <FolderOpenIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={dirPath.split(/[\\/]/).pop()}
                                            secondary={dirPath}
                                            primaryTypographyProps={{ noWrap: true }}
                                            secondaryTypographyProps={{ noWrap: true, fontSize: 12 }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </RecentSection>
                )}

                {hasOpenDirs && (hasRecentDirs || hasRecentFiles) && (
                    <Divider sx={{ my: 1 }} />
                )}

                {hasRecentDirs && (
                    <RecentSection>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Recent Directories
                        </Typography>
                        <List dense>
                            {recentDirs.map((dirPath) => (
                                <ListItem key={dirPath} disablePadding>
                                    <ListItemButton onClick={() => onOpenRecentDirectory!(dirPath)}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                            <FolderClosedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={dirPath.split(/[\\/]/).pop()}
                                            secondary={dirPath}
                                            primaryTypographyProps={{ noWrap: true }}
                                            secondaryTypographyProps={{ noWrap: true, fontSize: 12 }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </RecentSection>
                )}

                {hasRecentFiles && (hasRecentDirs || hasOpenDirs) && (
                    <Divider sx={{ my: 1 }} />
                )}

                {hasRecentFiles && (
                    <RecentSection>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Recent Files
                        </Typography>
                        <List dense>
                            {recentFiles.map((fileRef, index) => (
                                <ListItem key={index} disablePadding>
                                    <ListItemButton onClick={() => openRecentFile(fileRef.fileName)}>
                                        <ListItemText
                                            primary={fileRef.fileName.split(/[\\/]/).pop()}
                                            secondary={fileRef.fileName}
                                            primaryTypographyProps={{ noWrap: true }}
                                            secondaryTypographyProps={{ noWrap: true, fontSize: 12 }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </RecentSection>
                )}
            </WelcomeCard>
        </Container>
    );
}
