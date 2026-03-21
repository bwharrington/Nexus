/**
 * Shared utilities for xAI multi-agent model support.
 * Importable from both main and renderer processes.
 */

export type MultiAgentBuiltInTool = 'web_search' | 'x_search' | 'code_execution' | 'collections_search';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

/** Default tools enabled for multi-agent requests. */
export const DEFAULT_MULTI_AGENT_TOOLS: MultiAgentBuiltInTool[] = ['web_search', 'x_search'];

/** Returns true if the model ID represents a multi-agent model. */
export function isMultiAgentModel(modelId: string): boolean {
    return modelId.includes('multi-agent');
}
