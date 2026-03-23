// Shared types for xAI multi-agent verbose streaming events
// Used by both main process (SSE parser) and renderer (UI state)

/** Raw SSE event as received from the xAI API */
export interface MultiAgentStreamEvent {
    eventType: string;                    // SSE event: field (e.g. "response.output_item.added")
    data: Record<string, unknown>;        // Raw parsed JSON from data: field
    timestamp: number;
}

/** Normalized/classified stream update sent over IPC to the renderer */
export interface MultiAgentStreamUpdate {
    type: 'agent-activity' | 'tool-call' | 'reasoning' | 'content-delta' | 'raw' | 'done' | 'error';
    agentName?: string;
    agentIndex?: number;
    toolName?: string;
    toolInput?: string;
    reasoningTokens?: number;
    contentDelta?: string;
    message?: string;        // For error type
    rawEvent: MultiAgentStreamEvent;
}

/** IPC payload pushed from main → renderer via 'ai:multi-agent-stream' channel */
export interface MultiAgentStreamData {
    requestId: string;
    event: MultiAgentStreamUpdate;
}
