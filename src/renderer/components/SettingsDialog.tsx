import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    FormHelperText,
    Switch,
    FormControlLabel,
    Checkbox,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Modal,
    Backdrop,
    TextField,
    Button,
    styled,
} from '@mui/material';
import {
    CloseIcon,
    DragIndicatorIcon,
    ExpandMoreIcon,
    CheckCircleIcon,
    DeleteIcon,
    RefreshIcon,
} from './AppIcons';

import { useSettingsConfig } from '../hooks/useSettingsConfig';
import { useDraggableDialog } from '../hooks/useDraggableDialog';
import { useEditorDispatch } from '../contexts/EditorContext';
import { useAIProviderCacheContext } from '../contexts/AIProviderCacheContext';
import { IConfig, IFileReference } from '../types/global';
import { filterModelsForProvider } from '../../shared/modelFilters';
import { getDisplayName } from '../../shared/modelDisplay';

// Styled Components
const DialogContainer = styled(Box)(({ theme }) => ({
    position: 'absolute',
    zIndex: 1000,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    boxShadow: theme.shadows[8],
    minWidth: 500,
    maxWidth: 600,
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
}));

const DragHandle = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    cursor: 'move',
    backgroundColor: theme.palette.action.hover,
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:hover': {
        backgroundColor: theme.palette.action.selected,
    },
}));

const DialogContent = styled(Box)({
    flex: 1,
    overflowY: 'auto',
    padding: 16,
});

const SectionHeader = styled(Typography)(({ theme }) => ({
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: 12,
    marginTop: 16,
    '&:first-of-type': {
        marginTop: 0,
    },
}));


// Sub-component: AI Provider Section
interface AIProviderSectionProps {
    title: string;
    provider: 'xai' | 'claude' | 'openai' | 'gemini';
    config: IConfig | null;
    onModelToggle: (provider: 'xai' | 'claude' | 'openai' | 'gemini', modelId: string, enabled: boolean) => void;
    expanded: boolean;
    onToggle: () => void;
}

function AIProviderSection({ title, provider, config, onModelToggle, expanded, onToggle }: AIProviderSectionProps) {
    const providerConfig = config?.aiModels?.[provider];

    if (!providerConfig || Object.keys(providerConfig).length === 0) {
        return null; // No models configured for this provider
    }

    // Get all models for this provider, filtered by model name (aligned with API service filtering)
    const allModels = Object.entries(providerConfig).map(([modelId, modelConfig]) => ({
        id: modelId,
        enabled: modelConfig.enabled
    }));
    const models = filterModelsForProvider(provider, allModels);

    return (
        <Accordion
            expanded={expanded}
            onChange={onToggle}
            sx={{ mb: 1, '&:before': { display: 'none' } }}
            disableGutters
        >
            <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                    minHeight: 40,
                    '&.Mui-expanded': { minHeight: 40 },
                    '& .MuiAccordionSummary-content': { margin: '8px 0' },
                }}
            >
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 1 }}>
                <Box>
                    {models.map((model) => (
                        <FormControlLabel
                            key={model.id}
                            control={
                                <Checkbox
                                    checked={model.enabled}
                                    onChange={(e) => onModelToggle(provider, model.id, e.target.checked)}
                                    size="small"
                                />
                            }
                            label={getDisplayName(model.id)}
                            sx={{ display: 'block', mb: 0.5 }}
                        />
                    ))}
                </Box>
            </AccordionDetails>
        </Accordion>
    );
}

// Sub-component: API Key Input
interface APIKeyInputProps {
    provider: 'xai' | 'claude' | 'openai' | 'gemini' | 'serper';
    label: string;
    hasKey: boolean;
    value: string;
    providerStatus?: 'success' | 'error' | 'unchecked';
    isTesting: boolean;
    onChange: (value: string) => void;
    onSet: () => void;
    onClear: () => void;
    onTest: () => void;
}

