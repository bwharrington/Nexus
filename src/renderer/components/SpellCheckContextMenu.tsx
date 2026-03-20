import React from 'react';
import { Menu, MenuItem, Typography, Divider, styled } from '@mui/material';
import { SpellCheckMenuState } from '../hooks/useSpellCheck';

interface SpellCheckContextMenuProps {
    menuState: SpellCheckMenuState;
    onReplace: (suggestion: string) => void;
    onAddToDictionary: () => void;
    onClose: () => void;
}

const MisspelledLabel = styled(Typography)(({ theme }) => ({
    padding: '4px 16px',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
    userSelect: 'none',
}));

export const SpellCheckContextMenu = React.memo(function SpellCheckContextMenu({
    menuState,
    onReplace,
    onAddToDictionary,
    onClose,
}: SpellCheckContextMenuProps) {
    return (
        <Menu
            open={menuState.open}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={
                menuState.open
                    ? { top: menuState.y, left: menuState.x }
                    : undefined
            }
        >
            <MisspelledLabel>"{menuState.misspelledWord}"</MisspelledLabel>
            <Divider />
            {menuState.suggestions.length > 0 ? (
                menuState.suggestions.map((suggestion) => (
                    <MenuItem
                        key={suggestion}
                        onClick={() => onReplace(suggestion)}
                        sx={{ fontSize: '0.875rem' }}
                    >
                        {suggestion}
                    </MenuItem>
                ))
            ) : (
                <MenuItem disabled sx={{ fontSize: '0.875rem' }}>
                    No suggestions
                </MenuItem>
            )}
            <Divider />
            <MenuItem onClick={onAddToDictionary} sx={{ fontSize: '0.875rem' }}>
                Add to Dictionary
            </MenuItem>
        </Menu>
    );
});
