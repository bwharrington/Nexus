import { JSDOM } from 'jsdom';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Readability } = require('@mozilla/readability');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TurndownService = require('turndown');
import { log, logError } from '../logger';
import { getApiKeyForService } from '../secureStorageIpcHandlers';

// --- Interfaces ---

export interface SerperSearchResult {
    title: string;
    link: string;
    snippet: string;
    position: number;
}

export interface WebSearchResponse {
    success: boolean;
    results?: SerperSearchResult[];
    error?: string;
}

export interface PageFetchResult {
    success: boolean;
    url: string;
    title?: string;
    markdown?: string;
    byteSize?: number;
    error?: string;
}

// --- Constants ---

const SERPER_API_URL = 'https://google.serper.dev/search';
const SERPER_TIMEOUT_MS = 5000;
const PAGE_FETCH_TIMEOUT_MS = 10000;
const MAX_PAGE_CONTENT_BYTES = 16384; // 16KB per page
const USER_AGENT = 'MarkdownPlus/1.0 (Documentation Fetcher)';

// --- Serper Search ---

export async function searchSerper(
    query: string,
    numResults: number = 5,
    signal?: AbortSignal,
): Promise<WebSearchResponse> {
    const apiKey = getApiKeyForService('serper');
    if (!apiKey) {
        return { success: false, error: 'No Serper API key configured' };
    }

    try {
        log('[WebSearch] Searching Serper', { query, numResults });

        const timeoutSignal = AbortSignal.timeout(SERPER_TIMEOUT_MS);
        const combinedSignal = signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal;

        const response = await fetch(SERPER_API_URL, {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: query, num: numResults }),
            signal: combinedSignal,
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            log('[WebSearch] Serper API error', { status: response.status, body: errorBody });
            return { success: false, error: `Serper API returned ${response.status}` };
        }

        const data = await response.json() as { organic?: SerperSearchResult[] };

        const results = (data.organic || []).map((r: SerperSearchResult, i: number) => ({
            title: r.title || '',
            link: r.link || '',
            snippet: r.snippet || '',
            position: r.position || i + 1,
        }));

        log('[WebSearch] Serper returned results', { count: results.length });
        return { success: true, results };
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            return { success: false, error: 'Search request aborted' };
        }
        logError('[WebSearch] Serper search failed', error as Error);
        return { success: false, error: (error as Error).message };
    }
}

// --- Page Fetching & Extraction ---

export async function fetchAndExtractPage(
    url: string,
    signal?: AbortSignal,
): Promise<PageFetchResult> {
    try {
        log('[WebSearch] Fetching page', { url });

        const timeoutSignal = AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS);
        const combinedSignal = signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal;

        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: combinedSignal,
            redirect: 'follow',
        });

        if (!response.ok) {
            return { success: false, url, error: `HTTP ${response.status}` };
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return { success: false, url, error: `Not HTML: ${contentType}` };
        }

        const html = await response.text();

        // Parse with jsdom and extract with Readability
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article || !article.content) {
            return { success: false, url, error: 'No extractable content' };
        }

        // Convert to markdown
        const turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
        });

        // Remove images and iframes to keep context clean
        turndown.remove(['img', 'iframe', 'video', 'audio', 'picture', 'source']);

        let markdown = turndown.turndown(article.content);

        // Truncate to budget
        if (markdown.length > MAX_PAGE_CONTENT_BYTES) {
            markdown = markdown.substring(0, MAX_PAGE_CONTENT_BYTES) + '\n\n[... content truncated]';
        }

        const title = article.title || url;
        log('[WebSearch] Page extracted', { url, title, byteSize: markdown.length });

        return {
            success: true,
            url,
            title,
            markdown,
            byteSize: markdown.length,
        };
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            return { success: false, url, error: 'Fetch aborted' };
        }
        logError('[WebSearch] Page fetch failed', error as Error);
        return { success: false, url, error: (error as Error).message };
    }
}

// --- Validation ---

export async function validateSerperKey(key: string): Promise<{ valid: boolean; error?: string }> {
    try {
        const response = await fetch(SERPER_API_URL, {
            method: 'POST',
            headers: {
                'X-API-KEY': key,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: 'test', num: 1 }),
            signal: AbortSignal.timeout(SERPER_TIMEOUT_MS),
        });

        if (response.ok) {
            return { valid: true };
        }

        const errorBody = await response.text().catch(() => '');
        return { valid: false, error: `Serper returned ${response.status}: ${errorBody}` };
    } catch (error) {
        return { valid: false, error: (error as Error).message };
    }
}

// --- Utility ---

export function hasSerperKey(): boolean {
    return getApiKeyForService('serper') !== null;
}
