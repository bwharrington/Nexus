import React, { useCallback } from 'react';
import { AppBar, Toolbar as MuiToolbar, IconButton, Tooltip, Divider, Box, Typography, styled, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import {
    NoteAddIcon,
    FolderOpenIcon,
    SaveIcon,
    SaveAsIcon,
    CloseIcon,
    TabUnselectedIcon,
    SettingsIcon,
    Brightness4Icon,
    Brightness7Icon,
    MinimizeIcon,
    CropSquareIcon,
    BugReportIcon,
    DescriptionIcon,
    PanelLeftOpenIcon,
    PanelLeftCloseIcon,
} from './AppIcons';
import { useFileOperations } from '../hooks';
import { useEditorState, useActiveFile, useTheme, useEditorDispatch } from '../contexts';
import AppIcon from '../../../assets/markdown-nexus.svg';
import NexusIconLight from '../../../assets/markdown-nexus-light-mode.svg';
import NexusIconDark from '../../../assets/markdown-nexus-dark-mode.svg';

const StyledAppBar = styled(AppBar)(({ theme }) => ({
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    boxShadow: 'none',
    borderBottom: `1px solid ${theme.palette.divider}`,
}));

const StyledToolbar = styled(MuiToolbar)({
    WebkitAppRegion: 'drag',
});

const AppLogo = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginRight: 16,
    WebkitAppRegion: 'drag',
});

const ToolbarDivider = styled(Divider)({
    margin: '0 8px',
    height: 24,
    WebkitAppRegion: 'no-drag',
});

const DraggableSpacer = styled(Box)({
    flexGrow: 1,
    WebkitAppRegion: 'drag',
});

interface ToolbarProps {
    fileDirOpen?: boolean;
    onToggleFileDirectory?: () => void;
}

