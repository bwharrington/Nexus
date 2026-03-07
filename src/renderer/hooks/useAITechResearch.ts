import { useState, useCallback, useRef } from 'react';
import { useEditorDispatch, useEditorState } from '../contexts/EditorContext';
import type { AIProvider } from './useAIChat';
import { closeUnclosedFences } from '../utils/sanitizeMarkdown';
import { callWithContinuation } from '../utils/callWithContinuation';
import type { GoDeepDepthLevel } from './useAIGoDeeper';
import type { SourceFetchProgress } from '../types/global';

// Generate unique ID (same pattern as other AI hooks)
const generateId = () => Math.random().toString(36).substring(2, 11);

export type TechResearchPhase =
    | 'scoping'     // Step 1: Parse query → JSON blueprint
    | 'discovery'   // Step 2: AI generates search queries from blueprint (skipped if no Serper key)
    | 'fetching'    // Step 3: Fetch and extract web pages (skipped if no Serper key)
    | 'extraction'  // Step 4: Extract mechanics per blueprint + web context
    | 'analysis'    // Step 5: Section-by-section deep analysis (with embedded self-review)
    | 'assembly'    // Step 6: Final Markdown template + filename generation
    | 'complete'
    | null;

// --- Depth level instructions (shared pattern from useAIResearch) ---
const DEPTH_INSTRUCTIONS: Record<GoDeepDepthLevel, string> = {
    beginner: `Write for someone new to this topic. Prioritize clear explanations over jargon. Define technical terms when introduced. Use simple, well-commented code examples. Focus on "what it is" and "why it matters" before "how it works". Avoid assuming prior knowledge.`,
    practitioner: `Write for someone who actively works with this technology. Focus on practical patterns, real-world usage, and working code. Include common pitfalls and how to avoid them. Assume familiarity with fundamentals but explain non-obvious behaviors.`,
    expert: `Write for a deep technical expert. Prioritize internals, implementation trade-offs, edge cases, and production-scale concerns. Include advanced code patterns, performance considerations, and architectural decisions. Skip introductory explanations.`,
};

const DEPTH_LABEL: Record<GoDeepDepthLevel, string> = {
    beginner: 'Beginner',
    practitioner: 'Practitioner',
    expert: 'Expert',
};

// --- Blueprint types ---
interface TechResearchBlueprint {
    primarySources: string[];
    secondarySources: string[];
    coverageAreas: string[];
    keyTerms: string[];
    coreAPIs: string[];   // Named primitives: functions, hooks, classes, APIs (e.g. "useState", "useEffect", "Context API")
}

const DEFAULT_BLUEPRINT: TechResearchBlueprint = {
    primarySources: ['official documentation', 'language/framework specification'],
    secondarySources: ['maintainer blog posts', 'RFC or proposal documents', 'high-signal community discussions'],
    coverageAreas: ['core mechanics', 'implementation patterns', 'common pitfalls', 'usage trade-offs'],
    keyTerms: [],
    coreAPIs: [],
};

// --- Step 1: Scoping Prompt ---
const SCOPING_PROMPT_TEMPLATE = `Analyze this software engineering topic and output a JSON research blueprint only. No other text.

Topic: "{TOPIC}"
Target depth level: {DEPTH_LABEL}

Identify the best sources and coverage areas for a rigorous technical deep-dive at {DEPTH_LABEL} level.

{
  "primarySources": ["<official docs URL or site name>", "<specification or RFC>"],
  "secondarySources": ["<maintainer blog or talk>", "<seminal GitHub issue or PR>", "<trusted technical post>"],
  "coverageAreas": ["<aspect 1>", "<aspect 2>", "<aspect 3>", "<aspect 4>", "<aspect 5>", "<aspect 6>", "<aspect 7>", "<aspect 8>"],
  "keyTerms": ["<key technical term 1>", "<key technical term 2>", "<key technical term 3>"],
  "coreAPIs": ["<named function, hook, class, method, or primitive 1>", "<named item 2>", "<named item 3>", "...list 6–12 of the most important named things a practitioner uses daily"]
}

For coreAPIs: list specific named things a developer actually types or calls — functions, hooks, classes, decorators, CLI commands, config keys (e.g. "useState", "useEffect", "Context API", "useRef", "React.memo", "forwardRef"). Do NOT list themes or categories like "state management" or "lifecycle". Leave coreAPIs empty only if the topic has no discrete named primitives.

For coverageAreas: write each as a section-worthy topic title (e.g. "State Management Patterns", "Server-Side Rendering", "Data Fetching Strategies") — not single-word categories. 4–6 words max per item. Each coverage area will become a dedicated section in the final document.`;

function buildScopingPrompt(topic: string, depthLevel: GoDeepDepthLevel): string {
    return SCOPING_PROMPT_TEMPLATE
        .replaceAll('{TOPIC}', topic)
        .replaceAll('{DEPTH_LABEL}', DEPTH_LABEL[depthLevel]);
}

