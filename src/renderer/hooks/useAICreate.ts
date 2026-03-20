import { useState, useCallback, useRef } from 'react';
import { useEditorDispatch, useEditorState } from '../contexts/EditorContext';
import type { AIProvider } from './useAIChat';
import { callProviderApi } from '../utils/callProviderApi';
import { callWithContinuation } from '../utils/callWithContinuation';
import type { AttachedFile } from '../components/FileAttachmentsList';
import type { IFile } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 11);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatePhase =
    | 'analyzing'   // Phase 0: Intent Analysis
    | 'researching' // Phase 1: Multi-query search + page fetch + synthesis
    | 'outlining'   // Phase 2: Outline Generation
    | 'creating'    // Phase 3: Write
    | 'reviewing'   // Phase 4: Review
    | 'naming'      // Phase 5: Name
    | 'complete'
    | null;

interface IntentAnalysis {
    documentType: string;
    topics: string[];
    searchQueries: string[];
    suggestedSections: string[];
    tone: string;
    depth: string;
    needsCurrentData: boolean;
}

const DEFAULT_INTENT: IntentAnalysis = {
    documentType: 'other',
    topics: [],
    searchQueries: [],
    suggestedSections: [],
    tone: 'conversational',
    depth: 'moderate',
    needsCurrentData: false,
};

// ---------------------------------------------------------------------------
// Phase 0 — Intent Analysis Prompt
// ---------------------------------------------------------------------------

const INTENT_ANALYSIS_PROMPT = `Analyze this document creation request and return a JSON object.

Request: "{REQUEST}"

Return ONLY a JSON object with no other text:
{
  "documentType": "one of: blog_post, technical_doc, readme, report, spec, tutorial, guide, letter, essay, creative, list, comparison, other",
  "topics": ["array of 2-5 specific topics/entities to research"],
  "searchQueries": ["array of 2-4 optimized web search queries if research would help, empty array if not needed"],
  "suggestedSections": ["array of 3-8 section headings that would make sense for this document"],
  "tone": "one of: technical, casual, formal, academic, conversational, instructional",
  "depth": "one of: overview, moderate, comprehensive",
  "needsCurrentData": true or false
}`;

// ---------------------------------------------------------------------------
// Phase 1c — Research Synthesis Prompt
// ---------------------------------------------------------------------------

const RESEARCH_SYNTHESIS_PROMPT = `You are a research assistant preparing notes for a content writer.

Document being created: "{REQUEST}"
Document type: {DOCUMENT_TYPE}

Below are web search results and page content gathered from multiple queries. Your job is to:
1. Extract the most relevant facts, data points, examples, and insights
2. Organize them by topic/theme
3. Note any conflicting information or areas of uncertainty
4. Identify the most authoritative sources
5. Flag any statistics, quotes, or specific claims with their source

Format your notes as a structured reference document the writer can draw from.
Do NOT write the final document — only prepare organized research notes.

Search Results and Page Content:
{RESEARCH_CONTENT}`;

// ---------------------------------------------------------------------------
// Phase 2 — Outline Prompt
// ---------------------------------------------------------------------------

const OUTLINE_PROMPT = `Create a detailed outline for the following document.

**Document Type:** {DOCUMENT_TYPE}
**User Request:** "{REQUEST}"
**Tone:** {TONE}
**Depth:** {DEPTH}

{RESEARCH_SECTION}

{FILE_CONTEXT_SECTION}

Create a comprehensive Markdown outline with:
- Document title
- All section headings (H2, H3 as needed)
- 2-3 bullet points per section describing what should be covered
- Notes on where specific research findings should be incorporated

Return ONLY the outline in Markdown format. Do not write the full document.`;

// ---------------------------------------------------------------------------
// Phase 4 — Review Prompt
// ---------------------------------------------------------------------------

const REVIEW_PROMPT = `Review this document against the original creation request.

**Original Request:** "{REQUEST}"

**Document Outline:**
{OUTLINE}

**Generated Document:**
{DOCUMENT}

Check for:
1. Does the document address everything the user asked for?
2. Are any outline sections missing or significantly underdeveloped?
3. Are there any factual claims that aren't supported by the research?
4. Is the document internally consistent?

If everything looks complete, respond with: {"complete": true}
If there are gaps, respond with:
{
  "complete": false,
  "gaps": ["description of each gap"],
  "suggestedAdditions": "Markdown content to append"
}

Return ONLY the JSON response.`;