export function Toolbar({ fileDirOpen, onToggleFileDirectory }: ToolbarProps) {
    const state = useEditorState();
    const activeFile = useActiveFile();
    const dispatch = useEditorDispatch();
    const { mode, toggleTheme } = useTheme();
    const [closeAllDialogOpen, setCloseAllDialogOpen] = React.useState(false);
    const [devToolsOpen, setDevToolsOpen] = React.useState(false);
    const {
        createNewFile,
        openFile,
        saveFile,
        saveAllFiles,
        closeAllFiles,
        openConfigFile,
        hasDirtyFiles,
    } = useFileOperations();

    const hasOpenFiles = state.openFiles.length > 0;
    const canSave = activeFile?.isDirty || activeFile?.path === null;

    // Check DevTools state on mount
    React.useEffect(() => {
        window.electronAPI.getDevToolsState().then(setDevToolsOpen);
    }, []);

    const handleToggleDevTools = useCallback(async () => {
        const isOpen = await window.electronAPI.toggleDevTools();
        setDevToolsOpen(isOpen);
    }, []);

    const handleOpenLog = useCallback(async () => {
        const logPath = await window.electronAPI.getLogPath();
        const fileData = await window.electronAPI.readFile(logPath);
        if (fileData) {
            const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            const getFilename = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath;
            dispatch({
                type: 'OPEN_FILE',
                payload: {
                    id: fileId,
                    path: fileData.filePath,
                    name: getFilename(fileData.filePath),
                    content: fileData.content,
                    lineEnding: fileData.lineEnding,
                },
            });
        }
    }, [dispatch]);

    const handleMinimize = useCallback(() => {
        window.electronAPI.minimizeWindow();
    }, []);

    const handleMaximize = useCallback(() => {
        window.electronAPI.maximizeWindow();
    }, []);

    const handleClose = useCallback(() => {
        window.electronAPI.closeWindow();
    }, []);

    const handleCloseAllClick = useCallback(() => {
        setCloseAllDialogOpen(true);
    }, []);

    const handleCloseAllConfirm = useCallback(() => {
        setCloseAllDialogOpen(false);
        closeAllFiles();
    }, [closeAllFiles]);

    const handleCloseAllCancel = useCallback(() => {
        setCloseAllDialogOpen(false);
    }, []);

    const handleOpenAIChat = useCallback(() => {
        window.dispatchEvent(new CustomEvent('open-ai-chat'));
    }, []);

    const handleOpenSettings = useCallback(() => {
        window.dispatchEvent(new CustomEvent('open-settings'));
    }, []);


    const handleSave = useCallback(() => {
        saveFile();
    }, [saveFile]);

    return (
        <StyledAppBar position="static">
            <StyledToolbar variant="dense">
                <AppLogo>
                    <img src={AppIcon} alt="Markdown Nexus" width={28} height={28} />
                    <Typography variant="subtitle1" fontWeight={600}>
                        Markdown Nexus
                    </Typography>
                </AppLogo>

                <ToolbarDivider orientation="vertical" flexItem />

                <Tooltip title="New (Ctrl+N)">
                    <IconButton onClick={createNewFile} color="inherit" sx={{ WebkitAppRegion: 'no-drag' }}>
                        <NoteAddIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Open File (Ctrl+O)">
                    <IconButton onClick={openFile} color="inherit" sx={{ WebkitAppRegion: 'no-drag' }}>
                        <FolderOpenIcon />
                    </IconButton>
                </Tooltip>

                <ToolbarDivider orientation="vertical" flexItem />

                <Tooltip title={fileDirOpen ? 'Hide File Directory' : 'Show File Directory'}>
                    <IconButton
                        onClick={onToggleFileDirectory}
                        color="inherit"
                        sx={{ WebkitAppRegion: 'no-drag' }}
                    >
                        {fileDirOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
                    </IconButton>
                </Tooltip>

                <ToolbarDivider orientation="vertical" flexItem />

                <Tooltip title="Save (Ctrl+S)">
                    <span>
                        <IconButton
                            onClick={handleSave}
                            color="inherit"
                            disabled={!canSave}
                            sx={{ WebkitAppRegion: 'no-drag' }}
                        >
                            <SaveIcon />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Save All">
                    <span>
                        <IconButton 
                            onClick={saveAllFiles} 
                            color="inherit"
                            disabled={!hasDirtyFiles}
                            sx={{ WebkitAppRegion: 'no-drag' }}
                        >
                            <SaveAsIcon />
                        </IconButton>
                    </span>
                </Tooltip>

                <ToolbarDivider orientation="vertical" flexItem />

                <Tooltip title="Close All">
                    <span>
                        <IconButton
                            onClick={handleCloseAllClick}
                            color="inherit"
                            disabled={!hasOpenFiles}
                            sx={{ WebkitAppRegion: 'no-drag' }}
                        >
                            <TabUnselectedIcon />
                        </IconButton>
                    </span>
                </Tooltip>

                <ToolbarDivider orientation="vertical" flexItem />

                <Tooltip title="Nexus (Ctrl+Shift+A)">
                    <IconButton
                        onClick={handleOpenAIChat}
                        color="inherit"
                        sx={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <img
                            src={mode === 'dark' ? NexusIconDark : NexusIconLight}
                            alt="Nexus"
                            width={24}
                            height={24}
                        />
                    </IconButton>
                </Tooltip>

                <DraggableSpacer />

                <Tooltip title="Dev Tools">
                    <IconButton onClick={handleToggleDevTools} color="inherit" sx={{ WebkitAppRegion: 'no-drag' }}>
                        <BugReportIcon />
                    </IconButton>
                </Tooltip>

                <Tooltip title="View Log File">
                    <IconButton onClick={handleOpenLog} color="inherit" sx={{ WebkitAppRegion: 'no-drag' }}>
                        <DescriptionIcon />
                    </IconButton>
                </Tooltip>

                <Tooltip title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                    <IconButton onClick={toggleTheme} color="inherit" sx={{ WebkitAppRegion: 'no-drag' }}>
                        {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                    </IconButton>
                </Tooltip>

                <Tooltip title="Settings (Ctrl+,)">
                    <IconButton
                        onClick={handleOpenSettings}
                        color="inherit"
                        sx={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <SettingsIcon />
                    </IconButton>
                </Tooltip>

                <ToolbarDivider orientation="vertical" flexItem />

                <Tooltip title="Minimize">
                    <IconButton onClick={handleMinimize} color="inherit" size="small" sx={{ WebkitAppRegion: 'no-drag' }}>
                        <MinimizeIcon />
                    </IconButton>
                </Tooltip>

                <Tooltip title="Maximize">
                    <IconButton onClick={handleMaximize} color="inherit" size="small" sx={{ WebkitAppRegion: 'no-drag' }}>
                        <CropSquareIcon />
                    </IconButton>
                </Tooltip>

                <Tooltip title="Close">
                    <IconButton onClick={handleClose} color="inherit" size="small" sx={{ WebkitAppRegion: 'no-drag' }}>
                        <CloseIcon />
                    </IconButton>
                </Tooltip>
            </StyledToolbar>
            <Dialog
                open={closeAllDialogOpen}
                onClose={handleCloseAllCancel}
            >
                <DialogTitle>Close All Files?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to close all {state.openFiles.length} open file{state.openFiles.length !== 1 ? 's' : ''}?
                        {hasDirtyFiles && ' Unsaved changes will be lost.'}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAllCancel}>Cancel</Button>
                    <Button onClick={handleCloseAllConfirm} variant="contained" color="error">
                        Close All
                    </Button>
                </DialogActions>
            </Dialog>
        </StyledAppBar>
    );
}
