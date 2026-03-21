import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Modal, Box, IconButton, Tooltip, TextField, Typography, styled } from '@mui/material';
import { CloseIcon, SearchIcon, DragIndicatorIcon } from './AppIcons';
import { diffLines } from 'diff';
import { useDraggableDialog } from '../hooks/useDraggableDialog';
import type { IFile } from '../types';

// --- Types ---

interface CompareLine {
    leftLineNumber: number | null;
    rightLineNumber: number | null;
    leftContent: string | null;
    rightContent: string | null;
    type: 'unchanged' | 'modified' | 'added' | 'removed';
}

interface CompareDialogProps {
    leftFile: IFile;
    rightFile: IFile;
    onClose: () => void;
}

// --- Styled Components ---

const CompareContainer = styled(Box)(({ theme }) => ({
    position: 'absolute',
    top: 50,
    left: 50,
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 100px)',
    width: 'calc(100vw - 100px)',
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    boxShadow: theme.shadows[8],
    outline: 'none',
}));

const CompareHeader = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexShrink: 0,
}));

const CompareTab = styled('button')<{ active: boolean }>(({ theme, active }) => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? `2px solid ${theme.palette.primary.main}` : '2px solid transparent',
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
    color: active ? theme.palette.text.primary : theme.palette.text.secondary,
    fontWeight: active ? 600 : 400,
    '&:hover': {
        backgroundColor: theme.palette.action.hover,
    },
}));

const DiffScrollArea = styled(Box)({
    flex: 1,
    overflow: 'auto',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.6,
    tabSize: 4,
    position: 'relative',
});

const DiffLineRow = styled('div')<{ highlighted?: boolean }>(({ theme, highlighted }) => ({
    display: 'flex',
    minHeight: '1.6em',
    ...(highlighted && {
        outline: `2px solid ${theme.palette.warning.main}`,
        outlineOffset: -2,
    }),
}));

const LineNumberGutter = styled('span')(({ theme }) => ({
    width: 50,
    minWidth: 50,
    textAlign: 'right',
    paddingRight: 8,
    color: theme.palette.text.disabled,
    userSelect: 'none',
    flexShrink: 0,
}));

const ContentCell = styled('span')({
    flex: 1,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    paddingLeft: 8,
    paddingRight: 8,
});

const LeftContentCell = styled(ContentCell)<{ linetype: CompareLine['type'] }>(({ theme, linetype }) => {
    if (linetype === 'removed' || linetype === 'modified') {
        return {
            backgroundColor: theme.palette.mode === 'dark'
                ? 'rgba(248, 81, 73, 0.25)'
                : 'rgba(248, 81, 73, 0.15)',
        };
    }
    if (linetype === 'added') {
        return {
            backgroundColor: theme.palette.mode === 'dark'
                ? 'rgba(128, 128, 128, 0.1)'
                : 'rgba(128, 128, 128, 0.06)',
        };
    }
    return {};
});

const RightContentCell = styled(ContentCell)<{ linetype: CompareLine['type'] }>(({ theme, linetype }) => {
    if (linetype === 'added' || linetype === 'modified') {
        return {
            backgroundColor: theme.palette.mode === 'dark'
                ? 'rgba(46, 160, 67, 0.25)'
                : 'rgba(46, 160, 67, 0.15)',
        };
    }
    if (linetype === 'removed') {
        return {
            backgroundColor: theme.palette.mode === 'dark'
                ? 'rgba(128, 128, 128, 0.1)'
                : 'rgba(128, 128, 128, 0.06)',
        };
    }
    return {};
});

const DividerCol = styled('div')(({ theme }) => ({
    width: 1,
    flexShrink: 0,
    backgroundColor: theme.palette.divider,
}));

// Find bar styled components (match FindReplaceDialog style)
const FindBarContainer = styled(Box)(({ theme }) => ({
    position: 'absolute',
    zIndex: 10,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    boxShadow: theme.shadows[4],
    minWidth: 300,
    overflow: 'hidden',
}));

const FindBarDragHandle = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    cursor: 'move',
    backgroundColor: theme.palette.action.hover,
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:hover': {
        backgroundColor: theme.palette.action.selected,
    },
}));

const FindBarContent = styled(Box)({
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
});

// --- Component ---

