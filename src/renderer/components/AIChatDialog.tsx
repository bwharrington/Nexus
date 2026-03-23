import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
    Box,
    styled,
    IconButton,
    Tooltip,
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
    NoteAddIcon,
    SearchIcon,
    KeyboardArrowUpIcon,
    KeyboardArrowDownIcon,
} from './AppIcons';
import { ChatMessages } from './ChatMessages';
import { FileAttachmentsList } from './FileAttachmentsList';
import type { AttachedFile } from './FileAttachmentsList';
import { MessageInput } from './MessageInput';
import { useAIChat, useAIAsk, useAIMultiAgent, usePromptHistory } from '../hooks';
import type { AIProvider } from '../hooks';
import { useAIDiffEdit } from '../hooks/useAIDiffEdit';
import { useAICreate } from '../hooks/useAICreate';
import { useEditorState, useEditorDispatch } from '../contexts/EditorContext';
import type { AIChatMode } from '../types/global';
import type { IFile } from '../types';
import { isProviderRestrictedFromMode } from '../aiProviderModeRestrictions';
import { isMultiAgentModel, DEFAULT_MULTI_AGENT_TOOLS } from '../../shared/multiAgentUtils';
import type { MultiAgentBuiltInTool } from '../../shared/multiAgentUtils';

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