// ---------------------------------------------------------------------------
// Phase 5 — Naming Prompt
// ---------------------------------------------------------------------------

const NAMING_PROMPT_TEMPLATE = `Generate a short, descriptive filename for this document.

Content summary: {REQUEST}
Document type: {DOCUMENT_TYPE}

Rules:
- Title Case words, spaces allowed (e.g. "React Hooks Guide", "API Design Spec")
- Max 30 characters, no file extension
- Focus on the content topic, be descriptive but concise
- Return ONLY the filename, nothing else`;

// ---------------------------------------------------------------------------
// Type-Specific Writing Instructions
// ---------------------------------------------------------------------------

const TYPE_SPECIFIC_INSTRUCTIONS: Record<string, string> = {
    blog_post: 'Include an engaging introduction with a hook. Use subheadings for scannability. End with a conclusion or call-to-action. Aim for a conversational yet authoritative voice.',
    technical_doc: 'Be precise and specific. Include code examples where relevant. Define technical terms on first use. Use tables for comparisons and specifications.',
    readme: 'Follow the standard README structure: title, description, installation, usage, configuration, API/features, contributing, license. Include code snippets for all commands.',
    report: 'Start with an executive summary. Use data and evidence to support conclusions. Include a methodology section if applicable. End with recommendations or next steps.',
    spec: 'Start with an overview and goals. Define terminology. Use numbered requirements. Include acceptance criteria. Cover edge cases and constraints.',
    tutorial: 'Structure as sequential steps. Explain the "why" not just the "how". Include expected output for each step. Anticipate common mistakes and address them.',
    guide: 'Organize from fundamentals to advanced topics. Include practical examples throughout. Add a "quick reference" or "cheat sheet" section.',
    letter: 'Use appropriate salutation and closing. Maintain consistent tone. Be clear about the purpose in the opening paragraph.',
    essay: 'Start with a compelling thesis. Use evidence and examples to support arguments. Include counterpoints. End with a strong conclusion.',
    creative: 'Focus on voice, imagery, and narrative. Let the tone match the genre. Prioritize engagement and emotional resonance.',
    list: 'Use clear, consistent formatting. Order items logically. Include brief descriptions for each item.',
    comparison: 'Use consistent evaluation criteria across all items. Include a summary comparison table. Provide a balanced assessment with clear pros and cons for each option.',
    other: 'Be thorough, well-structured, and creative. Match the tone and style implied by the request.',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CREATING_MAX_TOKENS = 16384;
const MAX_PAGE_CONTENT_CHARS = 4000;
const REVIEW_MIN_CHARS = 2500; // ~500 words

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

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

function parseIntentAnalysis(raw: string): IntentAnalysis {
    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return DEFAULT_INTENT;

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            documentType: parsed.documentType || DEFAULT_INTENT.documentType,
            topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : DEFAULT_INTENT.topics,
            searchQueries: Array.isArray(parsed.searchQueries) ? parsed.searchQueries.slice(0, 4) : DEFAULT_INTENT.searchQueries,
            suggestedSections: Array.isArray(parsed.suggestedSections) ? parsed.suggestedSections.slice(0, 8) : DEFAULT_INTENT.suggestedSections,
            tone: parsed.tone || DEFAULT_INTENT.tone,
            depth: parsed.depth || DEFAULT_INTENT.depth,
            needsCurrentData: typeof parsed.needsCurrentData === 'boolean' ? parsed.needsCurrentData : DEFAULT_INTENT.needsCurrentData,
        };
    } catch {
        return DEFAULT_INTENT;
    }
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/** Deduplicate results by domain (max 2 per domain), take top 8 */
function diversifyResults(
    results: Array<{ title: string; snippet: string; link: string }>,
): Array<{ title: string; snippet: string; link: string }> {
    const domainCount: Record<string, number> = {};
    return results.filter(r => {
        const domain = extractDomain(r.link);
        domainCount[domain] = (domainCount[domain] || 0) + 1;
        return domainCount[domain] <= 2;
    }).slice(0, 8);
}

function getTypeInstructions(documentType: string): string {
    return TYPE_SPECIFIC_INSTRUCTIONS[documentType] || TYPE_SPECIFIC_INSTRUCTIONS.other;
}

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

