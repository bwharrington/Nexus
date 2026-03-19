/**
 * Defines which AI providers are restricted from certain chat modes.
 *
 * Add an entry here to prevent a provider from being used in specific modes.
 * The UI will disable the mode option and auto-reset when that provider is selected.
 * The send handler will also enforce these restrictions at runtime.
 *
 * Example restriction:
 *   xai: ['edit']  — xAI cannot use edit mode (no structured output support)
 */

import type { AIProvider } from './hooks/useAIChat';
import type { AIChatMode } from './types/global';

export type ProviderModeRestrictions = Partial<Record<AIProvider, AIChatMode[]>>;

/**
 * Map of provider → modes that provider does NOT support.
 */
export const PROVIDER_MODE_RESTRICTIONS: ProviderModeRestrictions = {
    xai: ['edit'],
};

/**
 * Returns true if the given provider is restricted from the given mode.
 */
export function isProviderRestrictedFromMode(
    provider: AIProvider,
    mode: AIChatMode
): boolean {
    const restricted = PROVIDER_MODE_RESTRICTIONS[provider];
    return restricted ? restricted.includes(mode) : false;
}

/**
 * Returns the list of modes that are restricted for a given provider.
 */
export function getRestrictedModesForProvider(provider: AIProvider): AIChatMode[] {
    return PROVIDER_MODE_RESTRICTIONS[provider] ?? [];
}

/**
 * Returns a human-readable reason why a provider is restricted from a mode.
 */
export function getRestrictionReason(provider: AIProvider, mode: AIChatMode): string {
    if (provider === 'xai' && mode === 'edit') {
        return 'xAI does not support Edit mode (structured output not yet available).';
    }
    return `${provider} does not support ${mode} mode.`;
}
