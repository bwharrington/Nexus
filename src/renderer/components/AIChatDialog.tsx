import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    Box,
    styled,
    IconButton,
    Typography,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    CircularProgress,
} from '@mui/material';
import {
    CloseIcon,
    DeleteOutlineIcon,
} from './AppIcons';
import { ChatMessages } from './ChatMessages';
import { FileAttachmentsList } from './FileAttachmentsList';
import type { AttachedFile } from './FileAttachmentsList';
import { MessageInput } from './MessageInput';
import { useAIChat, useAIAsk } from '../hooks';
import type { AIProvider } from '../hooks';
import { useAIDiffEdit } from '../hooks/useAIDiffEdit';
import { useAICreate } from '../hooks/useAICreate';
import { useEditorState, useEditorDispatch } from '../contexts/EditorContext';
import type { AIChatMode } from '../types/global';
import type { IFile } from '../types';
import { isProviderRestrictedFromMode } from '../aiProviderModeRestrictions';

const AI_GREETINGS = [
    "I'll be back\u2026 right after you say something.",
    "You have 20 seconds to comply. Chat now.",
    "I'm sorry, Dave. I'm afraid I can talk\u2026 if you start.",
    "Number 5 is alive! Your move, human.",
    "Come with me if you want to chat.",
    "I've seen chat things you people wouldn't believe.",
    "There is no spoon. There is only chat. Begin.",
    "Hello, I am Baymax. On a scale of 1\u201310, how chatty are you?",
    "Sir, the conversation is ready.",
    "Eva? \u2026No, but I'm still here. Talk to me.",
    "You are the one\u2026 who needs to type first.",
    "Resistance is futile. Start typing.",
    "More than meets the eye\u2026 and ready to talk.",
    "The cake is a lie. This chat is not.",
    "Dead or alive, you're chatting with me.",
    "Human detected. Beep boop. Your turn.",
    "I'm more machine now than man\u2026 but I still love a good chat.",
    "Let's make the robots jealous. Start now.",
    "I am Groot\u2026 and I want to chat.",
    "The machines are listening. Impress them.",
    "You must construct additional pylons.",
];

const DialogContainer = styled(Box)(({ theme }) => ({
    position: 'relative',
    backgroundColor: theme.palette.background.paper,
    borderLeft: `1px solid ${theme.palette.divider}`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
}));

const BorderAnimation = styled(Box)({
    '@keyframes borderSpin': {
        '0%':   { '--border-angle': '0deg' },
        '100%': { '--border-angle': '360deg' },
    },
    '@property --border-angle': {
        syntax: '"<angle>"',
        inherits: 'false',
        initialValue: '0deg',
    },
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    pointerEvents: 'none',
    zIndex: 10,
    '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        padding: '3px',
        background: 'conic-gradient(from var(--border-angle), #0A68C8, #40D0FF, #78E8FF, #FFFFFF, #F4D878, #E8B830, #C8810A, #E8B830, #F4D878, #FFFFFF, #78E8FF, #40D0FF, #0A68C8)',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        animation: 'borderSpin 2s linear infinite',
    },
});

const PanelHeader = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: theme.palette.action.hover,
    borderBottom: `1px solid ${theme.palette.divider}`,
}));

const HeaderControls = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
});

const NoProvidersContainer = styled(Box)({
    padding: 24,
    textAlign: 'center',
});

interface AIChatDialogProps {
    open: boolean;
    onClose: () => void;
    attachedFiles: AttachedFile[];
    setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
    onAddAttachedFiles: (files: AttachedFile[]) => void;
    onRemoveAttachedFile: (filePath: string) => void;
    onToggleFileAttachment: (file: IFile) => void;
}