export const CompareDialog = React.memo(function CompareDialog({ leftFile, rightFile, onClose }: CompareDialogProps) {
    const [activeTab, setActiveTab] = useState<'left' | 'right'>('left');
    const [findOpen, setFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [findMatchIndex, setFindMatchIndex] = useState(-1);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const findInputRef = useRef<HTMLInputElement>(null);
    const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

    const { dialogRef: findBarRef, position: findBarPos, isDragging: isFindDragging, handleDragMouseDown: handleFindDragMouseDown } = useDraggableDialog(findOpen, {
        initialPosition: { x: 0, y: 50 },
        positionStrategy: 'top-right',
    });

    const handleClose = useCallback(() => {
        console.log('[CompareDialog] Dialog closed', { leftFile: leftFile.name, rightFile: rightFile.name });
        onClose();
    }, [onClose, leftFile.name, rightFile.name]);

    const handleSetActiveLeft = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        console.log('[CompareDialog] Active tab set to left', { fileName: leftFile.name });
        setActiveTab('left');
    }, [leftFile.name]);

    const handleSetActiveRight = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        console.log('[CompareDialog] Active tab set to right', { fileName: rightFile.name });
        setActiveTab('right');
    }, [rightFile.name]);

    const compareLines = useMemo((): CompareLine[] => {
        console.log('[CompareDialog] Computing diff', { leftFile: leftFile.name, rightFile: rightFile.name, leftLen: leftFile.content.length, rightLen: rightFile.content.length });
        const normalizedLeft = leftFile.content.replace(/\r\n/g, '\n');
        const normalizedRight = rightFile.content.replace(/\r\n/g, '\n');

        const changes = diffLines(normalizedLeft, normalizedRight);
        const lines: CompareLine[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;

        let i = 0;
        while (i < changes.length) {
            const change = changes[i];
            const changeLines = change.value.endsWith('\n')
                ? change.value.slice(0, -1).split('\n')
                : change.value.split('\n');

            if (!change.added && !change.removed) {
                for (const line of changeLines) {
                    lines.push({
                        leftLineNumber: leftLineNum++,
                        rightLineNumber: rightLineNum++,
                        leftContent: line,
                        rightContent: line,
                        type: 'unchanged',
                    });
                }
                i++;
            } else if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
                const removedLines = changeLines;
                const nextChange = changes[i + 1];
                const addedLines = nextChange.value.endsWith('\n')
                    ? nextChange.value.slice(0, -1).split('\n')
                    : nextChange.value.split('\n');
                const maxLen = Math.max(removedLines.length, addedLines.length);

                for (let j = 0; j < maxLen; j++) {
                    lines.push({
                        leftLineNumber: j < removedLines.length ? leftLineNum++ : null,
                        rightLineNumber: j < addedLines.length ? rightLineNum++ : null,
                        leftContent: j < removedLines.length ? removedLines[j] : null,
                        rightContent: j < addedLines.length ? addedLines[j] : null,
                        type: 'modified',
                    });
                }
                i += 2;
            } else if (change.removed) {
                for (const line of changeLines) {
                    lines.push({
                        leftLineNumber: leftLineNum++,
                        rightLineNumber: null,
                        leftContent: line,
                        rightContent: null,
                        type: 'removed',
                    });
                }
                i++;
            } else if (change.added) {
                for (const line of changeLines) {
                    lines.push({
                        leftLineNumber: null,
                        rightLineNumber: rightLineNum++,
                        leftContent: null,
                        rightContent: line,
                        type: 'added',
                    });
                }
                i++;
            } else {
                i++;
            }
        }

        const diffCount = lines.filter(l => l.type !== 'unchanged').length;
        console.log('[CompareDialog] Diff computed', { totalLines: lines.length, diffLines: diffCount, unchangedLines: lines.length - diffCount });
        return lines;
    }, [leftFile.content, rightFile.content, leftFile.name, rightFile.name]);

    // Find: compute matching row indices against the active tab's content
    const findMatchRows = useMemo((): number[] => {
        if (!findQuery || !findOpen) return [];
        const lowerQuery = findQuery.toLowerCase();
        const matches: number[] = [];
        compareLines.forEach((line, idx) => {
            const content = activeTab === 'left' ? line.leftContent : line.rightContent;
            if (content !== null && content.toLowerCase().includes(lowerQuery)) {
                matches.push(idx);
            }
        });
        return matches;
    }, [findQuery, findOpen, compareLines, activeTab]);

    // Scroll to current match row when match index changes
    useEffect(() => {
        if (findMatchRows.length === 0 || findMatchIndex < 0) return;
        const rowIdx = findMatchRows[findMatchIndex];
        const rowEl = rowRefs.current[rowIdx];
        if (rowEl) {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [findMatchIndex, findMatchRows]);

    // Reset match index when query or active tab changes
    useEffect(() => {
        setFindMatchIndex(findMatchRows.length > 0 ? 0 : -1);
    }, [findMatchRows]);

    // Open find bar and focus input
    const handleOpenFind = useCallback(() => {
        console.log('[CompareDialog] Find bar opened', { activeTab });
        setFindOpen(true);
        setFindQuery('');
        setFindMatchIndex(-1);
        requestAnimationFrame(() => findInputRef.current?.focus());
    }, [activeTab]);

    const handleCloseFind = useCallback(() => {
        console.log('[CompareDialog] Find bar closed');
        setFindOpen(false);
        setFindQuery('');
        setFindMatchIndex(-1);
    }, []);

    const handleFindNext = useCallback(() => {
        if (findMatchRows.length === 0) return;
        setFindMatchIndex(prev => (prev + 1) % findMatchRows.length);
    }, [findMatchRows]);

    const handleFindPrev = useCallback(() => {
        if (findMatchRows.length === 0) return;
        setFindMatchIndex(prev => (prev - 1 + findMatchRows.length) % findMatchRows.length);
    }, [findMatchRows]);

    const handleFindKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                handleFindPrev();
            } else {
                handleFindNext();
            }
        } else if (e.key === 'Escape') {
            handleCloseFind();
        }
    }, [handleFindNext, handleFindPrev, handleCloseFind]);

    // Ctrl+F inside the dialog container
    const handleContainerKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            e.stopPropagation();
            handleOpenFind();
        } else if (e.key === 'Escape' && !findOpen) {
            handleClose();
        }
    }, [handleOpenFind, handleClose, findOpen]);

    // Build a Set of highlighted row indices for quick lookup during render
    const highlightedRows = useMemo(() => {
        const currentRow = findMatchRows[findMatchIndex] ?? -1;
        return { all: new Set(findMatchRows), current: currentRow };
    }, [findMatchRows, findMatchIndex]);

    const matchStatusText = useMemo(() => {
        if (!findQuery) return null;
        if (findMatchRows.length === 0) return 'No matches';
        return `${findMatchIndex + 1} of ${findMatchRows.length}`;
    }, [findQuery, findMatchRows, findMatchIndex]);

    return (
        <Modal open onClose={handleClose} disableAutoFocus disableEnforceFocus>
            <CompareContainer onKeyDown={handleContainerKeyDown} tabIndex={-1}>
                <CompareHeader>
                    <CompareTab
                        active={activeTab === 'left'}
                        onClick={handleSetActiveLeft}
                    >
                        {leftFile.name}
                    </CompareTab>
                    <CompareTab
                        active={activeTab === 'right'}
                        onClick={handleSetActiveRight}
                    >
                        {rightFile.name}
                    </CompareTab>
                    <Tooltip title="Find (Ctrl+F)">
                        <IconButton onClick={handleOpenFind} size="small" sx={{ ml: 1 }}>
                            <SearchIcon size={18} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Close (Esc)">
                        <IconButton onClick={handleClose} size="small" sx={{ ml: 'auto' }}>
                            <CloseIcon size={18} />
                        </IconButton>
                    </Tooltip>
                </CompareHeader>

                <DiffScrollArea ref={scrollAreaRef}>
                    {compareLines.map((line, idx) => {
                        const isCurrentMatch = idx === highlightedRows.current;
                        const isAnyMatch = highlightedRows.all.has(idx);
                        return (
                            <DiffLineRow
                                key={idx}
                                ref={el => { rowRefs.current[idx] = el; }}
                                highlighted={isCurrentMatch || isAnyMatch}
                                sx={isCurrentMatch ? { outline: theme => `2px solid ${theme.palette.warning.main}`, outlineOffset: '-2px' } : isAnyMatch ? { outline: theme => `1px solid ${theme.palette.warning.light}`, outlineOffset: '-1px' } : undefined}
                            >
                                <LineNumberGutter>
                                    {line.leftLineNumber ?? ''}
                                </LineNumberGutter>
                                <LeftContentCell linetype={line.type}>
                                    {line.leftContent !== null
                                        ? (line.leftContent || '\u00A0')
                                        : '\u00A0'}
                                </LeftContentCell>
                                <DividerCol />
                                <LineNumberGutter>
                                    {line.rightLineNumber ?? ''}
                                </LineNumberGutter>
                                <RightContentCell linetype={line.type}>
                                    {line.rightContent !== null
                                        ? (line.rightContent || '\u00A0')
                                        : '\u00A0'}
                                </RightContentCell>
                            </DiffLineRow>
                        );
                    })}
                </DiffScrollArea>

                {findOpen && (
                    <FindBarContainer
                        ref={findBarRef}
                        sx={{
                            left: findBarPos.x,
                            top: findBarPos.y,
                            cursor: isFindDragging ? 'grabbing' : 'default',
                        }}
                    >
                        <FindBarDragHandle onMouseDown={handleFindDragMouseDown}>
                            <DragIndicatorIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        </FindBarDragHandle>
                        <FindBarContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <TextField
                                    inputRef={findInputRef}
                                    size="small"
                                    placeholder="Find in active file..."
                                    value={findQuery}
                                    onChange={e => setFindQuery(e.target.value)}
                                    onKeyDown={handleFindKeyDown}
                                    autoFocus
                                    sx={{ flex: 1 }}
                                    InputProps={{
                                        sx: {
                                            '& input::placeholder': {
                                                color: 'text.secondary',
                                                opacity: 1,
                                            },
                                        },
                                    }}
                                />
                                <IconButton size="small" onClick={handleFindPrev} disabled={findMatchRows.length === 0} title="Previous (Shift+Enter)">
                                    ▲
                                </IconButton>
                                <IconButton size="small" onClick={handleFindNext} disabled={findMatchRows.length === 0} title="Next (Enter)">
                                    ▼
                                </IconButton>
                                <IconButton size="small" onClick={handleCloseFind}>
                                    <CloseIcon size={16} />
                                </IconButton>
                            </Box>
                            {matchStatusText && (
                                <Typography variant="caption" color={findMatchRows.length === 0 ? 'error' : 'text.secondary'}>
                                    {matchStatusText}
                                </Typography>
                            )}
                        </FindBarContent>
                    </FindBarContainer>
                )}
            </CompareContainer>
        </Modal>
    );
});