const ChatSearchBar = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 12px',
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
}));

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
    const chatSearchInputRef = useRef<HTMLInputElement>(null);
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
    const [chatContextEnabled, setChatContextEnabled] = useState(editorState.config.aiChatContextEnabled ?? false);

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

    // AI Multi-Agent hook (xAI Responses API)
    const {
        multiAgentMessages,
        isMultiAgentLoading,
        multiAgentPhase,
        multiAgentError,
        streamState: multiAgentStreamState,
        submitMultiAgent,
        cancelMultiAgent,
        clearMultiAgent,
    } = useAIMultiAgent();

    // Multi-agent tool and reasoning effort state
    const [multiAgentTools, setMultiAgentTools] = useState<string[]>([...DEFAULT_MULTI_AGENT_TOOLS]);
    const [reasoningEffort, setReasoningEffort] = useState<'low' | 'high'>('low');

    // Chat search state
    const [chatSearchOpen, setChatSearchOpen] = useState(false);
    const [chatSearchQuery, setChatSearchQuery] = useState('');
    const [chatSearchIndex, setChatSearchIndex] = useState(0);

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

    // Prompt history (Up/Down arrow cycling)
    const { addToHistory, navigateUp, navigateDown, resetNavigation } = usePromptHistory();

    // Derive provider from the currently selected model
    const provider: AIProvider = getProviderForModel(selectedModel) ?? 'claude';

    // Detect multi-agent model
    const isMultiAgent = isMultiAgentModel(selectedModel);

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

    // Focus input when dialog opens
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        }
    }, [open]);


    // Scroll to bottom when new messages arrive or when a request starts
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [askMessages, multiAgentMessages, isAskLoading, isEditLoading, isCreateLoading, isMultiAgentLoading]);

    // Compute search matches across all messages
    const chatSearchMatches = useMemo(() => {
        if (!chatSearchQuery.trim()) return [];
        const query = chatSearchQuery.toLowerCase();
        const messages = isMultiAgent ? multiAgentMessages : askMessages;
        const matches: { messageIndex: number; startOffset: number }[] = [];
        messages.forEach((msg, msgIdx) => {
            const lower = msg.content.toLowerCase();
            let pos = 0;
            while ((pos = lower.indexOf(query, pos)) !== -1) {
                matches.push({ messageIndex: msgIdx, startOffset: pos });
                pos += query.length;
            }
        });
        return matches;
    }, [chatSearchQuery, askMessages, multiAgentMessages, isMultiAgent]);

    // Imperative scroll to a search match by index
    const scrollToSearchMatch = useCallback((index: number, matches: { messageIndex: number }[]) => {
        const match = matches[index];
        if (!match) return;
        requestAnimationFrame(() => {
            const el = document.querySelector(`[data-msg-index="${match.messageIndex}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }, []);

    // Navigate to next search match
    const handleSearchNext = useCallback(() => {
        if (chatSearchMatches.length === 0) return;
        setChatSearchIndex(prev => {
            const next = (prev + 1) % chatSearchMatches.length;
            scrollToSearchMatch(next, chatSearchMatches);
            return next;
        });
    }, [chatSearchMatches, scrollToSearchMatch]);

    // Navigate to previous search match
    const handleSearchPrev = useCallback(() => {
        if (chatSearchMatches.length === 0) return;
        setChatSearchIndex(prev => {
            const next = (prev - 1 + chatSearchMatches.length) % chatSearchMatches.length;
            scrollToSearchMatch(next, chatSearchMatches);
            return next;
        });
    }, [chatSearchMatches, scrollToSearchMatch]);

    // Reset index and scroll to first match when query changes
    useEffect(() => {
        setChatSearchIndex(0);
        scrollToSearchMatch(0, chatSearchMatches);
    }, [chatSearchMatches, scrollToSearchMatch]);

    // Auto-focus search input when bar opens
    useEffect(() => {
        if (chatSearchOpen) {
            requestAnimationFrame(() => chatSearchInputRef.current?.focus());
        }
    }, [chatSearchOpen]);

    // Reset to ask mode when the selected model's provider doesn't support the current mode,
    // or when a multi-agent model is selected and edit mode is active (multi-agent doesn't support edit).
    useEffect(() => {
        const multiAgentBlocksMode = isMultiAgent && mode === 'edit';
        if (isProviderRestrictedFromMode(provider, mode) || multiAgentBlocksMode) {
            handleModeChange('ask');
        }
    }, [provider, mode, handleModeChange, isMultiAgent]);

    const handleWebSearchToggle = useCallback(() => {
        setWebSearchEnabled(prev => !prev);
    }, []);

    // Chat context toggle — include Ask chat history as context for Edit/Create
    const handleChatContextToggle = useCallback(() => {
        setChatContextEnabled(prev => {
            const next = !prev;
            persistConfig({ aiChatContextEnabled: next });
            return next;
        });
    }, [persistConfig]);

    // Build a formatted chat context block from ask + multi-agent messages
    const buildChatContextBlock = useCallback((): string => {
        const messages = [...askMessages, ...multiAgentMessages];
        if (messages.length === 0) return '';
        return messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    }, [askMessages, multiAgentMessages]);

    // Create a new file tab from an assistant chat response
    const handleCreateFileFromMessage = useCallback((content: string) => {
        const fileId = Math.random().toString(36).substring(2, 11);
        dispatch({
            type: 'OPEN_FILE',
            payload: {
                id: fileId,
                path: null,
                name: 'Untitled.md',
                content,
                lineEnding: editorState.config.defaultLineEnding,
                viewMode: 'preview' as const,
                fileType: 'markdown' as const,
            },
        });
    }, [dispatch, editorState.config.defaultLineEnding]);

    // Export the full chat (all prompts + responses) to a new untitled file
    const handleExportChatToFile = useCallback(() => {
        const messages = isMultiAgent ? multiAgentMessages : askMessages;
        if (messages.length === 0) return;

        const lines: string[] = [];
        for (const msg of messages) {
            if (msg.role === 'user') {
                lines.push(`**You:** ${msg.content}`);
            } else {
                lines.push(`**Nexus AI:**\n\n${msg.content}`);
            }
            lines.push('---');
        }
        // Remove trailing separator
        if (lines[lines.length - 1] === '---') lines.pop();

        const fileId = Math.random().toString(36).substring(2, 11);
        dispatch({
            type: 'OPEN_FILE',
            payload: {
                id: fileId,
                path: null,
                name: 'Untitled.md',
                content: lines.join('\n\n'),
                lineEnding: editorState.config.defaultLineEnding,
                viewMode: 'preview' as const,
                fileType: 'markdown' as const,
            },
        });
    }, [isMultiAgent, multiAgentMessages, askMessages, dispatch, editorState.config.defaultLineEnding]);

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

    const handleInputChange = useCallback((value: string) => {
        resetNavigation();
        setInputValue(value);
    }, [resetNavigation, setInputValue]);

    const handleHistoryKeyDown = useCallback((e: React.KeyboardEvent) => {
        const target = e.target as HTMLTextAreaElement;

        if (e.key === 'ArrowUp') {
            if (target.selectionStart === 0 && target.selectionEnd === 0) {
                const prev = navigateUp(inputValue);
                if (prev !== undefined) {
                    e.preventDefault();
                    setInputValue(prev);
                }
            }
        } else if (e.key === 'ArrowDown') {
            const len = target.value.length;
            if (target.selectionStart === len && target.selectionEnd === len) {
                const next = navigateDown();
                if (next !== undefined) {
                    e.preventDefault();
                    setInputValue(next);
                }
            }
        }
    }, [inputValue, navigateUp, navigateDown, setInputValue]);

    const handleSendMessage = useCallback(async () => {
        addToHistory(inputValue);
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
                const editChatContext = chatContextEnabled ? buildChatContextBlock() : undefined;
                await requestEdit(inputValue, currentProvider as 'claude' | 'openai' | 'gemini' | 'xai', selectedModel, requestId, webSearchEnabled, editChatContext);
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
                const createChatContext = chatContextEnabled ? buildChatContextBlock() : undefined;
                await submitCreate(request, enabledFilesForCreate, currentProvider, selectedModel, requestId, webSearchEnabled, createChatContext);
            } catch {
                // Error is handled by the useAICreate hook (createError state)
            }
            return;
        }

        // Ask mode request — route to multi-agent or standard ask
        if (mode === 'ask') {
            if (isMultiAgent) {
                // Multi-agent request (xAI Responses API)
                const filesToAttach = attachedFiles.length > 0 ? [...attachedFiles] : undefined;
                const question = inputValue;
                setInputValue('');
                setAttachedFiles([]);
                await submitMultiAgent(
                    question,
                    selectedModel,
                    multiAgentTools.map(t => ({ type: t })),
                    reasoningEffort,
                    filesToAttach,
                );
            } else {
                // Standard ask (chat completions)
                const filesToAttach = attachedFiles.length > 0 ? [...attachedFiles] : undefined;
                const question = inputValue;
                setInputValue('');
                setAttachedFiles([]);
                await submitAsk(question, currentProvider, selectedModel, filesToAttach, webSearchEnabled);
            }
        }
    }, [mode, selectedModel, getProviderForModel, inputValue, requestEdit, submitAsk, submitMultiAgent, submitCreate, setInputValue, attachedFiles, setAttachedFiles, dismissCreateProgress, webSearchEnabled, isMultiAgent, multiAgentTools, reasoningEffort, chatContextEnabled, buildChatContextBlock, addToHistory]);

    const handleCancelRequest = useCallback(async () => {
        if (isMultiAgentLoading) {
            await cancelMultiAgent();
            return;
        }

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
    }, [isMultiAgentLoading, isAskLoading, isEditLoading, isCreateLoading, cancelMultiAgent, cancelAsk, cancelCreate, resetEditWebSearch]);

    const handleClearChatConfirm = useCallback(() => {
        clearAsk();
        clearMultiAgent();
        dismissCreateProgress();
        setCreateQuery(null);
        setAttachedFiles([]);
        setWebSearchEnabled(hasSerperKey);
        setClearConfirmOpen(false);
    }, [clearAsk, clearMultiAgent, dismissCreateProgress, setAttachedFiles]);

    if (!open) return null;

    const hasProviders = models.length > 0 || isLoadingModels;
    const hasActiveRequest = isAskLoading || isEditLoading || isCreateLoading || isMultiAgentLoading;

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
                    <Tooltip title="Search chat">
                        <span>
                            <IconButton
                                size="small"
                                onClick={() => {
                                    setChatSearchOpen(prev => {
                                        if (prev) setChatSearchQuery('');
                                        return !prev;
                                    });
                                }}
                                disabled={askMessages.length === 0 && multiAgentMessages.length === 0}
                            >
                                <SearchIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Export chat to new file">
                        <span>
                            <IconButton
                                size="small"
                                onClick={handleExportChatToFile}
                                disabled={askMessages.length === 0 && multiAgentMessages.length === 0}
                            >
                                <NoteAddIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <IconButton size="small" onClick={() => setClearConfirmOpen(true)} title="Clear chat">
                        <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </HeaderControls>
            </PanelHeader>

            {chatSearchOpen && (
                <ChatSearchBar>
                    <input
                        ref={chatSearchInputRef}
                        type="text"
                        placeholder="Search messages..."
                        value={chatSearchQuery}
                        onChange={e => setChatSearchQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                handleSearchNext();
                            }
                            if (e.key === 'Escape') {
                                setChatSearchOpen(false);
                                setChatSearchQuery('');
                            }
                        }}
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            fontSize: '0.875rem',
                            padding: '4px 8px',
                        }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {chatSearchMatches.length > 0
                            ? `${chatSearchIndex + 1} of ${chatSearchMatches.length}`
                            : chatSearchQuery.trim() ? 'No matches' : ''}
                    </Typography>
                    <IconButton
                        size="small"
                        disabled={chatSearchMatches.length === 0}
                        onClick={handleSearchPrev}
                    >
                        <KeyboardArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        size="small"
                        disabled={chatSearchMatches.length === 0}
                        onClick={handleSearchNext}
                    >
                        <KeyboardArrowDownIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => { setChatSearchOpen(false); setChatSearchQuery(''); }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </ChatSearchBar>
            )}

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
                        askMessages={isMultiAgent ? multiAgentMessages : askMessages}
                        greeting={greeting}
                        isAskLoading={isMultiAgent ? false : isAskLoading}
                        askPhase={isMultiAgent ? null : askPhase}
                        askWebSearchPhase={isMultiAgent ? null : askWebSearchPhase}
                        webSearchEnabled={isMultiAgent ? false : webSearchEnabled}
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
                        askError={isMultiAgent ? null : askError}
                        editModeError={editModeError}
                        isMultiAgentLoading={isMultiAgentLoading}
                        multiAgentPhase={multiAgentPhase}
                        multiAgentError={multiAgentError}
                        multiAgentAgentCount={reasoningEffort === 'low' ? 4 : 16}
                        multiAgentStreamState={multiAgentStreamState}
                        messagesEndRef={messagesEndRef}
                        onCreateFileFromMessage={handleCreateFileFromMessage}
                        chatSearchQuery={chatSearchQuery}
                        chatSearchMatchIndex={chatSearchIndex}
                        chatSearchMatches={chatSearchMatches}
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
                        isMultiAgent={isMultiAgent}
                        isMultiAgentLoading={isMultiAgentLoading}
                        multiAgentTools={multiAgentTools}
                        reasoningEffort={reasoningEffort}
                        onMultiAgentToolsChange={setMultiAgentTools}
                        onReasoningEffortChange={setReasoningEffort}
                        onModeChange={handleModeChange}
                        onModelChange={handleModelChange}
                        onAttachFromDisk={handleAttachFromDisk}
                        onToggleFileAttachment={onToggleFileAttachment}
                        onWebSearchToggle={handleWebSearchToggle}
                        chatContextEnabled={chatContextEnabled}
                        hasChatContext={askMessages.length + multiAgentMessages.length > 0}
                        onChatContextToggle={handleChatContextToggle}
                        onInputChange={handleInputChange}
                        onHistoryKeyDown={handleHistoryKeyDown}
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