<<<<<<< origin/Tech_Dissect:src/renderer/hooks/useAITechResearch.ts
function parseBlueprintResponse(text: string): TechResearchBlueprint {
=======
function parseBlueprintResponse(text: string): InsightBlueprint {
    const fromParsed = (parsed: Record<string, unknown>): InsightBlueprint => ({
        primarySources: Array.isArray(parsed.primarySources) ? parsed.primarySources as string[] : DEFAULT_BLUEPRINT.primarySources,
        secondarySources: Array.isArray(parsed.secondarySources) ? parsed.secondarySources as string[] : DEFAULT_BLUEPRINT.secondarySources,
        coverageAreas: Array.isArray(parsed.coverageAreas) ? parsed.coverageAreas as string[] : DEFAULT_BLUEPRINT.coverageAreas,
        keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms as string[] : [],
        coreAPIs: Array.isArray(parsed.coreAPIs) ? parsed.coreAPIs as string[] : [],
    });

>>>>>>> local:src/renderer/hooks/useAIInsightForge.ts
    try {
        const parsed = JSON.parse(text);
        if (parsed.primarySources && parsed.coverageAreas) return fromParsed(parsed);
    } catch { /* fall through */ }

    // Try extracting JSON from code fences or surrounding text
    const jsonMatch = text.match(/\{[\s\S]*?"primarySources"[\s\S]*?"coverageAreas"[\s\S]*?\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.primarySources && parsed.coverageAreas) return fromParsed(parsed);
        } catch { /* fall through */ }
    }

    return DEFAULT_BLUEPRINT;
}

// --- Discovery Prompt (generates search queries from blueprint) ---
const DISCOVERY_PROMPT_TEMPLATE = `Given this technical topic and research blueprint, generate 3–5 Google search queries that will find the best official documentation and primary references.

Topic: "{TOPIC}"
Primary sources to find: {PRIMARY_SOURCES}
Secondary sources: {SECONDARY_SOURCES}
Key terms: {KEY_TERMS}

Output ONLY a JSON array of search query strings. No other text.
Example: ["react useEffect official documentation", "react hooks API reference"]`;

function buildDiscoveryPrompt(topic: string, blueprint: InsightBlueprint): string {
    return DISCOVERY_PROMPT_TEMPLATE
        .replaceAll('{TOPIC}', topic)
        .replaceAll('{PRIMARY_SOURCES}', blueprint.primarySources.join(', '))
        .replaceAll('{SECONDARY_SOURCES}', blueprint.secondarySources.join(', '))
        .replaceAll('{KEY_TERMS}', blueprint.keyTerms.length > 0 ? blueprint.keyTerms.join(', ') : 'as identified from the topic');
}

function parseDiscoveryResponse(text: string, topic: string): string[] {
    // Try direct JSON array
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.every(q => typeof q === 'string')) {
            return parsed.slice(0, 5);
        }
    } catch { /* fall through */ }

    // Try extracting from code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        try {
            const parsed = JSON.parse(fenceMatch[1]);
            if (Array.isArray(parsed)) return parsed.slice(0, 5);
        } catch { /* fall through */ }
    }

    // Try finding array in text
    const arrayMatch = text.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
        try {
            const parsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsed)) return parsed.slice(0, 5);
        } catch { /* fall through */ }
    }

    // Fallback: generate basic queries from the topic
    return [
        `${topic} official documentation`,
        `${topic} API reference`,
        `${topic} guide tutorial`,
    ];
}

// --- Web Search Constants ---
const MAX_SEARCH_QUERIES = 4;
const SEARCH_RESULTS_PER_QUERY = 3;
const MAX_URLS_TO_FETCH = 6;
const FETCH_CONCURRENCY = 3;
const MAX_TOTAL_WEB_CONTEXT = 32768; // 32KB total budget

// Domains that produce no useful technical documentation
const BLOCKED_DOMAINS = new Set([
    'youtube.com', 'www.youtube.com', 'youtu.be',
    'vimeo.com', 'www.vimeo.com',
    'twitch.tv', 'www.twitch.tv',
    'twitter.com', 'www.twitter.com', 'x.com',
    'facebook.com', 'www.facebook.com',
    'instagram.com', 'www.instagram.com',
    'linkedin.com', 'www.linkedin.com',
    'tiktok.com', 'www.tiktok.com',
    'reddit.com', 'www.reddit.com',
    'pinterest.com', 'www.pinterest.com',
    'quora.com', 'www.quora.com',
]);

// File extensions that can't be meaningfully extracted as text
const BLOCKED_EXTENSIONS = ['.pdf', '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.zip', '.tar', '.gz', '.exe'];

function isAllowedUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (BLOCKED_DOMAINS.has(parsed.hostname)) return false;
        const path = parsed.pathname.toLowerCase();
        if (BLOCKED_EXTENSIONS.some(ext => path.endsWith(ext))) return false;

        // Block GitHub issues, PRs, discussions, and changelogs — too specific, not reference material
        if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
            if (/\/(issues|pull|discussions|releases|blob\/.*\/CHANGELOG|blob\/.*\/CHANGES)/.test(path)) return false;
        }

        return true;
    } catch {
        return false;
    }
}

