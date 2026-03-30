import React, { useCallback, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { preprocessMathDelimiters } from '../utils/mathPreprocess';
import { useActiveFile, useEditorDispatch } from '../contexts';
import { useFindReplace } from '../hooks/useFindReplace';
import { useMarkdownComponents } from '../utils/markdownComponents';
import { highlightWordInElement } from '../utils/domUtils';
import { EditorContainer, EditorWrapper } from '../styles/editor.styles';
import { PreviewContainer } from '../styles/preview.styles';
import { MarkdownToolbar } from './MarkdownToolbar';
import { RstToolbar } from './RstToolbar';
import { FindReplaceDialog } from './FindReplaceDialog';
import { RstRenderer } from './RstRenderer';
import { buildPdfHtmlDocument } from '../utils/pdfExport';

const markdownRemarkPlugins = [remarkGfm, remarkMath];
const markdownRehypePlugins = [rehypeKatex];

// Stable no-op for disabled Find/Replace fields in preview mode
const noop = () => {};

export function PreviewView() {
    const activeFile = useActiveFile();
    const dispatch = useEditorDispatch();
    const previewRef = useRef<HTMLDivElement>(null);
    const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null);

    // A dummy contentEditableRef for useFindReplace (not used in preview mode but needed by the hook)
    const contentEditableRef = useRef<HTMLDivElement>(null);

    const markdownComponents = useMarkdownComponents(previewRef);

    const processedContent = useMemo(
        () => preprocessMathDelimiters(activeFile?.content || '*No content*'),
        [activeFile?.content]
    );

    const {
        findDialogOpen,
        searchQuery,
        searchMatches,
        currentSearchIndex,
        matchCount,
        replaceQuery,
        activeDialogTab,
        setActiveDialogTab,
        setReplaceQuery,
        handleSearchQueryChange,
        handleFindNext,
        handleCount,
        handleReplace,
        handleReplaceAll,
        handleOpenFind,
        handleCloseFind,
    } = useFindReplace(contentEditableRef, previewRef);

    // Throttled scroll position update
    const handleScrollThrottled = useCallback((scrollTop: number) => {
        if (!activeFile) return;
        if (scrollThrottleRef.current) {
            clearTimeout(scrollThrottleRef.current);
        }
        scrollThrottleRef.current = setTimeout(() => {
            dispatch({
                type: 'UPDATE_SCROLL_POSITION',
                payload: { id: activeFile.id, scrollPosition: scrollTop }
            });
        }, 100);
    }, [activeFile, dispatch]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        handleScrollThrottled(target.scrollTop);
    }, [handleScrollThrottled]);

    const handlePreviewDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!activeFile || !previewRef.current) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const word = selection.toString().trim();
        if (!word || !/^[a-zA-Z0-9]+$/.test(word)) return;

        // Remove existing highlights
        const previewElement = previewRef.current;
        previewElement.querySelectorAll('.word-highlight').forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                parent.normalize();
            }
        });

        // Find and highlight all matching words in the preview
        highlightWordInElement(previewElement, word);

        // Re-select the first highlighted word after highlighting
        requestAnimationFrame(() => {
            const highlightedElements = previewElement.querySelectorAll('.word-highlight');
            if (highlightedElements.length > 0) {
                const clickX = e.clientX;
                const clickY = e.clientY;
                let closestElement: Element | null = null;
                let minDistance = Infinity;

                highlightedElements.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const distance = Math.sqrt(Math.pow(clickX - centerX, 2) + Math.pow(clickY - centerY, 2));

                    if (distance < minDistance) {
                        minDistance = distance;
                        closestElement = el;
                    }
                });

                if (closestElement) {
                    const range = document.createRange();
                    range.selectNodeContents(closestElement);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        });
    }, [activeFile]);

    const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!previewRef.current) return;

        const target = e.target as HTMLElement;
        if (target.classList.contains('word-highlight')) {
            return;
        }

        const previewElement = previewRef.current;
        previewElement.querySelectorAll('.word-highlight').forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                parent.normalize();
            }
        });
    }, []);

    const handleExportPdf = useCallback(async () => {
        if (!activeFile) return;

        const defaultName = activeFile.name.replace(/\.[^.]+$/, '') || 'Untitled';
        const exportHtml = await buildPdfHtmlDocument({
            fileType: activeFile.fileType,
            content: activeFile.content || '',
            documentPath: activeFile.path,
            title: activeFile.name,
            existingRenderedElement: previewRef.current,
        });

        const result = await window.electronAPI.exportPdf(exportHtml, `${defaultName}.pdf`);
        if (!result || result.cancelled) {
            return;
        }

        if (result.success) {
            const outputName = result.filePath?.split(/[\\/]/).pop() || `${defaultName}.pdf`;
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: `Exported "${outputName}"`,
                    severity: 'success',
                    action: result.filePath ? {
                        label: 'Show in Folder',
                        onClick: () => window.electronAPI.showInFolder(result.filePath!),
                    } : undefined,
                },
            });
        } else {
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: { message: `Failed to export "${activeFile.name}"`, severity: 'error' },
            });
        }
    }, [activeFile, dispatch]);

    // Restore scroll position
    React.useEffect(() => {
        if (!activeFile) return;
        const element = previewRef.current;
        if (element && activeFile.scrollPosition > 0) {
            requestAnimationFrame(() => {
                element.scrollTop = activeFile.scrollPosition;
            });
        }
    }, [activeFile?.id, activeFile?.viewMode, activeFile]);

    if (!activeFile) return null;

    const isRstFile = activeFile.fileType === 'rst';
    const PreviewToolbar = isRstFile ? RstToolbar : MarkdownToolbar;

    return (
        <EditorContainer>
            <PreviewToolbar
                mode="preview"
                onFind={handleOpenFind}
                onExportPdf={handleExportPdf}
            />
            <EditorWrapper>
                {isRstFile ? (
                    <Box
                        ref={previewRef}
                        data-preview-scroll
                        onClick={handlePreviewClick}
                        onDoubleClick={handlePreviewDoubleClick}
                        onScroll={handleScroll}
                        sx={{ flex: 1, overflow: 'auto' }}
                    >
                        <RstRenderer content={activeFile.content || ''} documentPath={activeFile.path} />
                    </Box>
                ) : (
                    <PreviewContainer
                        ref={previewRef}
                        data-preview-scroll
                        onClick={handlePreviewClick}
                        onDoubleClick={handlePreviewDoubleClick}
                        onScroll={handleScroll}
                    >
                        <ReactMarkdown
                            remarkPlugins={markdownRemarkPlugins}
                            rehypePlugins={markdownRehypePlugins}
                            components={markdownComponents}
                        >
                            {processedContent}
                        </ReactMarkdown>
                    </PreviewContainer>
                )}
                <FindReplaceDialog
                    open={findDialogOpen}
                    mode="preview"
                    activeTab={activeDialogTab}
                    searchQuery={searchQuery}
                    replaceQuery={replaceQuery}
                    matchCount={matchCount}
                    currentMatchIndex={currentSearchIndex}
                    totalMatches={searchMatches.length}
                    gotoLineValue=""
                    isEditMode={false}
                    onTabChange={setActiveDialogTab}
                    onSearchQueryChange={handleSearchQueryChange}
                    onReplaceQueryChange={setReplaceQuery}
                    onGotoLineChange={noop}
                    onFindNext={handleFindNext}
                    onCount={handleCount}
                    onReplace={handleReplace}
                    onReplaceAll={handleReplaceAll}
                    onGoToLine={noop}
                    onClose={handleCloseFind}
                />
            </EditorWrapper>
        </EditorContainer>
    );
}
