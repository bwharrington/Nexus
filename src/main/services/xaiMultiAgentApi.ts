import { log, logError } from '../logger';
import { getApiKeyForService } from '../secureStorageIpcHandlers';
import type { MultiAgentBuiltInTool, ReasoningEffort } from '../../shared/multiAgentUtils';
import type { MultiAgentStreamUpdate, MultiAgentStreamEvent } from '../../shared/multiAgentStreamTypes';

// ── Request types ──────────────────────────────────────────────────

export interface MultiAgentInput {
    role: 'user' | 'assistant';
    content: string;
}

export interface MultiAgentTool {
    type: MultiAgentBuiltInTool;
}

export interface MultiAgentRequestBody {
    model: string;
    input: MultiAgentInput[];
    tools?: MultiAgentTool[];
    reasoning?: { effort: ReasoningEffort };
    previous_response_id?: string;
}

// ── Response types ─────────────────────────────────────────────────

export interface MultiAgentOutputItem {
    type: string;
    // 'message' output items
    role?: string;
    content?: Array<{ type: string; text?: string }>;
    // other output types may have additional fields
    [key: string]: unknown;
}

export interface MultiAgentUsage {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;
}

export interface MultiAgentApiResponse {
    id: string;
    output: MultiAgentOutputItem[];
    usage?: MultiAgentUsage;
    status: string;
}

// ── Result returned to callers ─────────────────────────────────────

export interface MultiAgentChatResult {
    content: string;
    responseId: string;
    usage?: MultiAgentUsage;
}

// ── Core API call ──────────────────────────────────────────────────