function buildIntentPrompt(request: string): string {
    return INTENT_ANALYSIS_PROMPT.replace('{REQUEST}', request);
}

function buildSynthesisPrompt(request: string, documentType: string, researchContent: string): string {
    return RESEARCH_SYNTHESIS_PROMPT
        .replace('{REQUEST}', request)
        .replace('{DOCUMENT_TYPE}', documentType)
        .replace('{RESEARCH_CONTENT}', researchContent);
}

function buildOutlinePrompt(
    request: string,
    documentType: string,
    tone: string,
    depth: string,
    researchNotes: string,
    fileContext: string,
): string {
    const researchSection = researchNotes
        ? `**Research Notes:**\n${researchNotes}`
        : '';
    const fileContextSection = fileContext.trim()
        ? `**Reference Files:**\n${fileContext}`
        : '';

    return OUTLINE_PROMPT
        .replace('{DOCUMENT_TYPE}', documentType)
        .replace('{REQUEST}', request)
        .replace('{TONE}', tone)
        .replace('{DEPTH}', depth)
        .replace('{RESEARCH_SECTION}', researchSection)
        .replace('{FILE_CONTEXT_SECTION}', fileContextSection);
}

function buildCreatingPrompt(
    request: string,
    documentType: string,
    tone: string,
    outline: string | null,
    researchNotes: string | null,
    fileContext: string,
): string {
    const parts: string[] = [];

    parts.push('You are an expert content creator. Generate a complete, publication-ready Markdown document.');
    parts.push('');
    parts.push(`**Document Type:** ${documentType}`);
    parts.push(`**Tone:** ${tone}`);
    parts.push(`**User Request:** "${request}"`);

    if (outline) {
        parts.push('');
        parts.push('**Document Outline:**');
        parts.push(outline);
    }

    if (researchNotes) {
        parts.push('');
        parts.push('**Research Notes (use these to inform your writing — cite specific facts and data):**');
        parts.push(researchNotes);
    }

    if (fileContext.trim()) {
        parts.push('');
        parts.push('**Reference Files:**');
        parts.push(fileContext);
    }

    parts.push('');
    parts.push('**Writing Guidelines:**');

    if (outline) {
        parts.push('- Follow the outline structure closely — cover every section');
        parts.push('- Integrate research findings naturally, citing specific data points when available');
    } else {
        parts.push('- Create a well-structured document with clear sections and logical flow');
    }

    parts.push(`- Match the ${tone} tone throughout`);
    parts.push('- Use proper Markdown formatting: headings, lists, code blocks, tables, bold/italic as appropriate');
    parts.push(`- ${getTypeInstructions(documentType)}`);
    parts.push('- Produce a complete, standalone document — not a skeleton or summary');
    parts.push('- Do not include meta-commentary about the request — just produce the content directly');

    if (researchNotes) {
        parts.push('- When incorporating facts or data from research, include natural attributions like "According to [Source]..." or "A 2025 study found that..."');
    }

    return parts.join('\n');
}

function buildReviewPrompt(request: string, outline: string, document: string): string {
    return REVIEW_PROMPT
        .replace('{REQUEST}', request)
        .replace('{OUTLINE}', outline)
        .replace('{DOCUMENT}', document);
}

