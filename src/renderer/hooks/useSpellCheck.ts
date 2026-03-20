import { useState, useEffect, useCallback } from 'react';

export interface SpellCheckMenuState {
    open: boolean;
    x: number;
    y: number;
    misspelledWord: string;
    suggestions: string[];
}

const CLOSED_STATE: SpellCheckMenuState = {
    open: false,
    x: 0,
    y: 0,
    misspelledWord: '',
    suggestions: [],
};

export function useSpellCheck() {
    const [menuState, setMenuState] = useState<SpellCheckMenuState>(CLOSED_STATE);

    useEffect(() => {
        const cleanup = window.electronAPI.onSpellCheckContextMenu((data) => {
            if (data.misspelledWord) {
                setMenuState({
                    open: true,
                    x: data.x,
                    y: data.y,
                    misspelledWord: data.misspelledWord,
                    suggestions: data.dictionarySuggestions,
                });
            }
        });
        return cleanup;
    }, []);

    const handleReplace = useCallback(async (suggestion: string) => {
        await window.electronAPI.replaceMisspelling(suggestion);
        setMenuState(CLOSED_STATE);
    }, []);

    const handleAddToDictionary = useCallback(async () => {
        await window.electronAPI.addToDictionary(menuState.misspelledWord);
        setMenuState(CLOSED_STATE);
    }, [menuState.misspelledWord]);

    const handleClose = useCallback(() => {
        setMenuState(CLOSED_STATE);
    }, []);

    return {
        spellCheckMenu: menuState,
        onSpellReplace: handleReplace,
        onSpellAddToDictionary: handleAddToDictionary,
        onSpellMenuClose: handleClose,
    };
}
