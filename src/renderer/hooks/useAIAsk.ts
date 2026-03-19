import { useState, useCallback, useRef } from 'react';
import type { AIProvider, AIMessage, AttachmentData } from './useAIChat';

const ASK_SYSTEM_PROMPT = `You are a direct, concise question-answering assistant. Follow these rules strictly:
- Answer ONLY the current question. Do not reference any previous questions or answers.
- Be concise and direct. Lead with the answer, not reasoning.
- If the question is unclear, ask exactly ONE clarifying question.
- If file context is provided, use it to inform your answer but do not summarize the files unless asked.
- Use Markdown formatting when it improves readability (code blocks, lists, bold).
- Do not add preamble, filler, or follow-up questions — just answer.`;

export function useAIAsk() {
    const [askMessages, setAskMessages] = useState<AIMessage[]>([]);
    const [isAskLoading, setIsAskLoading] = useState(false);
    const [askError, setAskError] = useState<string | null>(null);
    const activeRequestIdRef = useRef<string | null>(null);

    const submitAsk = useCallback(async (
        question: string,
        provider: AIProvider,
        model: string,
        attachedFiles?: Array<{ name: string; path: string; type: string; size: number }>,
    ) => {
        if (!question.trim()) return;

        // Read attached files
        let attachments: AttachmentData[] | undefined;
        if (attachedFiles && attachedFiles.length > 0) {
            try {
                const fileDataPromises = attachedFiles.map(async (file): Promise<AttachmentData | null> => {
                    const fileData = await window.electronAPI.readFileForAttachment(file.path);
                    if (fileData.type === 'image' || fileData.type === 'text') {
                        return {
                            name: file.name,
                            type: fileData.type,
                            mimeType: fileData.mimeType,
                            data: fileData.data!,
                        } as AttachmentData;
                    }
                    return null;
                });
                const results = await Promise.all(fileDataPromises);
                attachments = results.filter((f): f is AttachmentData => f !== null);
            } catch (err) {
                console.error('[useAIAsk] Failed to read attached files:', err);
                setAskError('Failed to read attached files');
                return;
            }
        }

        // Add user message to display history
        const userMessage: AIMessage = {
            role: 'user',
            content: question.trim(),
            timestamp: new Date(),
            attachments,
        };
        setAskMessages(prev => [...prev, userMessage]);
        setIsAskLoading(true);
        setAskError(null);

        const requestId = `ai-ask-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        activeRequestIdRef.current = requestId;

        try {
            // Build standalone API message — system prompt + question only, no history
            const apiMessages = [{
                role: 'user' as const,
                content: `${ASK_SYSTEM_PROMPT}\n\n---\n\nQuestion: ${question.trim()}`,
                attachments,
            }];

            let response;
            if (provider === 'xai') {
                response = await window.electronAPI.aiChatRequest(apiMessages, model, requestId);
            } else if (provider === 'claude') {
                response = await window.electronAPI.claudeChatRequest(apiMessages, model, requestId);
            } else if (provider === 'openai') {
                response = await window.electronAPI.openaiChatRequest(apiMessages, model, requestId);
            } else {
                response = await window.electronAPI.geminiChatRequest(apiMessages, model, requestId);
            }

            if (activeRequestIdRef.current !== requestId) return;

            if (response.success && response.response) {
                const assistantMessage: AIMessage = {
                    role: 'assistant',
                    content: response.response,
                    timestamp: new Date(),
                };
                setAskMessages(prev => [...prev, assistantMessage]);
            } else {
                setAskError(response.error || 'Failed to get response');
            }
        } catch (err) {
            if (activeRequestIdRef.current !== requestId) return;
            console.error('[useAIAsk] Failed to send ask request:', err);
            setAskError('Failed to send message');
        } finally {
            if (activeRequestIdRef.current === requestId) {
                activeRequestIdRef.current = null;
                setIsAskLoading(false);
            }
        }
    }, []);

    const cancelAsk = useCallback(async () => {
        const requestId = activeRequestIdRef.current;
        if (!requestId) return;

        activeRequestIdRef.current = null;
        setIsAskLoading(false);
        setAskError('Request canceled');

        try {
            await window.electronAPI.cancelAIChatRequest(requestId);
        } catch (err) {
            console.error('[useAIAsk] Failed to cancel ask request:', err);
        }
    }, []);

    const clearAsk = useCallback(() => {
        setAskMessages([]);
        setAskError(null);
    }, []);

    return {
        askMessages,
        isAskLoading,
        askError,
        submitAsk,
        cancelAsk,
        clearAsk,
    };
}
