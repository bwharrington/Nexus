import { log, logError } from '../logger';
import { getApiKeyForService } from '../secureStorageIpcHandlers';
import type { MultiAgentBuiltInTool, ReasoningEffort } from '../../shared/multiAgentUtils';

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
