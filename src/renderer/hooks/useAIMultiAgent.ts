import { useState, useCallback, useRef } from 'react';
import type { AIMessage, AttachmentData } from './useAIChat';

export type MultiAgentPhase = 'agents-working' | null;

export interface MultiAgentUsageInfo {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;
}

const MULTI_AGENT_SYSTEM_PROMPT = `You are a research assistant with access to multiple AI agents that collaborate to answer questions. Answer thoroughly using all available tools. Use Markdown formatting. Be comprehensive but well-organized with clear headings and structure.`;

export function useAIMultiAgent() {
    const [multiAgentMessages, setMultiAgentMessages] = useState<AIMessage[]>([]);
    const [isMultiAgentLoading, setIsMultiAgentLoading] = useState(false);
    const [multiAgentError, setMultiAgentError] = useState<string | null>(null);
    const [multiAgentPhase, setMultiAgentPhase] = useState<MultiAgentPhase>(null);
    const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
    const [lastUsage, setLastUsage] = useState<MultiAgentUsageInfo | null>(null);
    const activeRequestIdRef = useRef<string | null>(null);

    const submitMultiAgent = useCallback(async (
        question: string,
        model: string,
        tools: Array<{ type: string }>,
        reasoningEffort: string,
        attachedFiles?: Array<{ name: string; path: string; type: string; size: number }>,
    ) => {
        if (!question.trim()) return;

        const userMessage: AIMessage = {
            role: 'user',
            content: question.trim(),
            timestamp: new Date(),
        };
        setMultiAgentMessages(prev => [...prev, userMessage]);
        setIsMultiAgentLoading(true);
        setMultiAgentError(null);
        setMultiAgentPhase('agents-working');

        const requestId = `ai-multi-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        activeRequestIdRef.current = requestId;

        try {
            // Read attached files and inline as text context
            let fileContext = '';
            if (attachedFiles && attachedFiles.length > 0) {
                try {
                    const fileDataPromises = attachedFiles.map(async (file) => {
                        const fileData = await window.electronAPI.readFileForAttachment(file.path);
                        if (fileData.type === 'text' && fileData.data) {
                            return `\n\n[File: ${file.name}]\n${fileData.data}`;
                        }
                        return null;
                    });
                    const results = await Promise.all(fileDataPromises);
                    fileContext = results.filter(Boolean).join('');
                } catch (err) {
                    console.error('[useAIMultiAgent] Failed to read attached files:', err);
                    setMultiAgentError('Failed to read attached files');
                    return;
                }
            }

            if (activeRequestIdRef.current !== requestId) return;

            // Build input — for multi-turn we only send the new message + previous_response_id
            const input = [
                {
                    role: 'user' as const,
                    content: `${MULTI_AGENT_SYSTEM_PROMPT}\n\n---\n\n${question.trim()}${fileContext}`,
                },
            ];

            const response = await window.electronAPI.multiAgentRequest(
                input,
                model,
                tools.length > 0 ? tools : undefined,
                reasoningEffort,
                previousResponseId ?? undefined,
                requestId,
            );

            if (activeRequestIdRef.current !== requestId) return;

            if (response.success && response.response) {
                const assistantMessage: AIMessage = {
                    role: 'assistant',
                    content: response.response,
                    timestamp: new Date(),
                };
                setMultiAgentMessages(prev => [...prev, assistantMessage]);

                if (response.responseId) {
                    setPreviousResponseId(response.responseId);
                }
                if (response.usage) {
                    setLastUsage(response.usage);
                }
            } else {
                setMultiAgentError(response.error || 'Failed to get response from multi-agent model');
            }
        } catch (err) {
            if (activeRequestIdRef.current !== requestId) return;
            console.error('[useAIMultiAgent] Failed to send multi-agent request:', err);
            setMultiAgentError('Failed to send message');
        } finally {
            if (activeRequestIdRef.current === requestId) {
                activeRequestIdRef.current = null;
                setIsMultiAgentLoading(false);
                setMultiAgentPhase(null);
            }
        }
    }, [previousResponseId]);

    const cancelMultiAgent = useCallback(async () => {
        const requestId = activeRequestIdRef.current;
        if (!requestId) return;

        activeRequestIdRef.current = null;
        setIsMultiAgentLoading(false);
        setMultiAgentPhase(null);
        setMultiAgentError('Request canceled');

        try {
            await window.electronAPI.cancelAIChatRequest(requestId);
        } catch (err) {
            console.error('[useAIMultiAgent] Failed to cancel request:', err);
        }
    }, []);

    const clearMultiAgent = useCallback(() => {
        setMultiAgentMessages([]);
        setMultiAgentError(null);
        setMultiAgentPhase(null);
        setPreviousResponseId(null);
        setLastUsage(null);
    }, []);

    return {
        multiAgentMessages,
        isMultiAgentLoading,
        multiAgentPhase,
        multiAgentError,
        lastUsage,
        submitMultiAgent,
        cancelMultiAgent,
        clearMultiAgent,
    };
}
