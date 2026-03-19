import { useState, useCallback, useRef } from 'react';
import { useEditorDispatch, useEditorState } from '../contexts/EditorContext';
import type { AIProvider } from './useAIChat';
import { callWithContinuation } from '../utils/callWithContinuation';
import type { AttachedFile } from '../components/FileAttachmentsList';
import type { IFile } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 11);

export type CreatePhase =
    | 'creating'  // Step 1: Generate the content
    | 'naming'    // Step 2: Generate a filename
    | 'complete'
    | null;

// --- Step 1: Content Generation Prompt ---
const CREATING_PROMPT_TEMPLATE = `You are a creative content generator. The user will describe what they want you to create. Generate the complete content in Markdown format.

**User Request:** "{REQUEST}"

{FILE_CONTEXT}

Guidelines:
- Be thorough, well-structured, and creative
- Use proper Markdown formatting (headings, lists, code blocks, tables, etc. as appropriate)
- If context files are provided, use them to inform and enrich your output
- Focus on quality and completeness — this will become a standalone document
- Match the tone and style implied by the request (technical, casual, formal, etc.)
- Do not include meta-commentary about the request — just produce the content directly`;

function buildCreatingPrompt(request: string, fileContext: string): string {
    const contextSection = fileContext.trim()
        ? `**Context from attached files:**\n${fileContext.trim()}`
        : '';
    return CREATING_PROMPT_TEMPLATE
        .replace('{REQUEST}', request)
        .replace('{FILE_CONTEXT}', contextSection);
}

// --- Step 2: Naming Prompt ---
const NAMING_PROMPT_TEMPLATE = `Generate a short, descriptive filename for this document.

Content summary: {REQUEST}

Rules:
- Title Case words, spaces allowed (e.g. "React Hooks Guide", "API Design Spec")
- Max 30 characters, no file extension
- Focus on the content topic, be descriptive but concise
- Return ONLY the filename, nothing else`;

function buildNamingPrompt(request: string): string {
    return NAMING_PROMPT_TEMPLATE.replace('{REQUEST}', request);
}

