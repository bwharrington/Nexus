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
    Tabs,
    Tab,
    Tooltip,
    SelectChangeEvent,
    Divider,
    styled,
} from '@mui/material';
import {
    CloseIcon,
    DragIndicatorIcon,
    ExpandMoreIcon,
    CheckCircleIcon,
    DeleteIcon,
    RefreshIcon,
    HelpCircleIcon,
} from './AppIcons';

import { useSettingsConfig } from '../hooks/useSettingsConfig';
import { useDraggableDialog } from '../hooks/useDraggableDialog';
import { useEditorDispatch } from '../contexts/EditorContext';
import { useAIProviderCacheContext } from '../contexts/AIProviderCacheContext';
import { IConfig, IFileReference } from '../types/global';
import { filterModelsForProvider } from '../../shared/modelFilters';
import { getDisplayName } from '../../shared/modelDisplay';

// Provider type covering all API key providers (AI + search)
type SettingsProvider = 'xai' | 'claude' | 'openai' | 'gemini' | 'serper';
type AISettingsProvider = 'xai' | 'claude' | 'openai' | 'gemini';

// Styled Components
const DialogContainer = styled(Box)(({ theme }) => ({
    position: 'absolute',
    zIndex: 1000,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    boxShadow: theme.shadows[8],
    width: 600,
    height: 900,
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
    overflowX: 'hidden',
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
    provider: AISettingsProvider;
    config: IConfig | null;
    onModelToggle: (provider: AISettingsProvider, modelId: string, enabled: boolean) => void;
    expanded: boolean;
    onToggle: () => void;
}

const AIProviderSection = React.memo(function AIProviderSection({ title, provider, config, onModelToggle, expanded, onToggle }: AIProviderSectionProps) {
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
});

// Sub-component: API Key Input
interface APIKeyInputProps {
    provider: SettingsProvider;
    label: string;
    hasKey: boolean;
    value: string;
    providerStatus?: 'success' | 'error' | 'unchecked';
    isTesting?: boolean;
    helpTooltip?: string;
    helpUrl?: string;
    onInputChange: (provider: SettingsProvider, value: string) => void;
    onSet: (provider: SettingsProvider) => void;
    onClear: (provider: SettingsProvider) => void;
    onTest?: (provider: SettingsProvider) => void;
}

const APIKeyInput = React.memo(function APIKeyInput({
    provider, label, hasKey, value, providerStatus, isTesting = false,
    helpTooltip, helpUrl, onInputChange, onSet, onClear, onTest,
}: APIKeyInputProps) {
    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => onInputChange(provider, e.target.value),
        [onInputChange, provider],
    );
    const handleSetClick = useCallback(() => onSet(provider), [onSet, provider]);
    const handleClearClick = useCallback(() => onClear(provider), [onClear, provider]);
    const handleTestClick = useCallback(() => onTest?.(provider), [onTest, provider]);
    const handleUrlClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (helpUrl) void window.electronAPI.openExternal(helpUrl);
    }, [helpUrl]);

    return (
        <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{label}</Typography>
                {helpTooltip && (
                    <Tooltip
                        arrow
                        placement="right"
                        componentsProps={{ tooltip: { sx: { pointerEvents: 'auto' } } }}
                        title={
                            <Box>
                                <Typography sx={{ fontSize: 11 }}>{helpTooltip}</Typography>
                                {helpUrl && (
                                    <Typography
                                        sx={{
                                            fontSize: 11,
                                            color: 'rgba(255,255,255,0.9)',
                                            cursor: 'pointer',
                                            textDecoration: 'underline',
                                            textDecorationColor: 'rgba(255,255,255,0.4)',
                                            mt: 0.5,
                                            '&:hover': { color: '#ffffff', textDecorationColor: 'rgba(255,255,255,0.8)' },
                                        }}
                                        onClick={handleUrlClick}
                                    >
                                        {helpUrl}
                                    </Typography>
                                )}
                            </Box>
                        }
                    >
                        <IconButton
                            size="small"
                            aria-label={`Get API key for ${label}`}
                            sx={{ p: 0.25, color: 'text.disabled' }}
                            onClick={handleUrlClick}
                        >
                            <HelpCircleIcon size={14} />
                        </IconButton>
                    </Tooltip>
                )}
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
                    onChange={handleChange}
                    disabled={hasKey}
                    sx={{
                        '& .MuiInputBase-input': {
                            fontSize: 14,
                        },
                    }}
                />
                {hasKey ? (
                    <>
                        {onTest && (
                            <IconButton
                                size="small"
                                onClick={handleTestClick}
                                disabled={isTesting}
                                aria-label="Test connection"
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
                            onClick={handleClearClick}
                            sx={{ minWidth: 90 }}
                        >
                            Clear
                        </Button>
                    </>
                ) : (
                    <Button
                        variant="contained"
                        size="small"
                        onClick={handleSetClick}
                        disabled={!value.trim()}
                        sx={{ minWidth: 90 }}
                    >
                        Set
                    </Button>
                )}
            </Box>
        </Box>
    );
});

// Sub-component: Files Table
interface FilesTableProps {
    files: IFileReference[];
}

const FilesTable = React.memo(function FilesTable({ files }: FilesTableProps) {
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
});

// Sub-component: Directories Table
interface DirectoriesTableProps {
    directories: string[];
}

const DirectoriesTable = React.memo(function DirectoriesTable({ directories }: DirectoriesTableProps) {
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
});

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
        fetchModels: cacheFetchModels,
    } = useAIProviderCacheContext();

    // Active settings tab (0=Basic, 1=AI, 2=Web Search, 3=Files)
    const [activeTab, setActiveTab] = useState(0);

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
    const [apiKeyStatus, setApiKeyStatus] = useState<Record<SettingsProvider, boolean>>({
        xai: false,
        claude: false,
        openai: false,
        gemini: false,
        serper: false,
    });

    const [apiKeyInputs, setApiKeyInputs] = useState<Record<SettingsProvider, string>>({
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

    // Load API key status when dialog opens; reset to Basic tab
    useEffect(() => {
        if (open) {
            window.electronAPI.getApiKeyStatus().then(setApiKeyStatus);
            setActiveTab(0);
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

    const handleModelToggle = useCallback((provider: AISettingsProvider, modelId: string, enabled: boolean) => {
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

    const handleSectionToggle = useCallback((provider: AISettingsProvider) => {
        setExpandedSections(prev => ({
            ...prev,
            [provider]: !prev[provider]
        }));
    }, []);

    // API Key handlers
    const handleSetApiKey = useCallback(async (provider: SettingsProvider) => {
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

                // Sync fetched models into config so the Settings model toggles populate
                try {
                    const models = await cacheFetchModels(provider);
                    const existingProviderConfig = config?.aiModels?.[provider] ?? {};
                    const newProviderConfig: Record<string, { enabled: boolean }> = {};
                    for (const m of models) {
                        newProviderConfig[m.id] = existingProviderConfig[m.id] ?? { enabled: true };
                    }
                    const newAiModels = { ...config?.aiModels, [provider]: newProviderConfig };
                    updateConfig({ aiModels: newAiModels });
                    dispatch({ type: 'SET_CONFIG', payload: { ...config, aiModels: newAiModels } as IConfig });
                } catch {
                    // Model sync is best-effort; key was saved successfully regardless
                }
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
    }, [apiKeyInputs, dispatch, refreshProviderStatuses, invalidateModelsForProvider, cacheFetchModels, config, updateConfig]);

    const handleClearApiKey = useCallback(async (provider: SettingsProvider) => {
        const result = await window.electronAPI.deleteApiKey(provider);
        if (result.success) {
            setApiKeyStatus(prev => ({ ...prev, [provider]: false }));

            if (provider !== 'serper') {
                invalidateModelsForProvider(provider);
                await refreshProviderStatuses();

                // Remove this provider's models from config
                if (config?.aiModels?.[provider]) {
                    const newAiModels = { ...config.aiModels };
                    delete newAiModels[provider];
                    updateConfig({ aiModels: newAiModels });
                    dispatch({ type: 'SET_CONFIG', payload: { ...config, aiModels: newAiModels } as IConfig });
                }
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
    }, [dispatch, refreshProviderStatuses, invalidateModelsForProvider, config, updateConfig]);

    const handleTestProvider = useCallback(async (provider: SettingsProvider) => {
        if (provider === 'serper') return;
        setTestingProvider(provider);
        try {
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

    // Stable event handlers for JSX — avoids inline lambdas in render
    const tabNames = ['Basic', 'AI', 'Web Search', 'Files'];
    const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
        console.log(`[Settings] Tab changed to: ${tabNames[newValue]}`);
        setActiveTab(newValue);
    }, []);
    const handleApiKeyInputChange = useCallback((provider: SettingsProvider, value: string) => {
        setApiKeyInputs(prev => ({ ...prev, [provider]: value }));
    }, []);
    const handleLineEndingSelect = useCallback((e: SelectChangeEvent) => {
        handleLineEndingChange(e.target.value as 'CRLF' | 'LF');
    }, [handleLineEndingChange]);
    const handleSilentToggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleSilentFileUpdatesToggle(e.target.checked);
    }, [handleSilentFileUpdatesToggle]);
    const handleLogLevelSelect = useCallback((e: SelectChangeEvent) => {
        const value = e.target.value;
        updateConfig({ logLevel: value });
        void window.electronAPI.setLogLevel(value);
    }, [updateConfig]);
    const handleSerperLinkClick = useCallback(() => {
        void window.electronAPI.openExternal('https://serper.dev');
    }, []);
    const handleXaiToggle = useCallback(() => handleSectionToggle('xai'), [handleSectionToggle]);
    const handleClaudeToggle = useCallback(() => handleSectionToggle('claude'), [handleSectionToggle]);
    const handleOpenAiToggle = useCallback(() => handleSectionToggle('openai'), [handleSectionToggle]);
    const handleGeminiToggle = useCallback(() => handleSectionToggle('gemini'), [handleSectionToggle]);

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
                <IconButton size="small" onClick={onClose} aria-label="Close settings">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DragHandle>

            <DialogContent>
                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    sx={{ minHeight: 36, mb: 2, borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab label="Basic" sx={{ minHeight: 36, textTransform: 'none', fontSize: 13 }} />
                    <Tab label="AI" sx={{ minHeight: 36, textTransform: 'none', fontSize: 13 }} />
                    <Tab label="Web Search" sx={{ minHeight: 36, textTransform: 'none', fontSize: 13 }} />
                    <Tab label="Files" sx={{ minHeight: 36, textTransform: 'none', fontSize: 13 }} />
                </Tabs>

                {/* Tab 0: Basic */}
                {activeTab === 0 && (
                    <>
                        <Box sx={{ py: 1 }}>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Default Line Ending</InputLabel>
                                <Select
                                    value={config?.defaultLineEnding || 'CRLF'}
                                    label="Default Line Ending"
                                    onChange={handleLineEndingSelect}
                                >
                                    <MenuItem value="CRLF">CRLF (Windows)</MenuItem>
                                    <MenuItem value="LF">LF (Unix/Mac)</MenuItem>
                                </Select>
                                <FormHelperText>Line ending format for new files</FormHelperText>
                            </FormControl>
                        </Box>

                        <Divider />

                        <Box sx={{ py: 1 }}>
                            <FormControl size="small" fullWidth>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={config?.silentFileUpdates !== false}
                                            onChange={handleSilentToggle}
                                            size="small"
                                        />
                                    }
                                    label="Silent File Updates"
                                />
                                <FormHelperText>
                                    When enabled, externally modified files are reloaded automatically in place. When disabled, you will be prompted before refreshing.
                                </FormHelperText>
                            </FormControl>
                        </Box>

                        <Divider />

                        <Box sx={{ py: 1 }}>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Log Level</InputLabel>
                                <Select
                                    value={config?.logLevel || 'info'}
                                    label="Log Level"
                                    onChange={handleLogLevelSelect}
                                >
                                    <MenuItem value="debug">Debug (Most Verbose)</MenuItem>
                                    <MenuItem value="info">Info</MenuItem>
                                    <MenuItem value="warn">Warn</MenuItem>
                                    <MenuItem value="error">Error Only</MenuItem>
                                    <MenuItem value="off">Off</MenuItem>
                                </Select>
                                <FormHelperText>Controls which messages are written to the log file</FormHelperText>
                            </FormControl>
                        </Box>
                    </>
                )}

                {/* Tab 1: AI */}
                {activeTab === 1 && (
                    <>
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
                            helpTooltip="Get an xAI API key at console.x.ai"
                            helpUrl="https://console.x.ai/"
                            onInputChange={handleApiKeyInputChange}
                            onSet={handleSetApiKey}
                            onClear={handleClearApiKey}
                            onTest={handleTestProvider}
                        />

                        <APIKeyInput
                            provider="claude"
                            label="Anthropic Claude"
                            hasKey={apiKeyStatus.claude}
                            value={apiKeyInputs.claude}
                            providerStatus={providerStatuses.claude.status}
                            isTesting={testingProvider === 'claude'}
                            helpTooltip="Get a Claude API key at console.anthropic.com"
                            helpUrl="https://console.anthropic.com/"
                            onInputChange={handleApiKeyInputChange}
                            onSet={handleSetApiKey}
                            onClear={handleClearApiKey}
                            onTest={handleTestProvider}
                        />

                        <APIKeyInput
                            provider="openai"
                            label="OpenAI"
                            hasKey={apiKeyStatus.openai}
                            value={apiKeyInputs.openai}
                            providerStatus={providerStatuses.openai.status}
                            isTesting={testingProvider === 'openai'}
                            helpTooltip="Get an OpenAI API key at platform.openai.com/api-keys"
                            helpUrl="https://platform.openai.com/api-keys"
                            onInputChange={handleApiKeyInputChange}
                            onSet={handleSetApiKey}
                            onClear={handleClearApiKey}
                            onTest={handleTestProvider}
                        />

                        <APIKeyInput
                            provider="gemini"
                            label="Google Gemini"
                            hasKey={apiKeyStatus.gemini}
                            value={apiKeyInputs.gemini}
                            providerStatus={providerStatuses.gemini.status}
                            isTesting={testingProvider === 'gemini'}
                            helpTooltip="Get a Gemini API key at aistudio.google.com"
                            helpUrl="https://aistudio.google.com/app/apikey"
                            onInputChange={handleApiKeyInputChange}
                            onSet={handleSetApiKey}
                            onClear={handleClearApiKey}
                            onTest={handleTestProvider}
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
                                        onToggle={handleXaiToggle}
                                    />
                                )}

                                {providerStatuses.claude.enabled && (
                                    <AIProviderSection
                                        title="Anthropic Claude"
                                        provider="claude"
                                        config={config}
                                        onModelToggle={handleModelToggle}
                                        expanded={expandedSections.claude}
                                        onToggle={handleClaudeToggle}
                                    />
                                )}

                                {providerStatuses.openai.enabled && (
                                    <AIProviderSection
                                        title="OpenAI"
                                        provider="openai"
                                        config={config}
                                        onModelToggle={handleModelToggle}
                                        expanded={expandedSections.openai}
                                        onToggle={handleOpenAiToggle}
                                    />
                                )}

                                {providerStatuses.gemini.enabled && (
                                    <AIProviderSection
                                        title="Google Gemini"
                                        provider="gemini"
                                        config={config}
                                        onModelToggle={handleModelToggle}
                                        expanded={expandedSections.gemini}
                                        onToggle={handleGeminiToggle}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}

                {/* Tab 2: Web Search */}
                {activeTab === 2 && (
                    <>
                        <SectionHeader>Web Search API Key</SectionHeader>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
                            Serper provides real-time web search results. An API key enables AI modes to search the web for current context when generating content.
                            Get a free key at{' '}
                            <Typography
                                component="span"
                                sx={{ fontSize: 12, color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={handleSerperLinkClick}
                            >
                                serper.dev
                            </Typography>.
                        </Typography>

                        <APIKeyInput
                            provider="serper"
                            label="Serper (Web Search)"
                            hasKey={apiKeyStatus.serper}
                            value={apiKeyInputs.serper}
                            helpTooltip="Sign up and get a free API key at serper.dev"
                            helpUrl="https://serper.dev"
                            onInputChange={handleApiKeyInputChange}
                            onSet={handleSetApiKey}
                            onClear={handleClearApiKey}
                        />
                    </>
                )}

                {/* Tab 3: Files */}
                {activeTab === 3 && (
                    <>
                        <SectionHeader>Open Directories</SectionHeader>
                        <DirectoriesTable directories={config?.openDirectories || []} />

                        <SectionHeader>Recent Directories</SectionHeader>
                        <DirectoriesTable directories={config?.recentDirectories || []} />

                        <SectionHeader>Recent Files</SectionHeader>
                        <FilesTable files={config?.recentFiles || []} />

                        <SectionHeader>Open Files</SectionHeader>
                        <FilesTable files={config?.openFiles || []} />
                    </>
                )}
            </DialogContent>
        </DialogContainer>
        </Modal>
    );
}
