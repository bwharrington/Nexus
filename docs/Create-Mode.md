# Create Mode Documentation

This document details how Create Mode works in Nexus — including the AI prompts, two-phase generation chain, filename generation, web search integration, and all user-facing features for generating new markdown documents.

---

## Table of Contents

1. [Overview](#overview)
2. [Activating Create Mode](#activating-create-mode)
3. [Chat Context Toggle](#chat-context-toggle)
4. [Two-Phase Generation Flow](#two-phase-generation-flow)
5. [Prompt Construction](#prompt-construction)
   - [Content Generation Prompt](#content-generation-prompt)
   - [Filename Generation Prompt](#filename-generation-prompt)
   - [File Attachment Context](#file-attachment-context)
   - [Web Search Context](#web-search-context)
6. [Prompt Chain and Request Flow](#prompt-chain-and-request-flow)
7. [Provider Handling](#provider-handling)
8. [Auto-Continuation for Long Documents](#auto-continuation-for-long-documents)
9. [Filename Sanitization](#filename-sanitization)
10. [Document Creation and Tab Opening](#document-creation-and-tab-opening)
11. [Loading States — CreateProgress](#loading-states--createprogress)
12. [Request Cancellation](#request-cancellation)
13. [Error Handling](#error-handling)
14. [Architecture Summary](#architecture-summary)

---

## Overview

Create Mode generates entirely new markdown documents from a natural-language description. The user describes what they want and, optionally, attaches open files as context or enables live web search. Nexus sends a structured prompt to the selected AI provider, receives the full document content, generates a descriptive filename in a second AI call, then automatically opens the result as a new unsaved tab in preview mode.

No existing document is modified; the output is always a brand-new file.

---

## Activating Create Mode

1. Open the Nexus AI panel (Ctrl+Shift+A or toolbar button).
2. Select **Create** from the mode dropdown (options: Ask, Edit, Create).
3. The input placeholder updates to:
   - *"Describe what you want to create... (e.g., 'A blog post about React hooks', 'A project README')"*
   - *"Describe what to create... (web search enabled)"* — when web search is toggled on.
4. The send button turns the secondary theme color with a Create icon.

All four AI providers (Claude, OpenAI, Gemini, xAI) support Create mode. There are no provider restrictions.

---

## Chat Context Toggle

When there are messages in the Ask or multi-agent chat history, a **History icon** toggle button appears in the input toolbar while Create mode is active:

- Click the icon to include the current Ask/multi-agent chat history as reference context for the content generation
- When enabled, the icon turns **blue**; when disabled it is muted grey
- The button is hidden when the chat history is empty
- The toggle state persists in `config.json` (`aiChatContextEnabled`)

**How it works in the prompt**: When enabled, the formatted chat history is injected into `buildCreatingPrompt()` as a **Previous Chat Context** section, placed after any research notes and before the reference files block:

```
**Previous Chat Context (use as reference if relevant):**
[user]: {prior question}
[assistant]: {prior answer}
...
```

**Use case**: Ask questions in Ask mode to research a topic or gather ideas, then switch to Create mode with the context toggle enabled — the AI can draw on that prior discussion when writing the new document.

---

## Two-Phase Generation Flow

Create mode runs two sequential AI calls:

| Phase | Constant | Purpose | Max Tokens |
|-------|----------|---------|------------|
| **Phase 1** | `creating` | Generate the full document content | 16,384 |
| **Phase 2** | `naming` | Generate a short descriptive filename | Default chat limit |

```typescript
export type CreatePhase =
    | 'creating'   // Step 1: content generation
    | 'naming'     // Step 2: filename generation
    | 'complete'
    | null;
```

Phase 1 may automatically continue if the content exceeds the token limit (see [Auto-Continuation](#auto-continuation-for-long-documents)). Phase 2 always runs after Phase 1 completes, even if Phase 1 required continuations.

---

## Prompt Construction

### Content Generation Prompt

Built by `buildCreatingPrompt()` in `useAICreate.ts`. The user's request and any context (file attachments, web search results) are interpolated into this template:

```
You are a creative content generator. The user will describe what they want you to create. Generate the complete content in Markdown format.

**User Request:** "{user's request}"

{file and/or web search context block}

Guidelines:
- Be thorough, well-structured, and creative
- Use proper Markdown formatting (headings, lists, code blocks, tables, etc. as appropriate)
- If context files are provided, use them to inform and enrich your output
- Focus on quality and completeness — this will become a standalone document
- Match the tone and style implied by the request (technical, casual, formal, etc.)
- Do not include meta-commentary about the request — just produce the content directly
```

### Filename Generation Prompt

Built by `buildNamingPrompt()`. Sent as a separate, minimal AI call after the document content is ready:

```
Generate a short, descriptive filename for this document.

Content summary: {user's original request}

Rules:
- Title Case words, spaces allowed (e.g. "React Hooks Guide", "API Design Spec")
- Max 30 characters, no file extension
- Focus on the content topic, be descriptive but concise
- Return ONLY the filename, nothing else
```

### Chat Context

When the Chat Context toggle is enabled (and Ask/multi-agent history exists), the formatted chat history is included in the prompt as a reference section between any research notes and the file attachment block:

```
**Previous Chat Context (use as reference if relevant):**
[user]: {prior question}
[assistant]: {prior answer}
...
```

### File Attachment Context

When the user has files attached in the AI panel, their content is injected into the content generation prompt via `buildFileContextFromOpenFiles()`:

```
[File: example.md]
{file content}

---

[File: notes.md]
{file content}
```

Multiple attached files are separated by `---`. If no files are attached, the context block is omitted entirely.

### Web Search Context

When web search is enabled, results are appended to the file context block before the prompt is sent:

```
{file context (if any)}

**Relevant web search results:**
{formatted search results}
```

The web search runs before the content generation call and goes through two sub-phases internally: query optimization (a lightweight AI call to refine the search query) and the actual search via the Serper API. Both sub-phases are reflected in the progress UI.

---

## Prompt Chain and Request Flow

```
1. User types creation description + clicks Send (Create mode)
        │
        ▼
2. Request ID generated: "ai-create-{timestamp}-{random}"
   Input cleared; createQuery state set for display in chat
        │
        ▼
3. [Optional] Web search executes
   a. Query optimization call → refined search query
   b. Serper API search → results formatted as context block
        │
        ▼
4. File attachment context assembled from open editor files
   Combined with web search results into final context block
   If Chat Context toggle is enabled, Ask/multi-agent history appended as reference block
        │
        ▼
5. Phase 1 — Content generation
   buildCreatingPrompt() constructs full prompt
   callWithContinuation() calls provider API (max tokens: 16,384)
   → Auto-continuation if response is truncated (up to 3 times)
   → Full document content assembled from all segments
        │
        ▼
6. Phase 2 — Filename generation
   buildNamingPrompt() constructs minimal prompt
   Provider API called with user's original request
   Raw filename string returned
        │
        ▼
7. sanitizeFilename() cleans the AI-returned filename
   Appends ".md" extension
   Falls back to "created-{slugified-request}.md" if result is empty
        │
        ▼
8. OPEN_FILE dispatched to EditorContext
   New tab opens with generated content, in preview mode, unsaved
        │
        ▼
9. Completion banner shown: "Created — {fileName}"
```

---

## Provider Handling

Create mode routes all API calls through `callProviderApi()` utility, which dispatches to the appropriate IPC channel:

| Provider | IPC Channel | Main Process Handler |
|----------|------------|---------------------|
| Claude | `ai:claude-chat-request` | `callClaudeApiStreaming()` |
| OpenAI | `ai:openai-chat-request` | `callOpenAIApiStreaming()` |
| Gemini | `ai:gemini-chat-request` | `callGeminiApiStreaming()` |
| xAI | `ai:chat-request` | `callXAIApiStreaming()` |

Unlike Edit mode, Create mode does not require structured JSON output, so all four providers are supported without restriction. The naming prompt relies on the AI returning only a plain string, which all providers handle reliably.

---

## Auto-Continuation for Long Documents

Because documents can exceed a single response's token limit, Create mode uses `callWithContinuation()` to stitch multiple responses together:

- **Max continuations**: 3 (for a maximum of 4 total API calls per document)
- **Continuation prompt**: `"Continue exactly where you left off. Do not repeat any previous content."`
- After all segments are received, unclosed markdown fences are automatically closed before the content is used.

The `continuations` count is logged on completion for debugging. If the document requires more than 3 continuations it is truncated at that point and the result is still opened as a new tab.

---

## Filename Sanitization

The raw string returned by the naming API call is processed by `sanitizeFilename()` before use:

1. Trim leading and trailing whitespace
2. Strip surrounding quotes (single or double)
3. Remove file extension if the AI included one
4. Remove characters invalid in filenames: `/ \ : * ? " < > |`
5. Truncate to 40 characters
6. Trim any trailing whitespace left after truncation
7. Append `.md`

**Fallback**: If sanitization produces an empty string, the filename defaults to `created-{slugified-request}.md`, where the request is lowercased with spaces replaced by hyphens.

---

## Document Creation and Tab Opening

After a successful two-phase generation, `useAICreate.ts` dispatches an `OPEN_FILE` action to `EditorContext`:

```typescript
dispatch({
    type: 'OPEN_FILE',
    payload: {
        id: generateId(),          // Random 9-character alphanumeric ID
        path: null,                // Unsaved — no file path yet
        name: fileName,            // AI-generated and sanitized name
        content: createdContent,   // Full generated markdown
        lineEnding: defaultLineEndingRef.current,  // App default (LF or CRLF)
        viewMode: 'preview',       // Opens directly in preview mode
        fileType: 'markdown',
    },
});
```

Key behaviors:
- The new document is **unsaved** (`path: null`) — it must be explicitly saved with Ctrl+S.
- It opens in **preview mode**, so the user sees the rendered markdown immediately.
- It uses the app's configured **default line ending** (not inferred from the content).
- A **completion banner** appears in the chat panel: `Created — {fileName}`

---

## Loading States — CreateProgress

While a Create request is in progress, the `CreateProgress` component replaces the chat area with a multi-step progress indicator.

### Steps (without web search)

| Step | Phase |
|------|-------|
| Generating Content | `creating` |
| Naming Document | `naming` |
| Document Created | `complete` |

### Steps (with web search enabled)

| Step | Phase |
|------|-------|
| Optimizing Query | web search — optimization |
| Searching the Web | web search — searching |
| Generating Content | `creating` |
| Naming Document | `naming` |
| Document Created | `complete` |

### Visual Indicators

| State | Appearance |
|-------|-----------|
| Pending step | Gray dot, 80% opacity |
| Active step | Pulsing secondary-color dot with glow |
| Completed step | Green checkmark |
| Step connectors | Change color as steps complete |

### Typewriter Messages

While each phase is active, rotating messages cycle in the UI to indicate activity:

- **Creating**: "Generating your content...", "Crafting the document...", "Writing sections...", and others
- **Naming**: "Generating filename...", "Picking a descriptive title...", "Naming your document..."

**Timing**: Each completed step shows its elapsed time. The completion state shows total elapsed time. Times are displayed as milliseconds (e.g., `420ms`) or seconds with one decimal (e.g., `2.4s`).

---

## Request Cancellation

Every Create request is assigned a unique ID used to cancel all in-flight API calls if the user clicks Cancel.

**Request ID format**: `ai-create-{Date.now()}-{random}`

**Sub-request IDs** derived from the main ID:

| Sub-request | ID suffix |
|-------------|----------|
| Content generation | `-creating` |
| Content continuation 1 | `-creating-cont-1` |
| Content continuation 2 | `-creating-cont-2` |
| Content continuation 3 | `-creating-cont-3` |
| Filename generation | `-naming` |
| Web search optimization | `-opt` |

`cancelCreate()` cancels all of these IDs via `window.electronAPI.cancelAIChatRequest()`. After cancellation:
- All loading state is cleared
- `createError` is set to `"Create request canceled"`
- Web search phase is reset
- The progress UI is dismissed

---

## Error Handling

Errors are captured with the phase in which they occurred for easier debugging.

**Logged on error**:
```
[Create] Error { phase: 'creating' | 'naming', elapsed: number, error: string }
```

On error:
- `createPhase` resets to `null`
- `createError` is set to the error message string
- Error text is displayed in the chat panel in red
- No partial document is opened

**Console logging throughout the lifecycle**:
```
[Create] Starting { request, provider, model, requestId, webSearchEnabled }
[Create] Phase: creating — calling API
[Create] Content generation complete { elapsed, contentLength, continuations }
[Create] Phase: naming — calling API
[Create] Naming complete { elapsed, fileName }
[Create] Complete { totalElapsed, fileName }
```

---

## Architecture Summary

| Layer | File | Responsibility |
|-------|------|---------------|
| UI / Input | `MessageInput.tsx` | Mode dropdown, placeholder, send button, web search toggle, chat context toggle, spell check |
| UI / Progress | `CreateProgress.tsx` | Multi-step progress indicator with timing |
| UI / Chat | `ChatMessages.tsx` | Shows user query, progress, completion banner, error |
| UI / Orchestration | `AIChatDialog.tsx` | Wires hook to UI, handles mode switching and send/cancel |
| Hook | `useAICreate.ts` | Two-phase AI calls, prompt building, state management |
| Utility | `callWithContinuation.ts` | Auto-continuation logic for long documents |
| Utility | `callProviderApi.ts` | Routes API calls to the correct IPC channel by provider |
| Web Search | `useWebSearch.ts` | Query optimization + Serper search; returns formatted context |
| IPC Handlers | `aiIpcHandlers.ts` | Main-process handlers for each provider's chat API |
| State | `EditorContext.tsx` | `OPEN_FILE` action creates the new tab |
| Restrictions | `aiProviderModeRestrictions.ts` | Defines mode restrictions (Create has none) |
