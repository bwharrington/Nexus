import { useState, useEffect, useCallback, useRef } from 'react';
import { useAIProviderCacheContext } from '../contexts/AIProviderCacheContext';
import type { AIModelsConfig } from '../types/global';

export type AIProvider = 'xai' | 'claude' | 'openai' | 'gemini';

export interface AIMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    attachments?: AttachmentData[];
}

export interface AttachmentData {
    name: string;
    type: 'image' | 'text';
    mimeType?: string;
    data: string;
}

export interface AIModelOption {
    id: string;
    displayName: string;
    provider: AIProvider;
}

export interface AIProviderStatus {
    enabled: boolean;
    status: 'success' | 'error' | 'unchecked';
}

export interface AIProviderStatuses {
    xai: AIProviderStatus;
    claude: AIProviderStatus;
    openai: AIProviderStatus;
    gemini: AIProviderStatus;
}

const ALL_PROVIDERS: AIProvider[] = ['claude', 'openai', 'gemini', 'xai'];

export interface UseAIChatOptions {
    savedModel?: string;
    aiModels?: AIModelsConfig;
}

export function useAIChat(options?: UseAIChatOptions) {
    const {
        providerStatuses,
        isStatusesLoaded,
        fetchModels: cacheFetchModels,
        getCachedModels,
    } = useAIProviderCacheContext();

    const aiModels = options?.aiModels;

    const savedModelRef = useRef(options?.savedModel);
    const currentSelectedModelRef = useRef('');

    // Model state — flat list across all enabled providers
    const [models, setModels] = useState<AIModelOption[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Shared input state across all modes
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        currentSelectedModelRef.current = selectedModel;
    }, [selectedModel]);

    // Fetch models from all enabled providers when statuses are loaded
    useEffect(() => {
        if (!isStatusesLoaded) return;

        let cancelled = false;

        const pickModelSelection = (allModels: AIModelOption[]) => {
            if (allModels.length === 0) return;
            const saved = savedModelRef.current;
            const current = currentSelectedModelRef.current;
            const match =
                (saved && allModels.find(m => m.id === saved)) ||
                (current && allModels.find(m => m.id === current)) ||
                allModels[0];
            setSelectedModel(match.id);
            savedModelRef.current = undefined;
        };

        const filterByEnabledConfig = (models: AIModelOption[]): AIModelOption[] => {
            if (!aiModels) return models;
            return models.filter(m => {
                const providerConfig = aiModels[m.provider];
                if (!providerConfig) return true;
                const modelConfig = providerConfig[m.id];
                // If config entry exists, respect it; if absent, default to enabled
                return modelConfig === undefined || modelConfig.enabled !== false;
            });
        };

        const loadAllModels = async () => {
            const enabledProviders = ALL_PROVIDERS.filter(p => providerStatuses[p]?.enabled);
            if (enabledProviders.length === 0) return;

            // Try cached models first
            let allCached = true;
            const cachedAll: AIModelOption[] = [];
            for (const p of enabledProviders) {
                const cached = getCachedModels(p);
                if (cached && cached.length > 0) {
                    cachedAll.push(...cached.map(m => ({ ...m, provider: p })));
                } else {
                    allCached = false;
                    break;
                }
            }

            if (allCached && cachedAll.length > 0) {
                const filtered = filterByEnabledConfig(cachedAll);
                setModels(filtered);
                pickModelSelection(filtered);
                return;
            }

            setIsLoadingModels(true);

            try {
                const results = await Promise.all(
                    enabledProviders.map(async (p) => {
                        try {
                            const fetched = await cacheFetchModels(p);
                            return fetched.map(m => ({ ...m, provider: p }));
                        } catch {
                            return [] as AIModelOption[];
                        }
                    })
                );
                if (cancelled) return;

                const allModels = filterByEnabledConfig(results.flat());
                setModels(allModels);

                if (allModels.length > 0) {
                    pickModelSelection(allModels);
                }
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to fetch models:', err);
            } finally {
                if (!cancelled) {
                    setIsLoadingModels(false);
                }
            }
        };

        loadAllModels();

        return () => { cancelled = true; };
    }, [isStatusesLoaded, providerStatuses, aiModels, cacheFetchModels, getCachedModels]);

    // Derive the provider for the currently selected model
    const getProviderForModel = useCallback((modelId: string): AIProvider | undefined => {
        const model = models.find(m => m.id === modelId);
        return model?.provider;
    }, [models]);

    return {
        // Provider statuses (for checking enabled state)
        providerStatuses,
        isStatusesLoaded,
        getProviderForModel,

        // Models
        models,
        selectedModel,
        setSelectedModel,
        isLoadingModels,

        // Shared input state
        inputValue,
        setInputValue,
    };
}
