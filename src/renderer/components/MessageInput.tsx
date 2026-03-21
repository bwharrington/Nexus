import React, { useCallback, useState } from 'react';
import { Box, TextField, Button, IconButton, CircularProgress, styled, Select, MenuItem, FormControl, ListSubheader, Divider, Tooltip, Chip } from '@mui/material';
import { AttachFileIcon, SendIcon, EditIcon, CreateIcon, GlobeIcon, SearchIcon, CodeIcon } from './AppIcons';
import { AttachFilePopover } from './AttachFilePopover';
import { SpellCheckContextMenu } from './SpellCheckContextMenu';
import type { AttachedFile } from './FileAttachmentsList';
import type { AIChatMode } from '../types/global';
import type { IFile } from '../types';
import type { AIModelOption } from '../hooks/useAIChat';
import { isProviderRestrictedFromMode } from '../aiProviderModeRestrictions';
import { useSpellCheck } from '../hooks/useSpellCheck';

const InputContainer = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 12px',
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
}));

const ControlsRow = styled(Box)({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    overflow: 'visible',
});

const LeftControls = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexWrap: 'nowrap',
    overflow: 'visible',
});

const RightControls = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    flexShrink: 0,
});

const COMPACT_SELECT_SX = { fontSize: '0.75rem', py: 0.5 };

const MultiAgentToolsRow = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
});

interface MessageInputProps {
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    inputValue: string;
    mode: AIChatMode;
    models: AIModelOption[];
    selectedModel: string;
    isLoadingModels: boolean;
    isAskLoading: boolean;
    isEditLoading: boolean;
    isCreateLoading: boolean;
    hasDiffTab: boolean;
    hasActiveRequest: boolean;
    openFiles: IFile[];
    attachedFiles: AttachedFile[];
    onModeChange: (mode: AIChatMode) => void;
    onModelChange: (model: string) => void;
    hasSerperKey?: boolean;
    webSearchEnabled?: boolean;
    isMultiAgent?: boolean;
    isMultiAgentLoading?: boolean;
    multiAgentTools?: string[];
    reasoningEffort?: 'low' | 'high';
    onMultiAgentToolsChange?: (tools: string[]) => void;
    onReasoningEffortChange?: (effort: 'low' | 'high') => void;
    onAttachFromDisk: () => void;
    onToggleFileAttachment: (file: IFile) => void;
    onWebSearchToggle?: () => void;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onCancel: () => void;
    onClose: () => void;
}

