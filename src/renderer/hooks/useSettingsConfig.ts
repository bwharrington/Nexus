import { useState, useCallback, useRef, useEffect } from 'react';
import { IConfig } from '../types/global';
import { useEditorState, useEditorDispatch } from '../contexts/EditorContext';

export function useSettingsConfig() {
    const state = useEditorState();
    const config = state.config;
    const [isSaving, setIsSaving] = useState(false);
    const dispatch = useEditorDispatch();
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Debounced save function
    const saveConfigDebounced = useCallback((newConfig: IConfig) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            setIsSaving(true);
            try {
                await window.electronAPI.saveConfig(newConfig);
            } catch (error) {
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
        const newConfig = { ...config, ...updates };
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