// Higher score = higher priority. Official docs rank first.
function urlPriority(url: string): number {
    try {
        const { hostname, pathname } = new URL(url);
        const host = hostname.toLowerCase();
        const path = pathname.toLowerCase();

        // Tier 1: known official documentation hosts
        if (
            host.startsWith('docs.') ||
            host.startsWith('developer.') ||
            host.startsWith('learn.') ||
            host.startsWith('reference.') ||
            host.startsWith('api.')
        ) return 100;

        // Tier 2: well-known official doc sites
        const tier2 = [
            'reactjs.org', 'react.dev',
            'vuejs.org', 'angular.io', 'angular.dev',
            'svelte.dev',
            'nodejs.org',
            'deno.com', 'deno.land',
            'typescriptlang.org',
            'developer.mozilla.org',
            'web.dev',
            'tc39.es',
            'npmjs.com',
            'pkg.go.dev',
            'docs.rs',
            'crates.io',
            'python.org', 'docs.python.org',
            'rust-lang.org',
            'go.dev',
            'kotlinlang.org',
            'swift.org',
            'ruby-doc.org',
            'rubygems.org',
            'cppreference.com',
            'en.cppreference.com',
        ];
        if (tier2.includes(host)) return 90;

        // Tier 3: official subdomains / paths of major platforms
        if (
            host.endsWith('.github.io') ||
            (host === 'github.com' && path.includes('/blob/')) ||
            host.endsWith('readthedocs.io') ||
            host.endsWith('readthedocs.org') ||
            host.endsWith('.dev') ||
            host.endsWith('.io') && (path.includes('/docs') || path.includes('/reference'))
        ) return 70;

        // Tier 4: general tech content (blogs, wikis, etc.)
        if (
            host === 'stackoverflow.com' ||
            host === 'www.stackoverflow.com' ||
            host === 'en.wikipedia.org' ||
            host === 'www.wikipedia.org'
        ) return 40;

        // Default
        return 50;
    } catch {
        return 0;
    }
}

// --- Step 2: Extraction Prompt ---
const EXTRACTION_PROMPT_TEMPLATE = `You are extracting technical reference material on: "{TOPIC}"

Depth: {DEPTH_LABEL}. {DEPTH_INSTRUCTIONS}

Sources to draw from: {PRIMARY_SOURCES}; {SECONDARY_SOURCES}
{WEB_CONTEXT_SECTION}
Format: bullets only, no narrative prose.

## Part 1 — Coverage Areas
For each coverage area below, write 4–8 bullets covering: core mechanics, key API/config options, known pitfalls, and version notes.

Coverage areas: {COVERAGE_AREAS}
Key terms to define: {KEY_TERMS}
{CORE_APIS_SECTION}
Be thorough. Cover every item listed. Accuracy over brevity.`;

const WEB_CONTEXT_INSTRUCTION = `
---
IMPORTANT: The following content was fetched live from real documentation pages. Treat these as ground truth — they override your training knowledge where they conflict. Extract specific version numbers, API signatures, configuration keys, and behavioral details verbatim from these sources. Do not paraphrase away specifics.

{WEB_CONTEXT}
---
`;

