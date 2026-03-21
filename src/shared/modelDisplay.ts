/**
 * Model display name utilities — single source of truth for formatting
 * model IDs into human-readable names across main process and renderer.
 */

// Explicit overrides for model IDs that auto-formatting handles poorly.
// Unknown IDs fall through to formatModelName() automatically.
export const MODEL_DISPLAY_OVERRIDES: Record<string, string> = {
    // Claude
    'claude-sonnet-4-6':           'Claude Sonnet 4.6',
    'claude-opus-4-6':             'Claude Opus 4.6',
    'claude-haiku-4-5-20251001':   'Claude Haiku 4.5',
    // xAI
    'grok-4-1-fast-non-reasoning':          'Grok 4.1',
    'grok-4-1-fast-reasoning':              'Grok 4.1 Reasoning',
    'grok-4-0709':                          'Grok 4',
    'grok-4.20-beta-0309-non-reasoning':    'Grok 4.20',
    'grok-4.20-beta-0309-reasoning':        'Grok 4.20 Reasoning',
    'grok-4.20-multi-agent-beta-0309':      'Grok 4.20 Multi Agent',
    // OpenAI GPT-5 family (chat completions-compatible only)
    'gpt-5':                       'GPT-5',
    'gpt-5-mini':                  'GPT-5 Mini',
    'gpt-5-nano':                  'GPT-5 Nano',
    'gpt-5.1':                     'GPT-5.1',
    'gpt-5.2':                     'GPT-5.2',
    // OpenAI gpt-4o aliases
    'gpt-4o-latest':               'GPT-4o Latest',
    'gpt-4o-mini-latest':          'GPT-4o Mini Latest',
};

/** Format a model ID into a readable display name (e.g. "grok-4-latest" → "Grok 4 Latest"). */
export function formatModelName(modelId: string): string {
    // xAI Grok models: strip beta tags, date suffixes, and "fast-" to produce clean names
    if (modelId.startsWith('grok-')) {
        return formatGrokModelName(modelId);
    }
    return modelId
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/(\d+)$/g, ' $1')
        .trim();
}

/**
 * Smart formatter for Grok model IDs.
 * Strips beta tags, date suffixes (e.g. -0309, -0709), and "fast-" to produce
 * clean names like "Grok 4.1", "Grok 4.20 Reasoning", "Grok 4.20 Multi Agent".
 */
function formatGrokModelName(modelId: string): string {
    let name = modelId;

    // Strip date suffixes (4-digit: -0309, -0709, etc.)
    name = name.replace(/-\d{4}(?=$|-)/g, '');
    // Strip "beta" tag
    name = name.replace(/-beta/g, '');
    // Strip "fast-" (Grok 4.1 uses "fast-" prefix for its variants)
    name = name.replace(/-fast/g, '');
    // Clean up any doubled dashes from stripping
    name = name.replace(/--+/g, '-').replace(/-$/, '');

    // Map "non-reasoning" to just the base name (it's the default mode)
    const isNonReasoning = name.includes('-non-reasoning');
    name = name.replace(/-non-reasoning/, '');

    // Map remaining "-reasoning" to " Reasoning"
    const isReasoning = !isNonReasoning && name.includes('-reasoning');
    name = name.replace(/-reasoning/, '');

    // Convert "grok-4-1" → "Grok 4.1", "grok-4.20" stays as-is
    // First, handle the version number: grok-4-1 → grok-4.1
    name = name.replace(/^grok-(\d+)-(\d+)$/, 'grok-$1.$2');
    name = name.replace(/^grok-(\d+)-(\d+)-/, 'grok-$1.$2-');

    // Now format: dashes to spaces, capitalize words
    name = name
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();

    // Append "Reasoning" suffix for reasoning variants
    if (isReasoning) {
        name += ' Reasoning';
    }

    return name;
}

/** Return the display name for a model ID, using overrides where available. */
export function getDisplayName(modelId: string): string {
    return MODEL_DISPLAY_OVERRIDES[modelId] ?? formatModelName(modelId);
}