export async function callXAiMultiAgentApi(
    input: MultiAgentInput[],
    model: string,
    tools?: MultiAgentTool[],
    reasoningEffort?: ReasoningEffort,
    previousResponseId?: string,
    signal?: AbortSignal,
): Promise<MultiAgentChatResult> {
    const apiKey = getApiKeyForService('xai');
    if (!apiKey) {
        throw new Error('XAI_API_KEY not found. Please set it in Settings');
    }

    const requestBody: MultiAgentRequestBody = { model, input };

    if (tools && tools.length > 0) {
        requestBody.tools = tools;
    }
    if (reasoningEffort) {
        requestBody.reasoning = { effort: reasoningEffort };
    }
    if (previousResponseId) {
        requestBody.previous_response_id = previousResponseId;
    }

    log('xAI Multi-Agent API Request', {
        url: 'https://api.x.ai/v1/responses',
        model,
        inputCount: input.length,
        tools: tools?.map(t => t.type),
        reasoningEffort,
        hasPreviousResponse: !!previousResponseId,
    });

    try {
        const response = await fetch('https://api.x.ai/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal,
        });

        log('xAI Multi-Agent API Response Status', {
            status: response.status,
            statusText: response.statusText,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            logError('xAI Multi-Agent API Error Response', {
                message: errorBody,
                status: response.status,
                body: errorBody,
            });
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }

        const data: MultiAgentApiResponse = await response.json();

        log('xAI Multi-Agent API Response', {
            responseId: data.id,
            status: data.status,
            outputItemCount: data.output?.length ?? 0,
            usage: data.usage,
        });

        // Extract text content from the output array.
        // The leader agent's final message is typically the last 'message' item with role 'assistant'.
        const textContent = extractTextFromOutput(data.output);

        return {
            content: textContent || 'No response from multi-agent model',
            responseId: data.id,
            usage: data.usage,
        };
    } catch (error) {
        logError('Error calling xAI Multi-Agent API', error as Error);
        throw new Error(
            `Failed to call xAI Multi-Agent API: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

// ── Streaming API call ────────────────────────────────────────────

export interface MultiAgentStreamingRequestBody extends MultiAgentRequestBody {
    stream: true;
}

/**
 * Calls the xAI Responses API with streaming enabled (stream: true).
 * Parses SSE events and pushes them to the caller via onStreamEvent callback.
 * Returns the same MultiAgentChatResult shape when the stream completes.
 */
export async function callXAiMultiAgentApiStreaming(
    input: MultiAgentInput[],
    model: string,
    onStreamEvent: (event: MultiAgentStreamUpdate) => void,
    tools?: MultiAgentTool[],
    reasoningEffort?: ReasoningEffort,
    previousResponseId?: string,
    signal?: AbortSignal,
): Promise<MultiAgentChatResult> {
    const apiKey = getApiKeyForService('xai');
    if (!apiKey) {
        throw new Error('XAI_API_KEY not found. Please set it in Settings');
    }

    const requestBody: MultiAgentStreamingRequestBody = {
        model,
        input,
        stream: true,
    };

    if (tools && tools.length > 0) {
        requestBody.tools = tools;
    }
    if (reasoningEffort) {
        requestBody.reasoning = { effort: reasoningEffort };
    }
    if (previousResponseId) {
        requestBody.previous_response_id = previousResponseId;
    }

    log('xAI Multi-Agent Streaming API Request', {
        url: 'https://api.x.ai/v1/responses',
        model,
        inputCount: input.length,
        tools: tools?.map(t => t.type),
        reasoningEffort,
        hasPreviousResponse: !!previousResponseId,
        streaming: true,
    });

    const response = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal,
    });

    log('xAI Multi-Agent Streaming Response Status', {
        status: response.status,
        statusText: response.statusText,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        logError('xAI Multi-Agent Streaming Error Response', {
            message: errorBody,
            status: response.status,
            body: errorBody,
        });
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
    }

    if (!response.body) {
        throw new Error('Streaming response has no body');
    }

    // Accumulate data as we parse the stream
    const contentParts: string[] = [];
    let responseId = '';
    let usage: MultiAgentUsage | undefined;

    await parseSSEStream(response.body, (eventType, rawData) => {
        const now = Date.now();
        const rawEvent: MultiAgentStreamEvent = { eventType, data: rawData, timestamp: now };

        log('xAI Multi-Agent SSE Event', { eventType, dataKeys: Object.keys(rawData) });

        const update = classifyStreamEvent(eventType, rawData, rawEvent);
        onStreamEvent(update);

        // Accumulate final content from content deltas
        if (update.type === 'content-delta' && update.contentDelta) {
            contentParts.push(update.contentDelta);
        }

        // Extract response ID, usage, and fallback content from completion events
        if (eventType === 'response.completed' || eventType === 'response.done') {
            const resp = rawData.response as Record<string, unknown> | undefined;
            const source = resp ?? rawData;
            if (typeof source.id === 'string') responseId = source.id;
            if (source.usage) usage = source.usage as MultiAgentUsage;
            // Fallback: extract text from the output array if we got no content deltas
            if (contentParts.length === 0 && Array.isArray(source.output)) {
                const fallback = extractTextFromOutput(source.output as MultiAgentOutputItem[]);
                if (fallback) contentParts.push(fallback);
            }
        }
    }, signal);

    const content = contentParts.join('') || 'No response from multi-agent model';

    log('xAI Multi-Agent Streaming Complete', {
        responseId,
        contentLength: content.length,
        usage,
    });

    return { content, responseId, usage };
}

// ── SSE Parser ───────────────────────────────────────────────────

/**
 * Parses an SSE stream from a ReadableStream<Uint8Array>.
 * Calls onEvent for each complete SSE frame with the parsed event type and JSON data.
 */
async function parseSSEStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (eventType: string, data: Record<string, unknown>) => void,
    signal?: AbortSignal,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
        while (true) {
            if (signal?.aborted) {
                reader.cancel();
                break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // SSE frames are delimited by double newlines
            let frameEnd: number;
            while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
                const frame = buffer.substring(0, frameEnd);
                buffer = buffer.substring(frameEnd + 2);

                if (!frame.trim()) continue;

                let eventType = 'message';
                let dataStr = '';

                for (const line of frame.split('\n')) {
                    if (line.startsWith('event:')) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith('data:')) {
                        dataStr += line.substring(5).trim();
                    } else if (line.startsWith(':')) {
                        // SSE comment, ignore
                    }
                }

                if (!dataStr || dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr) as Record<string, unknown>;
                    onEvent(eventType, data);
                } catch (parseErr) {
                    log('xAI Multi-Agent SSE Parse Warning', {
                        eventType,
                        rawData: dataStr.substring(0, 200),
                        error: String(parseErr),
                    });
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ── Event Classifier ─────────────────────────────────────────────

/**
 * Classifies a raw SSE event into a normalized MultiAgentStreamUpdate.
 * Conservative: recognizes known patterns, defaults to 'raw' for unknowns.
 */
function classifyStreamEvent(
    eventType: string,
    data: Record<string, unknown>,
    rawEvent: MultiAgentStreamEvent,
): MultiAgentStreamUpdate {
    // Content text deltas
    if (eventType === 'response.output_text.delta' ||
        eventType === 'response.content_part.delta') {
        const delta = (data.delta as string) ?? (data.text as string) ?? '';
        return { type: 'content-delta', contentDelta: delta, rawEvent };
    }

    // Tool / function call events
    if (eventType.includes('function_call') ||
        eventType === 'response.output_item.added' && data.type === 'function_call') {
        const fnName = (data.name as string) ??
            ((data.item as Record<string, unknown>)?.name as string) ?? undefined;
        const fnArgs = (data.arguments as string) ?? undefined;
        return { type: 'tool-call', toolName: fnName, toolInput: fnArgs, rawEvent };
    }

    // Output item events (agent activity)
    if (eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
        const item = (data.item as Record<string, unknown>) ?? data;
        const role = item.role as string | undefined;
        const itemType = item.type as string | undefined;
        return {
            type: 'agent-activity',
            agentName: role ?? itemType ?? eventType,
            rawEvent,
        };
    }

    // Reasoning / thinking tokens
    if (eventType === 'response.reasoning.delta' ||
        eventType === 'response.reasoning_summary_part.delta' ||
        eventType === 'response.reasoning_summary_text.delta') {
        return { type: 'reasoning', rawEvent };
    }

    // Stream completed
    if (eventType === 'response.completed' || eventType === 'response.done') {
        const resp = data.response as Record<string, unknown> | undefined;
        const respUsage = resp?.usage as Record<string, unknown> | undefined;
        return {
            type: 'done',
            reasoningTokens: (respUsage?.reasoning_tokens as number) ?? undefined,
            rawEvent,
        };
    }

    // Error events
    if (eventType === 'error') {
        const msg = (data.message as string) ?? (data.error as string) ?? JSON.stringify(data);
        return { type: 'error', message: msg, rawEvent };
    }

    // Default: pass through as raw
    return { type: 'raw', rawEvent };
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Extracts the final text content from the Responses API output array.
 * The output contains items of various types; we look for 'message' items
 * with role 'assistant' and concatenate their text content blocks.
 */
function extractTextFromOutput(output: MultiAgentOutputItem[]): string {
    if (!output || output.length === 0) return '';

    const textParts: string[] = [];

    for (const item of output) {
        if (item.type === 'message' && item.role === 'assistant' && item.content) {
            for (const block of item.content) {
                if (block.type === 'output_text' && block.text) {
                    textParts.push(block.text);
                } else if (block.type === 'text' && block.text) {
                    textParts.push(block.text);
                }
            }
        }
    }

    return textParts.join('\n\n');
}
