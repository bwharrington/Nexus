import React, { useCallback, useState } from 'react';
import { Box, TextField, Button, IconButton, CircularProgress, styled, Select, MenuItem, FormControl, ListSubheader, Divider } from '@mui/material';
import { AttachFileIcon, SendIcon, EditIcon, CreateIcon } from './AppIcons';
import { AttachFilePopover } from './AttachFilePopover';
import type { AttachedFile } from './FileAttachmentsList';
import type { AIChatMode } from '../types/global';
import type { IFile } from '../types';
import type { AIModelOption } from '../hooks/useAIChat';
import { isProviderRestrictedFromMode } from '../aiProviderModeRestrictions';

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
});

const LeftControls = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexWrap: 'wrap',
});

const RightControls = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    flexShrink: 0,
});

const COMPACT_SELECT_SX = { fontSize: '0.75rem', py: 0.5 };


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
    onAttachFromDisk: () => void;
    onToggleFileAttachment: (file: IFile) => void;
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
    onModeChange,
    onModelChange,
    onAttachFromDisk,
    onToggleFileAttachment,
    onInputChange,
    onSend,
    onCancel,
    onClose,
}: MessageInputProps) {
    const [attachAnchorEl, setAttachAnchorEl] = useState<HTMLElement | null>(null);

    // Debug logging for input state
    React.useEffect(() => {
        console.log('[MessageInput] State:', {
            hasActiveRequest,
            hasDiffTab,
            inputDisabled: hasActiveRequest || hasDiffTab,
            inputValue: `"${inputValue}"`,
            mode,
        });
    });

    const handleFocus = useCallback(() => {
        console.log('[MessageInput] TextField focused');
    }, []);

    const handleBlur = useCallback(() => {
        console.log('[MessageInput] TextField blurred');
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [onSend, onClose]);

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
                    mode === 'ask'
                        ? "Ask anything... (each question is independent)"
                        : mode === 'edit'
                            ? "Describe the changes you want... (e.g., 'Add a table of contents')"
                            : mode === 'create'
                                ? "Describe what you want to create... (e.g., 'A blog post about React hooks', 'A project README')"
                                : "Type a message... (Enter to send, Shift+Enter for newline)"
                }
                value={inputValue}
                onChange={(e) => {
                    console.log('[MessageInput] onChange:', JSON.stringify(e.target.value));
                    onInputChange(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
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
                        {(isAskLoading || isEditLoading || isCreateLoading) ? (
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
        </InputContainer>
    );
}