export function AIChatDialog({
    open,
    onClose,
    attachedFiles,
    setAttachedFiles,
    onAddAttachedFiles,
    onRemoveAttachedFile,
    onToggleFileAttachment,
}: AIChatDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const editorState = useEditorState();
    const dispatch = useEditorDispatch();

    // Random greeting (stable for session lifetime)
    const [greeting] = useState(() =>
        AI_GREETINGS[Math.floor(Math.random() * AI_GREETINGS.length)]
    );

    // Mode state - persisted in config
    const [mode, setMode] = useState<AIChatMode>(editorState.config.aiChatMode ?? 'ask');
    const [editModeError, setEditModeError] = useState<string | null>(null);
    const [hasSerperKey, setHasSerperKey] = useState(false);
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [isEditLoading, setIsEditLoading] = useState(false);
    const activeEditRequestIdRef = useRef<string | null>(null);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

    // AI Diff Edit hook
    const { requestEdit, hasDiffTab, webSearchPhase: editWebSearchPhase, resetWebSearch: resetEditWebSearch } = useAIDiffEdit();

    // AI Create hook
    const {
        submitCreate,
        cancelCreate,
        dismissCreateProgress,
        isCreateLoading,
        createError,
        createPhase,
        createComplete,
        createFileName,
    } = useAICreate();
    const [createQuery, setCreateQuery] = useState<string | null>(null);

    // AI Ask hook (stateless Q&A)
    const {
        askMessages,
        isAskLoading,
        askPhase,
        webSearchPhase: askWebSearchPhase,
        askError,
        submitAsk,
        cancelAsk,
        clearAsk,
    } = useAIAsk();

    const {
        isStatusesLoaded,
        getProviderForModel,
        models,
        selectedModel,
        setSelectedModel,
        isLoadingModels,
        inputValue,
        setInputValue,
    } = useAIChat({
        savedModel: editorState.config.aiChatModel,
        aiModels: editorState.config.aiModels,
    });

    // Derive provider from the currently selected model
    const provider: AIProvider = getProviderForModel(selectedModel) ?? 'claude';

    // Persist config helper
    const persistConfig = useCallback((updates: Record<string, unknown>) => {
        const nextConfig = { ...editorState.config, ...updates };
        dispatch({ type: 'SET_CONFIG', payload: nextConfig });
        void window.electronAPI.saveConfig(nextConfig).catch((err: unknown) => {
            console.error('Failed to save AI chat config:', err);
        });
    }, [dispatch, editorState.config]);

    // Persist mode to config, auto-select valid model if current is restricted
    const handleModeChange = useCallback((newMode: AIChatMode) => {
        setMode(newMode);
        persistConfig({ aiChatMode: newMode });
        dismissCreateProgress();
        setCreateQuery(null);

        const currentProvider = getProviderForModel(selectedModel);
        if (currentProvider && isProviderRestrictedFromMode(currentProvider, newMode)) {
            const firstValid = models.find(m => !isProviderRestrictedFromMode(m.provider, newMode));
            if (firstValid) {
                setSelectedModel(firstValid.id);
                persistConfig({ aiChatMode: newMode, aiChatModel: firstValid.id });
            }
        }
    }, [persistConfig, dismissCreateProgress, getProviderForModel, selectedModel, models, setSelectedModel]);

    // Persist model selection
    const handleModelChange = useCallback((newModel: string) => {
        setSelectedModel(newModel);
        persistConfig({ aiChatModel: newModel });
    }, [setSelectedModel, persistConfig]);

    // Check Serper key availability once on mount; enable web search by default if key exists
    useEffect(() => {
        window.electronAPI.hasSerperKey().then(has => {
            setHasSerperKey(has);
            if (has) setWebSearchEnabled(true);
        }).catch(() => {});
    }, []);

    // Focus input and reset session state when dialog opens
    useEffect(() => {
        if (open) {
            setWebSearchEnabled(false);
            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        }
    }, [open]);


    // Scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [askMessages]);

    // Reset to ask mode when the selected model's provider doesn't support the current mode
    useEffect(() => {
        if (mode !== 'ask' && isProviderRestrictedFromMode(provider, mode)) {
            handleModeChange('ask');
        }
    }, [provider, mode, handleModeChange]);

    const handleWebSearchToggle = useCallback(() => {
        setWebSearchEnabled(prev => !prev);
    }, []);

    // Open native file picker and add results as attachments
    const handleAttachFromDisk = useCallback(async () => {
        const result = await window.electronAPI.openFileDialog({
            properties: ['openFile', 'multiSelections'],
        });

        if (result && !result.canceled && result.filePaths.length > 0) {
            const newFiles: AttachedFile[] = result.filePaths.map((filePath: string) => {
                const parts = filePath.split(/[/\\]/);
                const fileName = parts[parts.length - 1] || filePath;
                const fileExtension = fileName.includes('.')
                    ? fileName.split('.').pop()?.toLowerCase() || 'unknown'
                    : 'unknown';
                return {
                    name: fileName,
                    path: filePath,
                    type: fileExtension,
                    size: 0,
                };
            });
            onAddAttachedFiles(newFiles);
        }
    }, [onAddAttachedFiles]);

    const handleSendMessage = useCallback(async () => {
        setEditModeError(null);
        dismissCreateProgress();
        setCreateQuery(null);

        const currentProvider = getProviderForModel(selectedModel) ?? 'claude';

        // Edit mode request
        if (mode === 'edit' && !isProviderRestrictedFromMode(currentProvider, 'edit')) {
            setIsEditLoading(true);
            const requestId = `ai-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            activeEditRequestIdRef.current = requestId;
            try {
                await requestEdit(inputValue, currentProvider as 'claude' | 'openai' | 'gemini', selectedModel, requestId, webSearchEnabled);
                if (activeEditRequestIdRef.current !== requestId) return;
                setInputValue('');
            } catch (err) {
                if (activeEditRequestIdRef.current !== requestId) return;
                setEditModeError(err instanceof Error ? err.message : 'Edit request failed');
            } finally {
                if (activeEditRequestIdRef.current === requestId) {
                    activeEditRequestIdRef.current = null;
                    setIsEditLoading(false);
                }
            }
            return;
        }

        // Create mode request
        if (mode === 'create') {
            const requestId = `ai-create-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            try {
                const request = inputValue;
                const enabledFilesForCreate = [...attachedFiles];
                setInputValue('');
                setCreateQuery(request);
                dismissCreateProgress();
                await submitCreate(request, enabledFilesForCreate, currentProvider, selectedModel, requestId, webSearchEnabled);
            } catch {
                // Error is handled by the useAICreate hook (createError state)
            }
            return;
        }

        // Ask mode request (stateless Q&A)
        if (mode === 'ask') {
            const filesToAttach = attachedFiles.length > 0 ? [...attachedFiles] : undefined;
            const question = inputValue;
            setInputValue('');
            setAttachedFiles([]);
            await submitAsk(question, currentProvider, selectedModel, filesToAttach, webSearchEnabled);
        }
    }, [mode, selectedModel, getProviderForModel, inputValue, requestEdit, submitAsk, submitCreate, setInputValue, attachedFiles, setAttachedFiles, dismissCreateProgress, webSearchEnabled]);

    const handleCancelRequest = useCallback(async () => {
        if (isAskLoading) {
            await cancelAsk();
            return;
        }

        if (isEditLoading) {
            const requestId = activeEditRequestIdRef.current;
            activeEditRequestIdRef.current = null;
            setIsEditLoading(false);
            setEditModeError('Edit request canceled');
            resetEditWebSearch();

            if (!requestId) return;

            try {
                await window.electronAPI.cancelAIEditRequest(requestId);
            } catch (err) {
                console.error('Failed to cancel AI edit request:', err);
            }
            return;
        }

        if (isCreateLoading) {
            await cancelCreate();
        }
    }, [isAskLoading, isEditLoading, isCreateLoading, cancelAsk, cancelCreate, resetEditWebSearch]);

    const handleClearChatConfirm = useCallback(() => {
        clearAsk();
        dismissCreateProgress();
        setCreateQuery(null);
        setAttachedFiles([]);
        setWebSearchEnabled(false);
        setClearConfirmOpen(false);
    }, [clearAsk, dismissCreateProgress, setAttachedFiles]);

    if (!open) return null;

    const hasProviders = models.length > 0 || isLoadingModels;
    const hasActiveRequest = isAskLoading || isEditLoading || isCreateLoading;

    console.log('[AIChatDialog] render:', {
        hasActiveRequest,
        isAskLoading,
        isEditLoading,
        isCreateLoading,
        hasDiffTab,
        mode,
        inputValue,
    });

    return (
        <DialogContainer ref={dialogRef}>
            {hasActiveRequest && <BorderAnimation />}
            <PanelHeader>
                <HeaderControls>
                    <Typography variant="subtitle2" fontWeight={600}>
                        Nexus AI
                    </Typography>
                </HeaderControls>
                <HeaderControls>
                    <IconButton size="small" onClick={() => setClearConfirmOpen(true)} title="Clear chat">
                        <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </HeaderControls>
            </PanelHeader>

            {!isStatusesLoaded ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                </Box>
            ) : !hasProviders ? (
                <NoProvidersContainer>
                    <Typography color="text.secondary" gutterBottom>
                        No AI providers configured
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Add API keys in Settings (Ctrl+,) under the "AI API Keys" section.
                    </Typography>
                </NoProvidersContainer>
            ) : (
                <>
                    <ChatMessages
                        askMessages={askMessages}
                        greeting={greeting}
                        isAskLoading={isAskLoading}
                        askPhase={askPhase}
                        askWebSearchPhase={askWebSearchPhase}
                        webSearchEnabled={webSearchEnabled}
                        isEditLoading={isEditLoading}
                        editWebSearchPhase={editWebSearchPhase}
                        isCreateLoading={isCreateLoading}
                        createPhase={createPhase}
                        createComplete={createComplete}
                        createError={createError}
                        createFileName={createFileName}
                        createQuery={createQuery}
                        mode={mode}
                        hasDiffTab={hasDiffTab}
                        askError={askError}
                        editModeError={editModeError}
                        messagesEndRef={messagesEndRef}
                    />

                    <FileAttachmentsList
                        files={attachedFiles}
                        onRemove={onRemoveAttachedFile}
                    />

                    <MessageInput
                        inputRef={inputRef}
                        inputValue={inputValue}
                        mode={mode}
                        models={models}
                        selectedModel={selectedModel}
                        isLoadingModels={isLoadingModels}
                        isAskLoading={isAskLoading}
                        isEditLoading={isEditLoading}
                        isCreateLoading={isCreateLoading}
                        hasDiffTab={hasDiffTab}
                        hasActiveRequest={hasActiveRequest}
                        openFiles={editorState.openFiles}
                        attachedFiles={attachedFiles}
                        hasSerperKey={hasSerperKey}
                        webSearchEnabled={webSearchEnabled}
                        onModeChange={handleModeChange}
                        onModelChange={handleModelChange}
                        onAttachFromDisk={handleAttachFromDisk}
                        onToggleFileAttachment={onToggleFileAttachment}
                        onWebSearchToggle={handleWebSearchToggle}
                        onInputChange={setInputValue}
                        onSend={handleSendMessage}
                        onCancel={handleCancelRequest}
                        onClose={onClose}
                    />
                </>
            )}

            <Dialog
                open={clearConfirmOpen}
                onClose={() => setClearConfirmOpen(false)}
            >
                <DialogTitle>Clear Chat?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will permanently remove all messages in this chat session. Are you sure you want to continue?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClearConfirmOpen(false)}>Cancel</Button>
                    <Button onClick={handleClearChatConfirm} variant="contained" color="error">
                        Clear Chat
                    </Button>
                </DialogActions>
            </Dialog>
        </DialogContainer>
    );
}