export function MessageInput({
    inputRef,
    inputValue,
    mode,
    models,
    selectedModel,
    isLoadingModels,
    isAskLoading,
    isEditLoading,
    isCreateLoading,
    hasDiffTab,
    hasActiveRequest,
    openFiles,
    attachedFiles,
    hasSerperKey,
    webSearchEnabled,
    isMultiAgent,
    isMultiAgentLoading,
    multiAgentTools = [],
    reasoningEffort = 'low',
    onMultiAgentToolsChange,
    onReasoningEffortChange,
    onModeChange,
    onModelChange,
    onAttachFromDisk,
    onToggleFileAttachment,
    onWebSearchToggle,
    onInputChange,
    onSend,
    onCancel,
    onClose,
}: MessageInputProps) {
    const [attachAnchorEl, setAttachAnchorEl] = useState<HTMLElement | null>(null);
    const { spellCheckMenu, onSpellReplace, onSpellAddToDictionary, onSpellMenuClose } = useSpellCheck();

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [onSend, onClose]);

    const handleToggleMultiAgentTool = useCallback((tool: string) => {
        if (!onMultiAgentToolsChange) return;
        const next = multiAgentTools.includes(tool)
            ? multiAgentTools.filter(t => t !== tool)
            : [...multiAgentTools, tool];
        onMultiAgentToolsChange(next);
    }, [multiAgentTools, onMultiAgentToolsChange]);

    const handleAttachClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
        setAttachAnchorEl(e.currentTarget);
    }, []);

    const handleAttachPopoverClose = useCallback(() => {
        setAttachAnchorEl(null);
    }, []);

    // Filter models based on provider mode restrictions for the current mode
    const availableModels = React.useMemo(() =>
        models.filter(m => !isProviderRestrictedFromMode(m.provider, mode)),
        [models, mode]
    );

    // Group models by provider for the dropdown
    const groupedModelItems = React.useMemo(() => {
        const providerLabels: Record<string, string> = {
            claude: 'Anthropic Claude',
            openai: 'OpenAI',
            gemini: 'Google Gemini',
            xai: 'xAI (Grok)',
        };

        const byProvider = new Map<string, AIModelOption[]>();
        for (const m of availableModels) {
            const list = byProvider.get(m.provider) || [];
            list.push(m);
            byProvider.set(m.provider, list);
        }

        const items: React.ReactNode[] = [];
        for (const [provider, providerModels] of byProvider) {
            if (byProvider.size > 1) {
                items.push(
                    <ListSubheader key={`header-${provider}`} sx={{ fontSize: '0.7rem', lineHeight: '28px' }}>
                        {providerLabels[provider] ?? provider}
                    </ListSubheader>
                );
                items.push(<Divider key={`divider-${provider}`} />);
            }
            for (const m of providerModels) {
                items.push(
                    <MenuItem key={m.id} value={m.id} sx={{ fontSize: '0.75rem' }}>
                        {m.displayName}
                    </MenuItem>
                );
            }
        }
        return items;
    }, [availableModels]);

    return (
        <InputContainer>
            <TextField
                inputRef={inputRef}
                multiline
                maxRows={4}
                size="small"
                placeholder={
                    isMultiAgent
                        ? "Ask the multi-agent team anything... (agents collaborate to research your question)"
                        : mode === 'ask'
                        ? (webSearchEnabled ? "Ask anything... (web search enabled)" : "Ask anything... (each question is independent)")
                        : mode === 'edit'
                            ? (webSearchEnabled ? "Describe changes... (web search enabled)" : "Describe the changes you want... (e.g., 'Add a table of contents')")
                            : mode === 'create'
                                ? (webSearchEnabled ? "Describe what to create... (web search enabled)" : "Describe what you want to create... (e.g., 'A blog post about React hooks', 'A project README')")
                                : "Type a message... (Enter to send, Shift+Enter for newline)"
                }
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={hasActiveRequest || hasDiffTab}
                fullWidth
                slotProps={{
                    input: {
                        sx: { fontSize: '0.875rem' }
                    }
                }}
            />
            <ControlsRow>
                <LeftControls>
                    <FormControl size="small" sx={{ minWidth: 80, flexShrink: 0 }}>
                        <Select
                            value={mode}
                            onChange={(e) => onModeChange(e.target.value as AIChatMode)}
                            disabled={hasDiffTab || hasActiveRequest}
                            sx={COMPACT_SELECT_SX}
                        >
                            <MenuItem value="ask" sx={{ fontSize: '0.75rem' }}>Ask</MenuItem>
                            <MenuItem value="edit" sx={{ fontSize: '0.75rem' }}>Edit</MenuItem>
                            <MenuItem value="create" sx={{ fontSize: '0.75rem' }}>Create</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 140, maxWidth: 220, flexShrink: 1 }}>
                        <Select
                            value={selectedModel}
                            onChange={(e) => onModelChange(e.target.value)}
                            disabled={isLoadingModels || hasActiveRequest}
                            sx={COMPACT_SELECT_SX}
                            displayEmpty
                            renderValue={(value) => {
                                if (!value) return isLoadingModels ? 'Loading...' : 'Select model';
                                const model = availableModels.find(m => m.id === value) ?? models.find(m => m.id === value);
                                return model?.displayName ?? value;
                            }}
                        >
                            {groupedModelItems}
                        </Select>
                    </FormControl>

                    <IconButton
                        size="small"
                        onClick={handleAttachClick}
                        disabled={hasActiveRequest}
                        title="Attach files"
                        sx={{ color: 'text.secondary' }}
                    >
                        <AttachFileIcon fontSize="small" />
                    </IconButton>

                    {isMultiAgent ? (
                        <MultiAgentToolsRow>
                            <Tooltip title="Web search — agents search the web for information">
                                <Chip
                                    icon={<GlobeIcon size={14} />}
                                    label="Web"
                                    size="small"
                                    variant={multiAgentTools.includes('web_search') ? 'filled' : 'outlined'}
                                    color={multiAgentTools.includes('web_search') ? 'primary' : 'default'}
                                    onClick={() => handleToggleMultiAgentTool('web_search')}
                                    disabled={hasActiveRequest}
                                    sx={{ height: 24, fontSize: '0.7rem' }}
                                />
                            </Tooltip>
                            <Tooltip title="X/Twitter search — agents search posts on X">
                                <Chip
                                    icon={<SearchIcon size={14} />}
                                    label="X"
                                    size="small"
                                    variant={multiAgentTools.includes('x_search') ? 'filled' : 'outlined'}
                                    color={multiAgentTools.includes('x_search') ? 'primary' : 'default'}
                                    onClick={() => handleToggleMultiAgentTool('x_search')}
                                    disabled={hasActiveRequest}
                                    sx={{ height: 24, fontSize: '0.7rem' }}
                                />
                            </Tooltip>
                            <Tooltip title="Code execution — agents can run code to analyze data">
                                <Chip
                                    icon={<CodeIcon size={14} />}
                                    label="Code"
                                    size="small"
                                    variant={multiAgentTools.includes('code_execution') ? 'filled' : 'outlined'}
                                    color={multiAgentTools.includes('code_execution') ? 'primary' : 'default'}
                                    onClick={() => handleToggleMultiAgentTool('code_execution')}
                                    disabled={hasActiveRequest}
                                    sx={{ height: 24, fontSize: '0.7rem' }}
                                />
                            </Tooltip>
                            <Tooltip title={reasoningEffort === 'low' ? '4 agents — faster, focused research' : '16 agents — deeper, comprehensive research'}>
                                <Chip
                                    label={reasoningEffort === 'low' ? '4 Agents' : '16 Agents'}
                                    size="small"
                                    variant="outlined"
                                    onClick={() => onReasoningEffortChange?.(reasoningEffort === 'low' ? 'high' : 'low')}
                                    disabled={hasActiveRequest}
                                    sx={{ height: 24, fontSize: '0.7rem' }}
                                />
                            </Tooltip>
                        </MultiAgentToolsRow>
                    ) : hasSerperKey ? (
                        <Tooltip title={
                            webSearchEnabled
                                ? "Web search on \u2014 click to disable"
                                : mode === 'edit'
                                    ? "Search the web for editing context"
                                    : mode === 'create'
                                        ? "Search the web for creation context"
                                        : "Include latest web information"
                        }>
                            <IconButton
                                size="small"
                                onClick={onWebSearchToggle}
                                disabled={hasActiveRequest}
                                sx={{ color: webSearchEnabled ? 'primary.main' : 'text.secondary' }}
                            >
                                <GlobeIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    ) : null}
                </LeftControls>
                <RightControls>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={onCancel}
                        disabled={!hasActiveRequest}
                        color="warning"
                        sx={{ minWidth: 'auto', px: 1.5, flexShrink: 0, fontSize: '0.75rem' }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={onSend}
                        disabled={!inputValue.trim() || hasActiveRequest || hasDiffTab}
                        color={mode === 'edit' ? 'success' : mode === 'create' ? 'secondary' : 'primary'}
                        sx={{ minWidth: 44, px: 1.5, flexShrink: 0 }}
                    >
                        {(isAskLoading || isEditLoading || isCreateLoading || isMultiAgentLoading) ? (
                            <CircularProgress size={18} color="inherit" />
                        ) : mode === 'edit' ? (
                            <EditIcon fontSize="small" />
                        ) : mode === 'create' ? (
                            <CreateIcon fontSize="small" />
                        ) : (
                            <SendIcon fontSize="small" />
                        )}
                    </Button>
                </RightControls>
            </ControlsRow>
            <AttachFilePopover
                anchorEl={attachAnchorEl}
                onClose={handleAttachPopoverClose}
                openFiles={openFiles}
                attachedFiles={attachedFiles}
                onAttachFromDisk={onAttachFromDisk}
                onToggleFileAttachment={onToggleFileAttachment}
            />
            <SpellCheckContextMenu
                menuState={spellCheckMenu}
                onReplace={onSpellReplace}
                onAddToDictionary={onSpellAddToDictionary}
                onClose={onSpellMenuClose}
            />
        </InputContainer>
    );
}