function APIKeyInput({ provider, label, hasKey, value, providerStatus, isTesting, onChange, onSet, onClear, onTest }: APIKeyInputProps) {
    const showTestButton = provider !== 'serper';
    return (
        <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{label}</Typography>
                {hasKey && (
                    <Chip
                        icon={<CheckCircleIcon />}
                        label={providerStatus === 'success' ? 'Connected' : 'Set'}
                        size="small"
                        color={providerStatus === 'success' ? 'success' : providerStatus === 'error' ? 'error' : 'success'}
                        sx={{ height: 20, fontSize: 11 }}
                    />
                )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                    type="password"
                    size="small"
                    fullWidth
                    placeholder={hasKey ? '••••••••••••••••' : 'Enter API key'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={hasKey}
                    sx={{
                        '& .MuiInputBase-input': {
                            fontSize: 14,
                        },
                    }}
                />
                {hasKey ? (
                    <>
                        {showTestButton && (
                            <IconButton
                                size="small"
                                onClick={onTest}
                                disabled={isTesting}
                                title="Test connection"
                                sx={{
                                    color: 'text.secondary',
                                    animation: isTesting ? 'spin 1s linear infinite' : 'none',
                                    '@keyframes spin': {
                                        '0%': { transform: 'rotate(0deg)' },
                                        '100%': { transform: 'rotate(360deg)' },
                                    },
                                }}
                            >
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        )}
                        <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={onClear}
                            sx={{ minWidth: 90 }}
                        >
                            Clear
                        </Button>
                    </>
                ) : (
                    <Button
                        variant="contained"
                        size="small"
                        onClick={onSet}
                        disabled={!value.trim()}
                        sx={{ minWidth: 90 }}
                    >
                        Set
                    </Button>
                )}
            </Box>
        </Box>
    );
}

// Sub-component: Files Table
interface FilesTableProps {
    files: IFileReference[];
}

function FilesTable({ files }: FilesTableProps) {
    if (files.length === 0) {
        return (
            <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary', fontSize: 14 }}>
                No files
            </Box>
        );
    }

    return (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>File Name</TableCell>
                        <TableCell>Mode</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {files.map((file, index) => (
                        <TableRow key={index}>
                            <TableCell>{file.fileName}</TableCell>
                            <TableCell>
                                <Chip
                                    label={file.mode}
                                    size="small"
                                    color={file.mode === 'edit' ? 'primary' : 'default'}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

// Sub-component: Directories Table
interface DirectoriesTableProps {
    directories: string[];
}

function DirectoriesTable({ directories }: DirectoriesTableProps) {
    if (directories.length === 0) {
        return (
            <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary', fontSize: 14 }}>
                No directories
            </Box>
        );
    }

    return (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Directory Path</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {directories.map((dir, index) => (
                        <TableRow key={index}>
                            <TableCell>{dir}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

// Main Component
interface SettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
    const { dialogRef, position, isDragging, handleDragMouseDown } = useDraggableDialog(open);

    // Config management
    const { config, updateConfig, isSaving } = useSettingsConfig();

    // Provider statuses from app-level cache
    const {
        providerStatuses,
        refreshProviderStatuses: cacheRefreshStatuses,
        invalidateModelsForProvider,
    } = useAIProviderCacheContext();

    // Accordion expansion state for AI provider sections
    const [expandedSections, setExpandedSections] = useState<{
        xai: boolean;
        claude: boolean;
        openai: boolean;
        gemini: boolean;
    }>({
        xai: true,
        claude: true,
        openai: true,
        gemini: true,
    });

    // API Key management state
    const [apiKeyStatus, setApiKeyStatus] = useState<{
        xai: boolean;
        claude: boolean;
        openai: boolean;
        gemini: boolean;
        serper: boolean;
    }>({
        xai: false,
        claude: false,
        openai: false,
        gemini: false,
        serper: false,
    });

    const [apiKeyInputs, setApiKeyInputs] = useState<{
        xai: string;
        claude: string;
        openai: string;
        gemini: string;
        serper: string;
    }>({
        xai: '',
        claude: '',
        openai: '',
        gemini: '',
        serper: '',
    });

    // Testing state for individual providers
    const [testingProvider, setTestingProvider] = useState<string | null>(null);

    const dispatch = useEditorDispatch();

    // Refresh provider statuses via cache (updates all consumers reactively)
    const refreshProviderStatuses = useCallback(async () => {
        await cacheRefreshStatuses();
    }, [cacheRefreshStatuses]);

    // Load API key status when dialog opens
    useEffect(() => {
        if (open) {
            window.electronAPI.getApiKeyStatus().then(setApiKeyStatus);
        }
    }, [open]);

    // Keyboard handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (open) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [open, onClose]);

    // Handlers for each setting type
    const handleLineEndingChange = useCallback((value: 'CRLF' | 'LF') => {
        updateConfig({ defaultLineEnding: value });
    }, [updateConfig]);

    const handleSilentFileUpdatesToggle = useCallback((enabled: boolean) => {
        updateConfig({ silentFileUpdates: enabled });
    }, [updateConfig]);

    const handleModelToggle = useCallback((provider: 'xai' | 'claude' | 'openai' | 'gemini', modelId: string, enabled: boolean) => {
        const newAiModels = {
            ...config?.aiModels,
            [provider]: {
                ...config?.aiModels?.[provider],
                [modelId]: { enabled }
            }
        };
        updateConfig({ aiModels: newAiModels });
        // Keep EditorContext in sync so useAIChat can filter models reactively
        dispatch({ type: 'SET_CONFIG', payload: { ...config, aiModels: newAiModels } as IConfig });
    }, [config, updateConfig, dispatch]);

    const handleSectionToggle = useCallback((provider: 'xai' | 'claude' | 'openai' | 'gemini') => {
        setExpandedSections(prev => ({
            ...prev,
            [provider]: !prev[provider]
        }));
    }, []);

    // API Key handlers
    const handleSetApiKey = useCallback(async (provider: 'xai' | 'claude' | 'openai' | 'gemini' | 'serper') => {
        const key = apiKeyInputs[provider].trim();
        if (!key) {
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: 'API key cannot be empty',
                    severity: 'error',
                },
            });
            return;
        }

        const result = await window.electronAPI.setApiKey(provider, key);
        if (result.success) {
            setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
            setApiKeyStatus(prev => ({ ...prev, [provider]: true }));
            if (provider !== 'serper') {
                invalidateModelsForProvider(provider);
                await refreshProviderStatuses();
            }
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: `API key for ${provider} saved and connected successfully`,
                    severity: 'success',
                },
            });
        } else {
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: `Failed to save API key: ${result.error}`,
                    severity: 'error',
                },
            });
        }
    }, [apiKeyInputs, dispatch, refreshProviderStatuses, invalidateModelsForProvider]);

    const handleClearApiKey = useCallback(async (provider: 'xai' | 'claude' | 'openai' | 'gemini' | 'serper') => {
        const result = await window.electronAPI.deleteApiKey(provider);
        if (result.success) {
            setApiKeyStatus(prev => ({ ...prev, [provider]: false }));
            if (provider !== 'serper') {
                invalidateModelsForProvider(provider);
                await refreshProviderStatuses();
            }
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: `API key for ${provider} cleared`,
                    severity: 'success',
                },
            });
        } else {
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: `Failed to clear API key: ${result.error}`,
                    severity: 'error',
                },
            });
        }
    }, [dispatch, refreshProviderStatuses, invalidateModelsForProvider]);

    const handleTestProvider = useCallback(async (provider: 'xai' | 'claude' | 'openai' | 'gemini' | 'serper') => {
        setTestingProvider(provider);
        try {
            if (provider === 'serper') {
                // Test Serper by running a simple search
                const result = await window.electronAPI.webSearch('test', 1);
                dispatch({
                    type: 'SHOW_NOTIFICATION',
                    payload: {
                        message: result.success
                            ? 'Serper (Web Search) connection successful'
                            : `Serper connection failed: ${result.error || 'Unknown error'}`,
                        severity: result.success ? 'success' : 'error',
                    },
                });
            } else {
                const statuses = await cacheRefreshStatuses();
                const status = statuses[provider];
                if (status.enabled && status.status === 'success') {
                    dispatch({
                        type: 'SHOW_NOTIFICATION',
                        payload: {
                            message: `${provider} connection successful`,
                            severity: 'success',
                        },
                    });
                } else if (status.enabled && status.status === 'error') {
                    dispatch({
                        type: 'SHOW_NOTIFICATION',
                        payload: {
                            message: `${provider} connection failed — API key may be invalid or the service is unavailable`,
                            severity: 'error',
                        },
                    });
                }
            }
        } catch {
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: `Failed to test ${provider} connection`,
                    severity: 'error',
                },
            });
        } finally {
            setTestingProvider(null);
        }
    }, [dispatch, cacheRefreshStatuses]);

    if (!open) return null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            closeAfterTransition
            slots={{ backdrop: Backdrop }}
            slotProps={{
                backdrop: {
                    timeout: 500,
                    sx: { backgroundColor: 'rgba(0, 0, 0, 0.5)' }
                }
            }}
        >
            <DialogContainer
                ref={dialogRef}
                sx={{
                    left: position.x,
                    top: position.y,
                    cursor: isDragging ? 'grabbing' : 'default',
                }}
            >
            <DragHandle onMouseDown={handleDragMouseDown}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DragIndicatorIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="subtitle2" fontWeight={600}>
                        Settings {isSaving && '(Saving...)'}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DragHandle>

            <DialogContent>
                {/* Basic Settings Section */}
                <SectionHeader>Basic Settings</SectionHeader>

                {/* Line Ending Select */}
                <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Default Line Ending</InputLabel>
                    <Select
                        value={config?.defaultLineEnding || 'CRLF'}
                        label="Default Line Ending"
                        onChange={(e) => handleLineEndingChange(e.target.value as 'CRLF' | 'LF')}
                    >
                        <MenuItem value="CRLF">CRLF (Windows)</MenuItem>
                        <MenuItem value="LF">LF (Unix/Mac)</MenuItem>
                    </Select>
                    <FormHelperText>Line ending format for new files</FormHelperText>
                </FormControl>

                {/* Silent File Updates Toggle */}
                <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={config?.silentFileUpdates !== false}
                                onChange={(e) => handleSilentFileUpdatesToggle(e.target.checked)}
                                size="small"
                            />
                        }
                        label="Silent File Updates"
                    />
                    <FormHelperText>
                        When enabled, externally modified files are reloaded automatically in place. When disabled, you will be prompted before refreshing.
                    </FormHelperText>
                </FormControl>

                {/* API Keys Section */}
                <SectionHeader>AI API Keys</SectionHeader>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
                    API keys are stored securely using your system's credential storage.
                </Typography>

                <APIKeyInput
                    provider="xai"
                    label="xAI (Grok)"
                    hasKey={apiKeyStatus.xai}
                    value={apiKeyInputs.xai}
                    providerStatus={providerStatuses.xai.status}
                    isTesting={testingProvider === 'xai'}
                    onChange={(value) => setApiKeyInputs(prev => ({ ...prev, xai: value }))}
                    onSet={() => handleSetApiKey('xai')}
                    onClear={() => handleClearApiKey('xai')}
                    onTest={() => handleTestProvider('xai')}
                />

                <APIKeyInput
                    provider="claude"
                    label="Anthropic Claude"
                    hasKey={apiKeyStatus.claude}
                    value={apiKeyInputs.claude}
                    providerStatus={providerStatuses.claude.status}
                    isTesting={testingProvider === 'claude'}
                    onChange={(value) => setApiKeyInputs(prev => ({ ...prev, claude: value }))}
                    onSet={() => handleSetApiKey('claude')}
                    onClear={() => handleClearApiKey('claude')}
                    onTest={() => handleTestProvider('claude')}
                />

                <APIKeyInput
                    provider="openai"
                    label="OpenAI"
                    hasKey={apiKeyStatus.openai}
                    value={apiKeyInputs.openai}
                    providerStatus={providerStatuses.openai.status}
                    isTesting={testingProvider === 'openai'}
                    onChange={(value) => setApiKeyInputs(prev => ({ ...prev, openai: value }))}
                    onSet={() => handleSetApiKey('openai')}
                    onClear={() => handleClearApiKey('openai')}
                    onTest={() => handleTestProvider('openai')}
                />

                <APIKeyInput
                    provider="gemini"
                    label="Google Gemini"
                    hasKey={apiKeyStatus.gemini}
                    value={apiKeyInputs.gemini}
                    providerStatus={providerStatuses.gemini.status}
                    isTesting={testingProvider === 'gemini'}
                    onChange={(value) => setApiKeyInputs(prev => ({ ...prev, gemini: value }))}
                    onSet={() => handleSetApiKey('gemini')}
                    onClear={() => handleClearApiKey('gemini')}
                    onTest={() => handleTestProvider('gemini')}
                />

                <SectionHeader>Web Search</SectionHeader>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
                    Used by Plan and Tech Research modes to fetch real-world context during planning and research. Get a free key at <strong>serper.dev</strong>.
                </Typography>

                <APIKeyInput
                    provider="serper"
                    label="Serper (Web Search)"
                    hasKey={apiKeyStatus.serper}
                    value={apiKeyInputs.serper}
                    providerStatus={apiKeyStatus.serper ? 'success' : 'unchecked'}
                    isTesting={testingProvider === 'serper'}
                    onChange={(value) => setApiKeyInputs(prev => ({ ...prev, serper: value }))}
                    onSet={() => handleSetApiKey('serper')}
                    onClear={() => handleClearApiKey('serper')}
                    onTest={() => handleTestProvider('serper')}
                />

                {(providerStatuses.xai.enabled || providerStatuses.claude.enabled || providerStatuses.openai.enabled || providerStatuses.gemini.enabled) && (
                    <>
                        <SectionHeader>AI Models</SectionHeader>

                        {providerStatuses.xai.enabled && (
                            <AIProviderSection
                                title="xAI (Grok)"
                                provider="xai"
                                config={config}
                                onModelToggle={handleModelToggle}
                                expanded={expandedSections.xai}
                                onToggle={() => handleSectionToggle('xai')}
                            />
                        )}

                        {providerStatuses.claude.enabled && (
                            <AIProviderSection
                                title="Anthropic Claude"
                                provider="claude"
                                config={config}
                                onModelToggle={handleModelToggle}
                                expanded={expandedSections.claude}
                                onToggle={() => handleSectionToggle('claude')}
                            />
                        )}

                        {providerStatuses.openai.enabled && (
                            <AIProviderSection
                                title="OpenAI"
                                provider="openai"
                                config={config}
                                onModelToggle={handleModelToggle}
                                expanded={expandedSections.openai}
                                onToggle={() => handleSectionToggle('openai')}
                            />
                        )}

                        {providerStatuses.gemini.enabled && (
                            <AIProviderSection
                                title="Google Gemini"
                                provider="gemini"
                                config={config}
                                onModelToggle={handleModelToggle}
                                expanded={expandedSections.gemini}
                                onToggle={() => handleSectionToggle('gemini')}
                            />
                        )}
                    </>
                )}

                {/* Open Directories Table (Readonly) */}
                <SectionHeader>Open Directories</SectionHeader>
                <DirectoriesTable directories={config?.openDirectories || []} />

                {/* Recent Directories Table (Readonly) */}
                <SectionHeader>Recent Directories</SectionHeader>
                <DirectoriesTable directories={config?.recentDirectories || []} />

                {/* Recent Files Table (Readonly) */}
                <SectionHeader>Recent Files</SectionHeader>
                <FilesTable files={config?.recentFiles || []} />

                {/* Open Files Table (Readonly) */}
                <SectionHeader>Open Files</SectionHeader>
                <FilesTable files={config?.openFiles || []} />
            </DialogContent>
        </DialogContainer>
        </Modal>
    );
}