function buildNamingPrompt(request: string, documentType: string): string {
    return NAMING_PROMPT_TEMPLATE
        .replace('{REQUEST}', request)
        .replace('{DOCUMENT_TYPE}', documentType);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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
        webSearchEnabled?: boolean,
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
        const isDeepCreate = !!webSearchEnabled;
        console.log('[Create] Starting', { request, provider, model, requestId, isDeepCreate });

        const fileContext = buildFileContextFromOpenFiles(attachedFiles, openFilesRef.current);

        try {
            // ── Phase 0: Intent Analysis ──────────────────────────────────────
            setCreatePhase('analyzing');
            currentPhaseForError = 'analyzing';

            let intent: IntentAnalysis = DEFAULT_INTENT;
            try {
                const intentMessages = [{
                    role: 'user' as const,
                    content: buildIntentPrompt(request),
                }];

                console.log('[Create] Phase 0: Intent Analysis');
                const intentResponse = await callProviderApi(
                    provider, intentMessages, model, `${requestId}-analyzing`,
                );

                if (activeRequestIdRef.current !== requestId) return;

                if (intentResponse.success && intentResponse.response) {
                    intent = parseIntentAnalysis(intentResponse.response);
                }

                console.log('[Create] Intent analysis complete', {
                    elapsed: Date.now() - startTime,
                    documentType: intent.documentType,
                    tone: intent.tone,
                    queryCount: intent.searchQueries.length,
                });
            } catch (err) {
                console.warn('[Create] Intent analysis failed, using defaults:', err);
            }

            if (activeRequestIdRef.current !== requestId) return;

            // ── Phase 1: Research (Deep Create only) ──────────────────────────
            let researchNotes = '';
            if (isDeepCreate) {
                setCreatePhase('researching');
                currentPhaseForError = 'researching';

                try {
                    // Step 1a: Multi-query search
                    const queries = intent.searchQueries.length > 0
                        ? intent.searchQueries
                        : [request.trim()];

                    console.log('[Create] Phase 1a: Searching', { queries });

                    const searchPromises = queries.map(q =>
                        window.electronAPI.webSearch(q, 3),
                    );
                    const searchResponses = await Promise.all(searchPromises);

                    if (activeRequestIdRef.current !== requestId) return;

                    // Collect and diversify results
                    type SearchResult = { title: string; snippet: string; link: string };
                    const allResults: SearchResult[] = [];
                    const seen = new Set<string>();

                    for (const resp of searchResponses) {
                        if (resp.success && resp.results) {
                            for (const result of resp.results) {
                                if (!seen.has(result.link)) {
                                    seen.add(result.link);
                                    allResults.push(result);
                                }
                            }
                        }
                    }

                    const diversified = diversifyResults(allResults);

                    console.log('[Create] Phase 1a: Got results', {
                        raw: allResults.length,
                        diversified: diversified.length,
                    });

                    // Step 1b: Fetch top 2 pages for richer content
                    const pagesToFetch = diversified.slice(0, 2);
                    const fetchedPages: Array<{ title: string; url: string; content: string }> = [];

                    if (pagesToFetch.length > 0) {
                        console.log('[Create] Phase 1b: Fetching pages');
                        const fetchPromises = pagesToFetch.map(r =>
                            window.electronAPI.webFetchPage(r.link, requestId)
                                .then(result => ({
                                    title: result.title || r.title,
                                    url: r.link,
                                    content: result.success && result.content
                                        ? result.content.substring(0, MAX_PAGE_CONTENT_CHARS)
                                        : '',
                                }))
                                .catch(() => ({ title: r.title, url: r.link, content: '' })),
                        );

                        const pages = await Promise.all(fetchPromises);
                        if (activeRequestIdRef.current !== requestId) return;

                        for (const page of pages) {
                            if (page.content) {
                                fetchedPages.push(page);
                            }
                        }

                        console.log('[Create] Phase 1b: Fetched pages', {
                            count: fetchedPages.length,
                        });
                    }

                    // Build raw research content block
                    const researchParts: string[] = [];

                    researchParts.push('## Search Results\n');
                    for (const [i, r] of diversified.entries()) {
                        researchParts.push(`[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.link}\n`);
                    }

                    if (fetchedPages.length > 0) {
                        researchParts.push('\n## Full Page Content\n');
                        for (const page of fetchedPages) {
                            researchParts.push(`### ${page.title} (${page.url})\n${page.content}\n`);
                        }
                    }

                    const rawResearch = researchParts.join('\n');

                    // Step 1c: Synthesize research into structured notes
                    console.log('[Create] Phase 1c: Synthesizing research');
                    const synthMessages = [{
                        role: 'user' as const,
                        content: buildSynthesisPrompt(request, intent.documentType, rawResearch),
                    }];

                    const synthResponse = await callProviderApi(
                        provider, synthMessages, model, `${requestId}-research-synth`,
                    );

                    if (activeRequestIdRef.current !== requestId) return;

                    if (synthResponse.success && synthResponse.response) {
                        researchNotes = synthResponse.response;
                    }

                    console.log('[Create] Research complete', {
                        elapsed: Date.now() - startTime,
                        notesLength: researchNotes.length,
                    });
                } catch (err) {
                    console.warn('[Create] Research phase failed, continuing without research:', err);
                }

                if (activeRequestIdRef.current !== requestId) return;
            }

            // ── Phase 2: Outline (Deep Create only) ───────────────────────────
            let outline = '';
            if (isDeepCreate) {
                setCreatePhase('outlining');
                currentPhaseForError = 'outlining';

                try {
                    console.log('[Create] Phase 2: Generating outline');
                    const outlineMessages = [{
                        role: 'user' as const,
                        content: buildOutlinePrompt(
                            request, intent.documentType, intent.tone, intent.depth,
                            researchNotes, fileContext,
                        ),
                    }];

                    const outlineResponse = await callProviderApi(
                        provider, outlineMessages, model, `${requestId}-outlining`,
                    );

                    if (activeRequestIdRef.current !== requestId) return;

                    if (outlineResponse.success && outlineResponse.response) {
                        outline = outlineResponse.response;
                    }

                    console.log('[Create] Outline complete', {
                        elapsed: Date.now() - startTime,
                        outlineLength: outline.length,
                    });
                } catch (err) {
                    console.warn('[Create] Outline generation failed, continuing without outline:', err);
                }

                if (activeRequestIdRef.current !== requestId) return;
            }

            // ── Phase 3: Write ────────────────────────────────────────────────
            setCreatePhase('creating');
            currentPhaseForError = 'creating';

            const creatingPrompt = buildCreatingPrompt(
                request, intent.documentType, intent.tone,
                outline || null, researchNotes || null, fileContext,
            );

            const creatingMessages = [{
                role: 'user' as const,
                content: creatingPrompt,
            }];

            console.log('[Create] Phase 3: Writing');
            const createResult = await callWithContinuation(
                callProviderApi, provider, creatingMessages, model,
                `${requestId}-creating`, '[Create]', CREATING_MAX_TOKENS,
            );

            if (activeRequestIdRef.current !== requestId) return;

            let createdContent = createResult.content;
            console.log('[Create] Content generation complete', {
                elapsed: Date.now() - startTime,
                contentLength: createdContent.length,
                continuations: createResult.continuations,
            });

            // ── Phase 4: Review (Deep Create, long docs only) ─────────────────
            if (isDeepCreate && createdContent.length > REVIEW_MIN_CHARS && outline) {
                setCreatePhase('reviewing');
                currentPhaseForError = 'reviewing';

                try {
                    console.log('[Create] Phase 4: Reviewing');
                    const reviewMessages = [{
                        role: 'user' as const,
                        content: buildReviewPrompt(request, outline, createdContent),
                    }];

                    const reviewResponse = await callProviderApi(
                        provider, reviewMessages, model, `${requestId}-reviewing`,
                    );

                    if (activeRequestIdRef.current !== requestId) return;

                    if (reviewResponse.success && reviewResponse.response) {
                        try {
                            const jsonMatch = reviewResponse.response.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                const review = JSON.parse(jsonMatch[0]);
                                if (!review.complete && review.suggestedAdditions) {
                                    createdContent += '\n\n' + review.suggestedAdditions;
                                    console.log('[Create] Review found gaps, appended additions');
                                } else {
                                    console.log('[Create] Review: document is complete');
                                }
                            }
                        } catch {
                            console.warn('[Create] Failed to parse review response');
                        }
                    }

                    console.log('[Create] Review complete', {
                        elapsed: Date.now() - startTime,
                    });
                } catch (err) {
                    console.warn('[Create] Review phase failed, continuing:', err);
                }

                if (activeRequestIdRef.current !== requestId) return;
            }

            // ── Phase 5: Name ─────────────────────────────────────────────────
            setCreatePhase('naming');
            currentPhaseForError = 'naming';

            const namingMessages = [{
                role: 'user' as const,
                content: buildNamingPrompt(request, intent.documentType),
            }];

            console.log('[Create] Phase 5: Naming');
            let fileName = `created-${request.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 30)}.md`;

            const namingResponse = await callProviderApi(
                provider, namingMessages, model, `${requestId}-naming`,
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

            // ── Open new file tab ─────────────────────────────────────────────
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
                pipeline: isDeepCreate ? 'deep (0→1→2→3→4→5)' : 'quick (0→3→5)',
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
            const steps = ['analyzing', 'research-synth', 'outlining', 'creating', 'reviewing', 'naming'];
            for (const step of steps) {
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