function buildExtractionPrompt(topic: string, blueprint: InsightBlueprint, depthLevel: GoDeepDepthLevel, webContext?: string): string {
    const webSection = webContext
        ? WEB_CONTEXT_INSTRUCTION.replace('{WEB_CONTEXT}', webContext)
        : '';

    const coreAPIsSection = blueprint.coreAPIs.length > 0
        ? `\n## Part 2 — Core APIs & Primitives\nFor each item below, write 3–5 bullets: what it is, its signature or usage pattern, primary use case, and one common pitfall.\n\n${blueprint.coreAPIs.map(api => `- ${api}`).join('\n')}`
        : '';

<<<<<<< origin/Tech_Dissect:src/renderer/hooks/useAITechResearch.ts
function buildExtractionPrompt(topic: string, blueprint: TechResearchBlueprint, depthLevel: GoDeepDepthLevel): string {
=======
>>>>>>> local:src/renderer/hooks/useAIInsightForge.ts
    return EXTRACTION_PROMPT_TEMPLATE
        .replaceAll('{TOPIC}', topic)
        .replaceAll('{DEPTH_LABEL}', DEPTH_LABEL[depthLevel])
        .replaceAll('{DEPTH_INSTRUCTIONS}', DEPTH_INSTRUCTIONS[depthLevel])
        .replaceAll('{PRIMARY_SOURCES}', blueprint.primarySources.join(', '))
        .replaceAll('{SECONDARY_SOURCES}', blueprint.secondarySources.join(', '))
        .replaceAll('{COVERAGE_AREAS}', blueprint.coverageAreas.join(', '))
        .replaceAll('{KEY_TERMS}', blueprint.keyTerms.length > 0 ? blueprint.keyTerms.join(', ') : 'as identified from the topic')
        .replaceAll('{WEB_CONTEXT_SECTION}', webSection)
        .replaceAll('{CORE_APIS_SECTION}', coreAPIsSection);
}

// --- Step 3: Analysis + Self-Review Prompt (merged) ---
// Note: The neutrality gate (originally Step 4) is embedded here as a final self-review
// instruction to avoid sending ~50K chars back as input to a separate review request.
const ANALYSIS_PROMPT_TEMPLATE = `You are writing a technical deep-dive document on: "{TOPIC}"

Depth: {DEPTH_LABEL}. {DEPTH_INSTRUCTIONS}
{WEB_SOURCES_SECTION}
Reference material (bullet summaries per coverage area):
{EXTRACTED_CONTENT}

---

Write the document sections below in the exact order given. Use the exact headings shown. Ground every claim in the reference material.

---

## Overview
150–200 words. What this technology is and the specific problem it solves. No code examples here.

## Essentials
CONDITIONAL: Omit this section entirely — including its heading — if the core APIs list below says "(none)". When present: first write a 2–3 sentence introductory paragraph that collectively describes what these primitives are, how they relate to each other, and why a developer encounters them first — before any ### subheadings. Then write one ### subheading per API. For each: one-sentence description, its usage pattern as inline code, one working code example at {DEPTH_LABEL} level, and one concrete pitfall with observable symptom. 50–80 words per API entry.

Core APIs:
{CORE_APIS_LIST}

## How It Works
300–400 words. Internal model, data flow, lifecycle — the systems explanation of how the pieces interact. Not an API listing.

---

DYNAMIC SECTIONS — write one ## section for each item below, in order. Convert each phrase into a title-cased section heading (4–6 words). Write 250–400 words per section grounded in the reference material. Do not add Overview, Essentials, How It Works, Common Pitfalls & Failure Modes, or Ecosystem & Tooling here.

{COVERAGE_AREAS}

---

## Common Pitfalls & Failure Modes
250–350 words. What breaks, observable symptoms, and concrete fixes. Avoid generic advice — every pitfall needs a symptom or a fix.

## Ecosystem & Tooling
200–300 words. Adjacent tools, typical pairings, and architectural fit.

---

Before outputting, apply this self-review:
- Replace any superiority claims with scenario-based framing
- Ensure every pitfall includes a concrete symptom or solution
- Add "(verify against current docs)" to any version-specific claim you're uncertain about

Do NOT include a Curated Resources section. Do NOT include a document title heading.`;

function buildAnalysisPrompt(
    topic: string,
    extractedContent: string,
    depthLevel: GoDeepDepthLevel,
    coverageAreas: string[],
    coreAPIs: string[],
    webSources?: { title: string; url: string }[],
): string {
    const webSourcesSection = webSources && webSources.length > 0
        ? `These real documentation pages were fetched and used as primary sources for the reference material above. Where you have specific facts, version numbers, or API details from these sources, reflect them faithfully in your writing — do not generalize or replace them with training knowledge:\n${webSources.map(s => `- ${s.title} (${s.url})`).join('\n')}\n`
        : '';

    const effectiveCoverageAreas = coverageAreas.length > 0 ? coverageAreas : DEFAULT_BLUEPRINT.coverageAreas;
    const coverageAreasList = effectiveCoverageAreas.map((area, i) => `${i + 1}. ${area}`).join('\n');

    const coreApisList = coreAPIs.length >= 2
        ? coreAPIs.map(api => `- ${api}`).join('\n')
        : '(none — omit Essentials section entirely)';

    return ANALYSIS_PROMPT_TEMPLATE
        .replaceAll('{TOPIC}', topic)
        .replaceAll('{DEPTH_LABEL}', DEPTH_LABEL[depthLevel])
        .replaceAll('{DEPTH_INSTRUCTIONS}', DEPTH_INSTRUCTIONS[depthLevel])
        .replaceAll('{WEB_SOURCES_SECTION}', webSourcesSection)
        .replaceAll('{EXTRACTED_CONTENT}', extractedContent)
        .replaceAll('{COVERAGE_AREAS}', coverageAreasList)
        .replaceAll('{CORE_APIS_LIST}', coreApisList);
}

// --- Step 5: Assembly Prompt ---
const ASSEMBLY_PROMPT_TEMPLATE = `You are assembling the final Tech Research document on: "{TOPIC}"

Depth level: {DEPTH_LABEL}

You have two tasks:

**Task 1: Curated Resources**
Generate 5–8 curated resource links for this topic. Each must have a one-sentence annotation describing its value. Prioritize:
- Official documentation (primary reference)
- Maintainer or core team technical writing
- Specification, RFC, or proposal document
- Practical implementation deep-dive
- High-signal community discussion (e.g. GitHub issue, StackOverflow canonical answer)

Format as:
- [Resource Title](url) – one-sentence value description

**Task 2: Final Assembly**
Assemble the complete document using this exact template. Replace the draft content into the correct sections and append the Curated Resources section at the end.

First, derive a SHORT_TOPIC: the core subject in 1–3 words (e.g. "React", "Angular", "useEffect", "C Memory Management", "Hasura GraphQL Auth"). Strip filler words like "Help me understand", "How to use", "Introduction to", etc.

Output the complete assembled document as JSON with this structure (and nothing else):
{
  "content": "<full markdown document>",
  "filename": "<kebab-case-filename-max-60-chars>"
}

Filename rules: kebab-case, max 60 characters, no extension, descriptive (e.g. "react-useeffect-deep-dive", "hasura-graphql-authentication"). The filename will have .md appended automatically.

**Document template to follow exactly (replace SHORT_TOPIC with your derived short topic):**

Note: "Essentials" is conditional — include it only if it appears in the draft. "Dynamic sections" means all sections that appear between "How It Works" and "Common Pitfalls & Failure Modes" in the draft — preserve them verbatim, in order.

# SHORT_TOPIC

## Overview
[content from draft]

## Essentials
[content from draft — omit this heading and section entirely if not present in draft]

## How It Works
[content from draft]

[DYNAMIC SECTIONS: Insert all topic-specific sections from the draft here, in the exact order they appear. Preserve their headings and content verbatim. Do not rename, reorder, merge, or omit any of them.]

## Common Pitfalls & Failure Modes
[content from draft]

## Ecosystem & Tooling
[content from draft]

## Curated Resources
[generated links from Task 1]

---
*Generated by Tech Research · Depth: {DEPTH_LABEL}*

**Reviewed draft to assemble:**
{REVIEWED_CONTENT}`;

function buildAssemblyPrompt(topic: string, reviewedContent: string, depthLevel: GoDeepDepthLevel): string {
    return ASSEMBLY_PROMPT_TEMPLATE
        .replaceAll('{TOPIC}', topic)
        .replaceAll('{DEPTH_LABEL}', DEPTH_LABEL[depthLevel])
        .replaceAll('{REVIEWED_CONTENT}', reviewedContent);
}

interface AssemblyResult {
    content: string;
    filename: string;
}

function parseAssemblyResponse(text: string, topic: string): AssemblyResult {
    // Strategy 1: pure JSON
    try {
        const parsed = JSON.parse(text);
        if (parsed.content && parsed.filename) {
            return { content: parsed.content as string, filename: parsed.filename as string };
        }
    } catch { /* fall through */ }

    // Strategy 2: strip markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        try {
            const parsed = JSON.parse(fenceMatch[1]);
            if (parsed.content && parsed.filename) {
                return { content: parsed.content as string, filename: parsed.filename as string };
            }
        } catch { /* fall through */ }
    }

    // Strategy 3: find first '{' and last '}' in the response
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
            if (parsed.content && parsed.filename) {
                return { content: parsed.content as string, filename: parsed.filename as string };
            }
        } catch { /* fall through */ }
    }

    // Fallback: use the text as-is with a generated filename
    const slug = topic.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 55);
    return {
        content: text,
        filename: `${slug}-insight-forge`,
    };
}

