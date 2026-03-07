import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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
import { useAIChat } from '../hooks';
import type { AIProvider } from '../hooks';
import { useAIDiffEdit } from '../hooks/useAIDiffEdit';
import { useAIResearch } from '../hooks/useAIResearch';
import { useAIGoDeeper } from '../hooks/useAIGoDeeper';
import { useAITechResearch } from '../hooks/useAITechResearch';
import type { GoDeepDepthLevel } from '../hooks/useAIGoDeeper';
import type { ResearchDepthLevel } from '../hooks/useAIResearch';
import { extractDocumentTopics } from '../utils/extractDocumentTopics';
import { useEditLoadingMessage } from '../hooks/useEditLoadingMessage';
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
    onToggleContextDoc: (filePath: string) => void;
}

export function AIChatDialog({
    open,
    onClose,
    attachedFiles,
    setAttachedFiles,
    onAddAttachedFiles,
    onRemoveAttachedFile,
    onToggleFileAttachment,
    onToggleContextDoc,
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

    // Track the filename being deepened (set when Go Deeper starts, cleared on dismiss)
    const [goDeepFileName, setGoDeepFileName] = useState<string | null>(null);

    // User-selected depth level for Go Deeper expansions
    const [goDeepDepthLevel, setGoDeepDepthLevel] = useState<GoDeepDepthLevel>('practitioner');

    // Glow animation state for context doc
    const [glowingFile, setGlowingFile] = useState<string | null>(null);

    // Mode state - persisted in config (chat | edit | research)
    const [mode, setMode] = useState<AIChatMode>(editorState.config.aiChatMode ?? 'chat');
    const [editModeError, setEditModeError] = useState<string | null>(null);
    const [isEditLoading, setIsEditLoading] = useState(false);
    const activeEditRequestIdRef = useRef<string | null>(null);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

    // AI Diff Edit hook
    const { requestEdit, hasDiffTab } = useAIDiffEdit();

    // AI Research hook
    const {
        submitResearch,
        cancelResearch,
        dismissResearchProgress,
        isResearchLoading,
        researchError,
        researchPhase,
        deepeningProgress,
        inferenceResult,
        researchComplete,
    } = useAIResearch();

    // AI Go Deeper hook
    const {
        submitAnalysis,
        submitExpansion,
        cancelGoDeeper,
        dismissGoDeepProgress,
        isGoDeepLoading,
        goDeepError,
        goDeepPhase,
        goDeepProgress,
        goDeepAnalysis,
        goDeepComplete,
    } = useAIGoDeeper();

    // AI Tech Research hook
    const {
        submitTechResearch,
        cancelTechResearch,
        dismissTechResearchProgress,
        isTechResearchLoading,
        techResearchError,
        techResearchPhase,
        techResearchComplete,
        techResearchFileName,
    } = useAITechResearch();
    const [techResearchQuery, setTechResearchQuery] = useState<string | null>(null);

    // Rotating loading messages with typewriter effect
    const { displayText: loadingDisplayText } = useEditLoadingMessage(isEditLoading);

    const {
        isStatusesLoaded,
        getProviderForModel,
        models,
        selectedModel,
        setSelectedModel,
        isLoadingModels,
        messages,
        inputValue,
        setInputValue,
        isLoading,
        error,
        sendMessage,
        cancelCurrentRequest,
        clearChat,
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

    // User-selected depth level for Research mode (persisted in config)
    const [researchDepthLevel, setResearchDepthLevel] = useState<ResearchDepthLevel>(
        (editorState.config.aiResearchDepthLevel as ResearchDepthLevel | undefined) ?? 'practitioner'
    );
    const handleResearchDepthLevelChange = useCallback((level: ResearchDepthLevel) => {
        setResearchDepthLevel(level);
        persistConfig({ aiResearchDepthLevel: level });
    }, [persistConfig]);

    // Persist mode to config, auto-select valid model if current is restricted
    const handleModeChange = useCallback((newMode: AIChatMode) => {
        setMode(newMode);
        persistConfig({ aiChatMode: newMode });
        dismissResearchProgress();
        dismissGoDeepProgress();
        dismissTechResearchProgress();
        setTechResearchQuery(null);

        const currentProvider = getProviderForModel(selectedModel);
        if (currentProvider && isProviderRestrictedFromMode(currentProvider, newMode)) {
            const firstValid = models.find(m => !isProviderRestrictedFromMode(m.provider, newMode));
            if (firstValid) {
                setSelectedModel(firstValid.id);
                persistConfig({ aiChatMode: newMode, aiChatModel: firstValid.id });
            }
        }
    }, [persistConfig, dismissResearchProgress, dismissGoDeepProgress, dismissTechResearchProgress, getProviderForModel, selectedModel, models, setSelectedModel]);

    // Persist model selection
    const handleModelChange = useCallback((newModel: string) => {
        setSelectedModel(newModel);
        persistConfig({ aiChatModel: newModel });
        dismissResearchProgress();
    }, [setSelectedModel, persistConfig, dismissResearchProgress]);

    // Focus input when dialog opens
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        }
    }, [open]);

    // Context doc sync is handled in App.tsx so it works whether the dialog is open or not.

    // Detect when context document is saved and trigger glow animation
    useEffect(() => {
        if (open && editorState.activeFileId && attachedFiles.length > 0) {
            const activeFile = editorState.openFiles.find(f => f.id === editorState.activeFileId);
            const contextDoc = attachedFiles.find(f => f.isContextDoc);

            if (activeFile && contextDoc && activeFile.path === contextDoc.path && !activeFile.isDirty) {
                setGlowingFile(contextDoc.path);

                const timeout = setTimeout(() => {
                    setGlowingFile(null);
                }, 3000);

                return () => clearTimeout(timeout);
            }
        }
    }, [open, editorState.openFiles, editorState.activeFileId, attachedFiles]);

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Reset to chat mode when the selected model's provider doesn't support the current mode
    useEffect(() => {
        if (mode !== 'chat' && isProviderRestrictedFromMode(provider, mode)) {
            handleModeChange('chat');
        }
    }, [provider, mode, handleModeChange]);

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
        dismissResearchProgress();
        dismissGoDeepProgress();
        dismissTechResearchProgress();
        setTechResearchQuery(null);

        const currentProvider = getProviderForModel(selectedModel) ?? 'claude';

        // Edit mode request
        if (mode === 'edit' && !isProviderRestrictedFromMode(currentProvider, 'edit')) {
            setIsEditLoading(true);
            const requestId = `ai-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            activeEditRequestIdRef.current = requestId;
            try {
                await requestEdit(inputValue, currentProvider as 'claude' | 'openai', selectedModel, requestId);
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

        // Research mode request
        if (mode === 'research' && !isProviderRestrictedFromMode(currentProvider, 'research')) {
            const requestId = `ai-research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            try {
                const topic = inputValue;
                setInputValue('');
                await submitResearch(topic, currentProvider, selectedModel, requestId, researchDepthLevel);
            } catch {
                // Error is handled by the useAIResearch hook (researchError state)
            }
            return;
        }

        // Tech Research mode request
        if (mode === 'techresearch') {
            const requestId = `ai-techresearch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            try {
                const query = inputValue;
                setInputValue('');
                setTechResearchQuery(query);
                await submitTechResearch(query, currentProvider, selectedModel, requestId, 'practitioner');
            } catch {
                // Error is handled by the useAITechResearch hook (techResearchError state)
            }
            return;
        }

        // Regular chat mode
        const enabledFiles = attachedFiles.filter(file =>
            !file.isContextDoc || file.enabled !== false
        );
        await sendMessage(enabledFiles.length > 0 ? enabledFiles : undefined);
        setAttachedFiles(prev => prev.filter(file => file.isContextDoc));
    }, [mode, selectedModel, getProviderForModel, inputValue, researchDepthLevel, requestEdit, submitResearch, submitTechResearch, setInputValue, sendMessage, attachedFiles, dismissResearchProgress, dismissGoDeepProgress, dismissTechResearchProgress]);

    const handleGoDeeper = useCallback(async () => {
        const activeFile = editorState.activeFileId
            ? editorState.openFiles.find(f => f.id === editorState.activeFileId)
            : null;

        if (!activeFile || !activeFile.content.trim()) return;

        const currentProvider = getProviderForModel(selectedModel) ?? 'claude';
        const requestId = `ai-godeep-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const topic = activeFile.name.replace(/\.md$/i, '').replace(/\s+v\d+$/i, '');

        setGoDeepFileName(activeFile.name);
        dismissResearchProgress();
        dismissGoDeepProgress();
        dismissTechResearchProgress();
        setTechResearchQuery(null);

        try {
            await submitAnalysis(
                activeFile.id,
                activeFile.content,
                topic,
                currentProvider,
                selectedModel,
                requestId,
                goDeepDepthLevel,
            );
        } catch {
            // Error handled by hook state (goDeepError)
        }
    }, [editorState.activeFileId, editorState.openFiles, getProviderForModel, selectedModel, submitAnalysis, dismissResearchProgress, dismissGoDeepProgress, dismissTechResearchProgress, goDeepDepthLevel]);

    const handleTopicsContinue = useCallback(async (selectedTopics: string[]) => {
        try {
            await submitExpansion(selectedTopics);
        } catch {
            // Error handled by hook state (goDeepError)
        }
    }, [submitExpansion]);

    const handleCancelRequest = useCallback(async () => {
        if (isLoading) {
            await cancelCurrentRequest();
            return;
        }

        if (isEditLoading) {
            const requestId = activeEditRequestIdRef.current;
            activeEditRequestIdRef.current = null;
            setIsEditLoading(false);
            setEditModeError('Edit request canceled');

            if (!requestId) return;

            try {
                await window.electronAPI.cancelAIEditRequest(requestId);
            } catch (err) {
                console.error('Failed to cancel AI edit request:', err);
            }
            return;
        }

        if (isResearchLoading) {
            await cancelResearch();
            return;
        }

        if (isGoDeepLoading) {
            await cancelGoDeeper();
            return;
        }

        if (isTechResearchLoading) {
            await cancelTechResearch();
        }
    }, [isLoading, isEditLoading, isResearchLoading, isGoDeepLoading, isTechResearchLoading, cancelCurrentRequest, cancelResearch, cancelGoDeeper, cancelTechResearch]);

    const handleClearChatConfirm = useCallback(() => {
        clearChat();
        dismissResearchProgress();
        dismissGoDeepProgress();
        dismissTechResearchProgress();
        setTechResearchQuery(null);
        setGoDeepFileName(null);
        setAttachedFiles([]);
        setClearConfirmOpen(false);
    }, [clearChat, dismissResearchProgress, dismissGoDeepProgress, dismissTechResearchProgress, setAttachedFiles]);

    // Document headings extracted for topic selection (only computed during topic_selection pause)
    // Must be above the early return to satisfy Rules of Hooks
    const documentTopics = useMemo(() => {
        if (goDeepPhase !== 'topic_selection') return [];
        const activeFile = editorState.activeFileId
            ? editorState.openFiles.find(f => f.id === editorState.activeFileId)
            : null;
        if (!activeFile?.content) return [];
        return extractDocumentTopics(
            activeFile.content,
            goDeepAnalysis?.newDeepDiveTopics ?? [],
        );
    }, [goDeepPhase, editorState.activeFileId, editorState.openFiles, goDeepAnalysis]);

    if (!open) return null;

    const hasProviders = models.length > 0 || isLoadingModels;
    const hasActiveRequest = isLoading || isEditLoading || isResearchLoading || isGoDeepLoading || isTechResearchLoading;

    // The file that would be targeted if the user clicks Go Deeper right now
    const activeFileName = editorState.activeFileId
        ? (editorState.openFiles.find(f => f.id === editorState.activeFileId)?.name ?? null)
        : null;

    return (
        <DialogContainer ref={dialogRef}>
            {hasActiveRequest && <BorderAnimation />}
            <PanelHeader>
                <HeaderControls>
                    <Typography variant="subtitle2" fontWeight={600}>
                        Nexus
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
                        messages={messages}
                        greeting={greeting}
                        isLoading={isLoading}
                        isEditLoading={isEditLoading}
                        isResearchLoading={isResearchLoading}
                        researchPhase={researchPhase}
                        deepeningProgress={deepeningProgress}
                        inferenceResult={inferenceResult}
                        researchComplete={researchComplete}
                        isGoDeepLoading={isGoDeepLoading}
                        goDeepPhase={goDeepPhase}
                        goDeepProgress={goDeepProgress}
                        goDeepAnalysis={goDeepAnalysis}
                        goDeepComplete={goDeepComplete}
                        goDeepError={goDeepError}
                        goDeepFileName={goDeepFileName ?? activeFileName}
                        documentTopics={documentTopics}
                        onGoDeeper={handleGoDeeper}
                        onTopicsContinue={handleTopicsContinue}
                        depthLevel={goDeepDepthLevel}
                        onDepthLevelChange={setGoDeepDepthLevel}
                        isTechResearchLoading={isTechResearchLoading}
                        techResearchPhase={techResearchPhase}
                        techResearchComplete={techResearchComplete}
                        techResearchError={techResearchError}
                        techResearchFileName={techResearchFileName}
                        techResearchQuery={techResearchQuery}
                        hasDiffTab={hasDiffTab}
                        loadingDisplayText={loadingDisplayText}
                        error={error}
                        editModeError={editModeError}
                        researchError={researchError}
                        messagesEndRef={messagesEndRef}
                    />

                    <FileAttachmentsList
                        files={attachedFiles}
                        glowingFile={glowingFile}
                        onRemove={onRemoveAttachedFile}
                        onToggleContextDoc={onToggleContextDoc}
                    />

                    <MessageInput
                        inputRef={inputRef}
                        inputValue={inputValue}
                        mode={mode}
                        models={models}
                        selectedModel={selectedModel}
                        isLoadingModels={isLoadingModels}
                        isLoading={isLoading}
                        isEditLoading={isEditLoading}
                        isResearchLoading={isResearchLoading}
                        isTechResearchLoading={isTechResearchLoading}
                        hasDiffTab={hasDiffTab}
                        hasActiveRequest={hasActiveRequest}
                        openFiles={editorState.openFiles}
                        attachedFiles={attachedFiles}
                        researchDepthLevel={researchDepthLevel}
                        onModeChange={handleModeChange}
                        onModelChange={handleModelChange}
                        onResearchDepthLevelChange={handleResearchDepthLevelChange}
                        onAttachFromDisk={handleAttachFromDisk}
                        onToggleFileAttachment={onToggleFileAttachment}
                        onToggleContextDoc={onToggleContextDoc}
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