function sanitizeFilename(raw: string): string {
    let name = raw.trim();
    name = name.replace(/^["']|["']$/g, '');
    name = name.replace(/\.\w+$/, '');
    name = name.replace(/[/\\:*?"<>|]/g, '');
    if (name.length > 40) {
        name = name.substring(0, 40).replace(/\s+$/, '');
    }
    return name;
}

// --- IPC helper (same pattern as other AI hooks) ---
async function callChatApi(
    provider: AIProvider,
    messages: { role: 'user' | 'assistant'; content: string }[],
    model: string,
    requestId: string,
    maxTokens?: number,
) {
    if (provider === 'claude') {
        return window.electronAPI.claudeChatRequest(messages, model, requestId, maxTokens);
    }
    if (provider === 'xai') {
        return window.electronAPI.aiChatRequest(messages, model, requestId, maxTokens);
    }
    if (provider === 'gemini') {
        return window.electronAPI.geminiChatRequest(messages, model, requestId, maxTokens);
    }
    return window.electronAPI.openaiChatRequest(messages, model, requestId, maxTokens);
}

// Build file context text from open editor files and the enabled attached file list
function buildFileContextFromOpenFiles(
    attachedFiles: AttachedFile[],
    openFiles: IFile[],
): string {
    if (attachedFiles.length === 0) return '';

    const parts: string[] = [];
    for (const af of attachedFiles) {
        const openFile = openFiles.find(f => f.path === af.path);
        if (openFile && openFile.content.trim()) {
            parts.push(`[File: ${af.name}]\n${openFile.content}`);
        }
    }
    return parts.join('\n\n---\n\n');
}

const CREATING_MAX_TOKENS = 16384;

// --- Hook ---
export function useAICreate() {
    const dispatch = useEditorDispatch();
    const state = useEditorState();

    const [isCreateLoading, setIsCreateLoading] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createPhase, setCreatePhase] = useState<CreatePhase>(null);
    const [createComplete, setCreateComplete] = useState(false);
    const [createFileName, setCreateFileName] = useState<string | null>(null);

    const activeRequestIdRef = useRef<string | null>(null);
    const defaultLineEndingRef = useRef(state.config.defaultLineEnding);
    defaultLineEndingRef.current = state.config.defaultLineEnding;
    const openFilesRef = useRef(state.openFiles);
    openFilesRef.current = state.openFiles;

    const submitCreate = useCallback(async (
        request: string,
        attachedFiles: AttachedFile[],
        provider: AIProvider,
        model: string,
        requestId: string,
    ) => {
        if (!request.trim()) {
            throw new Error('Please describe what you want to create');
        }

        activeRequestIdRef.current = requestId;
        setIsCreateLoading(true);
        setCreateError(null);
        setCreateComplete(false);
        setCreateFileName(null);

        const startTime = Date.now();
        let currentPhaseForError: CreatePhase = null;
        console.log('[Create] Starting', { request, provider, model, requestId });

        const fileContext = buildFileContextFromOpenFiles(attachedFiles, openFilesRef.current);

        try {
            // ── Step 1: Content Generation ─────────────────────────────────────────
            setCreatePhase('creating');
            currentPhaseForError = 'creating';

            const creatingMessages = [{
                role: 'user' as const,
                content: buildCreatingPrompt(request, fileContext),
            }];

            console.log('[Create] Phase: creating — calling API');
            const createResult = await callWithContinuation(
                callChatApi, provider, creatingMessages, model,
                `${requestId}-creating`, '[Create]', CREATING_MAX_TOKENS
            );

            if (activeRequestIdRef.current !== requestId) return;

            const createdContent = createResult.content;
            console.log('[Create] Content generation complete', {
                elapsed: Date.now() - startTime,
                contentLength: createdContent.length,
                continuations: createResult.continuations,
            });

            // ── Step 2: Naming ─────────────────────────────────────────────────────
            setCreatePhase('naming');
            currentPhaseForError = 'naming';

            const namingMessages = [{
                role: 'user' as const,
                content: buildNamingPrompt(request),
            }];

            console.log('[Create] Phase: naming — calling API');
            let fileName = `created-${request.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 30)}.md`;

            const namingResponse = await callChatApi(
                provider, namingMessages, model, `${requestId}-naming`
            );

            if (activeRequestIdRef.current !== requestId) return;

            if (namingResponse.success && namingResponse.response) {
                const sanitized = sanitizeFilename(namingResponse.response);
                if (sanitized.length > 0) {
                    fileName = `${sanitized}.md`;
                }
            }

            console.log('[Create] Naming complete', {
                elapsed: Date.now() - startTime,
                fileName,
            });

            // ── Open new file tab ──────────────────────────────────────────────────
            const fileId = generateId();
            dispatch({
                type: 'OPEN_FILE',
                payload: {
                    id: fileId,
                    path: null,
                    name: fileName,
                    content: createdContent,
                    lineEnding: defaultLineEndingRef.current,
                    viewMode: 'preview' as const,
                    fileType: 'markdown' as const,
                },
            });

            setCreateFileName(fileName);
            setCreatePhase('complete');
            setCreateComplete(true);

            console.log('[Create] Complete', {
                totalElapsed: Date.now() - startTime,
                fileName,
            });
        } catch (err) {
            if (activeRequestIdRef.current !== requestId) return;
            const message = err instanceof Error ? err.message : 'Create request failed';
            console.error('[Create] Error', {
                phase: currentPhaseForError,
                elapsed: Date.now() - startTime,
                error: message,
            });
            setCreateError(message);
            setCreatePhase(null);
            setCreateComplete(false);
            throw err;
        } finally {
            if (activeRequestIdRef.current === requestId) {
                activeRequestIdRef.current = null;
                setIsCreateLoading(false);
            }
        }
    }, [dispatch]);

    const dismissCreateProgress = useCallback(() => {
        setCreatePhase(null);
        setCreateComplete(false);
        setCreateFileName(null);
    }, []);

    const cancelCreate = useCallback(async () => {
        const requestId = activeRequestIdRef.current;
        activeRequestIdRef.current = null;
        setIsCreateLoading(false);
        setCreatePhase(null);
        setCreateComplete(false);
        setCreateFileName(null);
        setCreateError('Create request canceled');

        if (requestId) {
            console.log('[Create] Canceling', { requestId });
            for (const step of ['creating', 'naming']) {
                for (const suffix of ['', '-cont-1', '-cont-2', '-cont-3']) {
                    try {
                        await window.electronAPI.cancelAIChatRequest(`${requestId}-${step}${suffix}`);
                    } catch { /* ignore */ }
                }
            }
        }
    }, []);

    return {
        submitCreate,
        cancelCreate,
        dismissCreateProgress,
        isCreateLoading,
        createError,
        createPhase,
        createComplete,
        createFileName,
    };
}