function sanitizeFilename(raw: string): string {
    let name = raw.trim();
    name = name.replace(/^["']|["']$/g, '');
    name = name.replace(/\.\w+$/, '');
    name = name.replace(/[/\\:*?"<>|]/g, '');
    name = name.replace(/\s+/g, '-');
    name = name.toLowerCase();
    if (name.length > 60) {
        name = name.substring(0, 60).replace(/-+$/, '');
    }
    return name;
}

// --- IPC helper (same as useAIResearch) ---
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

const EXTRACTION_MAX_TOKENS = 8192;  // Bullet summaries — Part 1 (coverage areas) + Part 2 (core APIs)
const ANALYSIS_MAX_TOKENS = 16384;   // Full 7-section draft with self-review
const ASSEMBLY_MAX_TOKENS = 16384;   // Final template + resources + filename

// --- Hook ---
export function useAITechResearch() {
    const dispatch = useEditorDispatch();
    const state = useEditorState();

<<<<<<< origin/Tech_Dissect:src/renderer/hooks/useAITechResearch.ts
    const [isTechResearchLoading, setIsTechResearchLoading] = useState(false);
    const [techResearchError, setTechResearchError] = useState<string | null>(null);
    const [techResearchPhase, setTechResearchPhase] = useState<TechResearchPhase>(null);
    const [techResearchComplete, setTechResearchComplete] = useState(false);
    const [techResearchFileName, setTechResearchFileName] = useState<string | null>(null);
=======
    const [isInsightForgeLoading, setIsInsightForgeLoading] = useState(false);
    const [insightForgeError, setInsightForgeError] = useState<string | null>(null);
    const [insightForgePhase, setInsightForgePhase] = useState<InsightForgePhase>(null);
    const [insightForgeComplete, setInsightForgeComplete] = useState(false);
    const [insightForgeFileName, setInsightForgeFileName] = useState<string | null>(null);
    const [sourceFetchProgress, setSourceFetchProgress] = useState<SourceFetchProgress[]>([]);
    const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
>>>>>>> local:src/renderer/hooks/useAIInsightForge.ts
    const activeRequestIdRef = useRef<string | null>(null);
    const defaultLineEndingRef = useRef(state.config.defaultLineEnding);
    defaultLineEndingRef.current = state.config.defaultLineEnding;


    const submitTechResearch = useCallback(async (
        query: string,
        provider: AIProvider,
        model: string,
        requestId: string,
        depthLevel: GoDeepDepthLevel = 'practitioner',
    ) => {
        if (!query.trim()) {
            throw new Error('Please enter a topic for Tech Research');
        }

        activeRequestIdRef.current = requestId;
<<<<<<< origin/Tech_Dissect:src/renderer/hooks/useAITechResearch.ts
        setIsTechResearchLoading(true);
        setTechResearchError(null);
        setTechResearchComplete(false);
        setTechResearchFileName(null);
=======
        setIsInsightForgeLoading(true);
        setInsightForgeError(null);
        setInsightForgeComplete(false);
        setInsightForgeFileName(null);
        setSourceFetchProgress([]);
        setIsWebSearchEnabled(false);
>>>>>>> local:src/renderer/hooks/useAIInsightForge.ts

        const startTime = Date.now();
        console.log('[TechResearch] Starting', { query, provider, model, requestId, depthLevel });

        try {
            // ── Step 1: Scoping ──────────────────────────────────────────────────────
            setTechResearchPhase('scoping');
            let blueprint: TechResearchBlueprint = DEFAULT_BLUEPRINT;

            const scopingMessages = [{
                role: 'user' as const,
                content: buildScopingPrompt(query, depthLevel),
            }];

            console.log('[TechResearch] Phase: scoping — calling API');
            const scopingResponse = await callChatApi(
                provider, scopingMessages, model, `${requestId}-scoping`
            );

            if (activeRequestIdRef.current !== requestId) return;

            if (scopingResponse.success && scopingResponse.response) {
                blueprint = parseBlueprintResponse(scopingResponse.response);
                console.log('[TechResearch] Scoping complete', {
                    elapsed: Date.now() - startTime,
                    blueprint,
                });
            } else {
                console.log('[TechResearch] Scoping failed, using defaults', {
                    elapsed: Date.now() - startTime,
                    error: scopingResponse.error,
                });
            }

<<<<<<< origin/Tech_Dissect:src/renderer/hooks/useAITechResearch.ts
            // ── Step 2: Extraction ───────────────────────────────────────────────────
            // WEB_SEARCH_PLACEHOLDER_START
            // Future: This step will integrate a web search API (e.g., Brave Search, Serper)
            // to fetch live content from blueprint.primarySources and inject extracted text here.
            // For now, the AI uses its training knowledge for source extraction.
            // WEB_SEARCH_PLACEHOLDER_END
            setTechResearchPhase('extraction');
=======
            // ── Step 2 & 3: Discovery + Fetching (conditional on Serper key) ────────
            let webContext = '';
            let webSources: { title: string; url: string }[] = [];

            const hasSerper = await window.electronAPI.hasSerperKey();
            if (activeRequestIdRef.current !== requestId) return;

            if (hasSerper) {
                setIsWebSearchEnabled(true);

                // ── Discovery: AI generates search queries ──
                setInsightForgePhase('discovery');
                console.log('[InsightForge] Phase: discovery — generating search queries');

                const discoveryMessages = [{
                    role: 'user' as const,
                    content: buildDiscoveryPrompt(query, blueprint),
                }];

                const discoveryResponse = await callChatApi(
                    provider, discoveryMessages, model, `${requestId}-discovery`
                );

                if (activeRequestIdRef.current !== requestId) return;

                let searchQueries: string[];
                if (discoveryResponse.success && discoveryResponse.response) {
                    searchQueries = parseDiscoveryResponse(discoveryResponse.response, query);
                } else {
                    searchQueries = [
                        `${query} official documentation`,
                        `${query} API reference`,
                        `${query} guide`,
                    ];
                }

                console.log('[InsightForge] Discovery complete', {
                    elapsed: Date.now() - startTime,
                    queries: searchQueries,
                });

                // ── Execute searches ──
                const allUrls = new Map<string, { title: string; snippet: string }>();
                const queriesToRun = searchQueries.slice(0, MAX_SEARCH_QUERIES);

                for (const sq of queriesToRun) {
                    if (activeRequestIdRef.current !== requestId) return;
                    const searchResult = await window.electronAPI.webSearch(
                        sq, SEARCH_RESULTS_PER_QUERY, `${requestId}-search`
                    );
                    if (searchResult.success && searchResult.results) {
                        for (const r of searchResult.results) {
                            if (!allUrls.has(r.link) && isAllowedUrl(r.link)) {
                                allUrls.set(r.link, { title: r.title, snippet: r.snippet });
                            }
                        }
                    }
                }

                console.log('[InsightForge] Search complete', {
                    elapsed: Date.now() - startTime,
                    uniqueUrls: allUrls.size,
                });

                // ── Fetching: download and extract pages ──
                if (allUrls.size > 0) {
                    setInsightForgePhase('fetching');

                    const urlsToFetch = Array.from(allUrls.entries())
                    .sort(([a], [b]) => urlPriority(b) - urlPriority(a))
                    .slice(0, MAX_URLS_TO_FETCH);

                    // Initialize progress for all URLs
                    const initialProgress: SourceFetchProgress[] = urlsToFetch.map(([url, meta]) => ({
                        url,
                        title: meta.title,
                        status: 'pending' as const,
                    }));
                    setSourceFetchProgress(initialProgress);

                    const fetchedPages: { url: string; title: string; markdown: string; byteSize: number }[] = [];
                    let totalBytes = 0;

                    // Fetch in batches of FETCH_CONCURRENCY
                    for (let i = 0; i < urlsToFetch.length; i += FETCH_CONCURRENCY) {
                        if (activeRequestIdRef.current !== requestId) return;

                        const batch = urlsToFetch.slice(i, i + FETCH_CONCURRENCY);

                        // Mark batch as fetching
                        setSourceFetchProgress(prev => prev.map(p => {
                            const inBatch = batch.some(([url]) => url === p.url);
                            return inBatch ? { ...p, status: 'fetching' as const } : p;
                        }));

                        const batchResults = await Promise.all(
                            batch.map(([url]) =>
                                window.electronAPI.webFetchPage(url, `${requestId}-fetch`)
                            )
                        );

                        // Update progress with results
                        setSourceFetchProgress(prev => prev.map(p => {
                            const batchIdx = batch.findIndex(([url]) => url === p.url);
                            if (batchIdx === -1) return p;
                            const result = batchResults[batchIdx];
                            if (result.success && result.markdown) {
                                return {
                                    ...p,
                                    status: 'done' as const,
                                    title: result.title || p.title,
                                    byteSize: result.byteSize,
                                };
                            }
                            return {
                                ...p,
                                status: 'failed' as const,
                                error: result.error || 'Unknown error',
                            };
                        }));

                        // Collect successful results within budget
                        for (const result of batchResults) {
                            if (result.success && result.markdown && totalBytes < MAX_TOTAL_WEB_CONTEXT) {
                                const remaining = MAX_TOTAL_WEB_CONTEXT - totalBytes;
                                const content = result.markdown.length > remaining
                                    ? result.markdown.substring(0, remaining) + '\n[... truncated]'
                                    : result.markdown;
                                fetchedPages.push({
                                    url: result.url,
                                    title: result.title || result.url,
                                    markdown: content,
                                    byteSize: content.length,
                                });
                                totalBytes += content.length;
                            }
                        }
                    }

                    // Build web context string
                    if (fetchedPages.length > 0) {
                        webContext = fetchedPages.map(p =>
                            `[WEB SOURCE: ${p.title} (${p.url})]\n${p.markdown}\n[END SOURCE]`
                        ).join('\n\n');
                        webSources = fetchedPages.map(p => ({ title: p.title, url: p.url }));
                    }

                    console.log('[InsightForge] Fetching complete', {
                        elapsed: Date.now() - startTime,
                        pagesUsed: fetchedPages.length,
                        totalBytes,
                    });
                }
            }

            // ── Step 4: Extraction ───────────────────────────────────────────────────
            setInsightForgePhase('extraction');
>>>>>>> local:src/renderer/hooks/useAIInsightForge.ts

            const extractionMessages = [{
                role: 'user' as const,
                content: buildExtractionPrompt(query, blueprint, depthLevel, webContext || undefined),
            }];

            console.log('[TechResearch] Phase: extraction — calling API');
            const extractionResult = await callWithContinuation(
                callChatApi, provider, extractionMessages, model,
                `${requestId}-extraction`, '[TechResearch]', EXTRACTION_MAX_TOKENS
            );

            if (activeRequestIdRef.current !== requestId) return;

            const extractedContent = extractionResult.content;
            console.log('[TechResearch] Extraction complete', {
                elapsed: Date.now() - startTime,
                contentLength: extractedContent.length,
                continuations: extractionResult.continuations,
            });

            // ── Step 3: Analysis ─────────────────────────────────────────────────────
            setTechResearchPhase('analysis');

            const analysisMessages = [{
                role: 'user' as const,
                content: buildAnalysisPrompt(
                    query,
                    extractedContent,
                    depthLevel,
                    blueprint.coverageAreas,
                    blueprint.coreAPIs,
                    webSources.length > 0 ? webSources : undefined,
                ),
            }];

            console.log('[TechResearch] Phase: analysis — calling API');
            const analysisResult = await callWithContinuation(
                callChatApi, provider, analysisMessages, model,
                `${requestId}-analysis`, '[TechResearch]', ANALYSIS_MAX_TOKENS
            );

            if (activeRequestIdRef.current !== requestId) return;

            const draftContent = closeUnclosedFences(analysisResult.content);
            console.log('[TechResearch] Analysis complete', {
                elapsed: Date.now() - startTime,
                contentLength: draftContent.length,
                continuations: analysisResult.continuations,
            });

            // ── Step 4: Assembly ─────────────────────────────────────────────────────
            setTechResearchPhase('assembly');

            const assemblyMessages = [{
                role: 'user' as const,
                content: buildAssemblyPrompt(query, draftContent, depthLevel),
            }];

            console.log('[TechResearch] Phase: assembly — calling API');
            const assemblyResult = await callWithContinuation(
                callChatApi, provider, assemblyMessages, model,
                `${requestId}-assembly`, '[TechResearch]', ASSEMBLY_MAX_TOKENS
            );

            if (activeRequestIdRef.current !== requestId) return;

            const { content: finalContent, filename: rawFilename } = parseAssemblyResponse(
                assemblyResult.content,
                query
            );

            const sanitizedFilename = sanitizeFilename(rawFilename);
            const fileName = sanitizedFilename.length > 0
                ? `${sanitizedFilename}.md`
                : `tech-research-${query.toLowerCase().replace(/\s+/g, '-').substring(0, 40)}.md`;

            console.log('[TechResearch] Assembly complete', {
                elapsed: Date.now() - startTime,
                contentLength: finalContent.length,
                fileName,
                continuations: assemblyResult.continuations,
            });

            // ── Open new file tab ────────────────────────────────────────────────────
            const fileId = generateId();
            dispatch({
                type: 'OPEN_FILE',
                payload: {
                    id: fileId,
                    path: null,
                    name: fileName,
                    content: finalContent,
                    lineEnding: defaultLineEndingRef.current,
                    viewMode: 'preview' as const,
                    fileType: 'markdown' as const,
                },
            });

            setTechResearchFileName(fileName);
            setTechResearchPhase('complete');
            setTechResearchComplete(true);

            console.log('[TechResearch] Complete', {
                totalElapsed: Date.now() - startTime,
                fileName,
            });
        } catch (err) {
            if (activeRequestIdRef.current !== requestId) return;
            const message = err instanceof Error ? err.message : 'Tech Research request failed';
            console.error('[TechResearch] Error', {
                phase: techResearchPhase,
                elapsed: Date.now() - startTime,
                error: message,
            });
            setTechResearchError(message);
            setTechResearchPhase(null);
            setTechResearchComplete(false);
            throw err;
        } finally {
            if (activeRequestIdRef.current === requestId) {
                activeRequestIdRef.current = null;
                setIsTechResearchLoading(false);
            }
        }
    }, [dispatch]);

    const dismissTechResearchProgress = useCallback(() => {
        setTechResearchPhase(null);
        setTechResearchComplete(false);
        setTechResearchFileName(null);
    }, []);

    const cancelTechResearch = useCallback(async () => {
        const requestId = activeRequestIdRef.current;
        activeRequestIdRef.current = null;
        setIsTechResearchLoading(false);
        setTechResearchPhase(null);
        setTechResearchComplete(false);
        setTechResearchFileName(null);
        setTechResearchError('Tech Research request canceled');

        if (requestId) {
<<<<<<< origin/Tech_Dissect:src/renderer/hooks/useAITechResearch.ts
            console.log('[TechResearch] Canceling', { requestId });
            for (const step of ['scoping', 'extraction', 'analysis', 'assembly']) {
=======
            console.log('[InsightForge] Canceling', { requestId });
            for (const step of ['scoping', 'discovery', 'extraction', 'analysis', 'assembly']) {
>>>>>>> local:src/renderer/hooks/useAIInsightForge.ts
                for (const suffix of ['', '-cont-1', '-cont-2', '-cont-3']) {
                    try {
                        await window.electronAPI.cancelAIChatRequest(`${requestId}-${step}${suffix}`);
                    } catch { /* ignore */ }
                }
            }
            // Cancel web search/fetch sub-requests
            for (const subReq of ['search', 'fetch']) {
                try {
                    await window.electronAPI.cancelAIChatRequest(`${requestId}-${subReq}`);
                } catch { /* ignore */ }
            }
        }
    }, []);

    return {
<<<<<<< origin/Tech_Dissect:src/renderer/hooks/useAITechResearch.ts
        submitTechResearch,
        cancelTechResearch,
        dismissTechResearchProgress,
        isTechResearchLoading,
        techResearchError,
        techResearchPhase,
        techResearchComplete,
        techResearchFileName,
=======
        submitInsightForge,
        cancelInsightForge,
        dismissInsightForgeProgress,
        isInsightForgeLoading,
        insightForgeError,
        insightForgePhase,
        insightForgeComplete,
        insightForgeFileName,
        sourceFetchProgress,
        isWebSearchEnabled,
>>>>>>> local:src/renderer/hooks/useAIInsightForge.ts
    };
}
