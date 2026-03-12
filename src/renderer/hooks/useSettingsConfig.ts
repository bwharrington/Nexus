import { useState, useEffect, useCallback, useRef } from 'react';
import { IConfig } from '../types/global';
import { useEditorDispatch } from '../contexts/EditorContext';

export function useSettingsConfig() {
    const [config, setConfig] = useState<IConfig | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const dispatch = useEditorDispatch();
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load config on mount
    useEffect(() => {
        window.electronAPI.loadConfig().then(cfg => setConfig(cfg));
    }, []);

    // Debounced save function
    const saveConfigDebounced = useCallback((newConfig: IConfig) => {
        // Clear any pending save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Schedule new save after 500ms
        saveTimeoutRef.current = setTimeout(async () => {
            setIsSaving(true);
            try {
                await window.electronAPI.saveConfig(newConfig);
                // Success - no toast needed for auto-save
            } catch (error) {
                // Show error toast
                dispatch({
                    type: 'SHOW_NOTIFICATION',
                    payload: {
                        message: `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        severity: 'error',
                    },
                });
            } finally {
                setIsSaving(false);
            }
        }, 500);
    }, [dispatch]);

    // Update config (partial updates)
    const updateConfig = useCallback((updates: Partial<IConfig>) => {
        if (!config) return;

        const newConfig = { ...config, ...updates };
        setConfig(newConfig);
        dispatch({ type: 'SET_CONFIG', payload: newConfig });
        saveConfigDebounced(newConfig);
    }, [config, dispatch, saveConfigDebounced]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return { config, updateConfig, isSaving };
}
