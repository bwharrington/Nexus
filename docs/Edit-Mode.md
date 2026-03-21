# Edit Mode Documentation

This document details how Edit Mode works in Nexus — including the AI prompts, prompt chain, diff system, and user-facing features for modifying markdown documents.

---

## Table of Contents

1. [Overview](#overview)
2. [Activating Edit Mode](#activating-edit-mode)
3. [Chat Context Toggle](#chat-context-toggle)
4. [Prompt Construction](#prompt-construction)
   - [System Prompt](#system-prompt)
   - [User Prompt](#user-prompt)
   - [Web Search Context](#web-search-context)
5. [Prompt Chain and Request Flow](#prompt-chain-and-request-flow)
6. [Provider-Specific Handling](#provider-specific-handling)
   - [Claude (Anthropic)](#claude-anthropic)
   - [OpenAI](#openai)
   - [Google Gemini](#google-gemini)
   - [Provider Restrictions](#provider-restrictions)
7. [JSON Response Parsing](#json-response-parsing)
8. [Diff Computation](#diff-computation)
9. [Diff Tab and Visualization](#diff-tab-and-visualization)
10. [Accepting and Rejecting Changes](#accepting-and-rejecting-changes)
    - [Per-Hunk Controls](#per-hunk-controls)
    - [Bulk Actions](#bulk-actions)
    - [Keyboard Shortcuts](#keyboard-shortcuts)
11. [Document Reconstruction](#document-reconstruction)
12. [Loading States](#loading-states)
13. [Architecture Summary](#architecture-summary)

---

## Overview

Edit Mode is an AI-assisted document editing system. The user describes changes they want made to their open markdown file; the AI returns the full modified document as structured JSON; Nexus computes a diff and presents individual change hunks for the user to accept or reject one-by-one. No change is applied to the document until explicitly accepted.

---

## Activating Edit Mode

1. Open the Nexus AI panel (Ctrl+Shift+A or toolbar button).
2. Select **Edit** from the mode dropdown in the message input area (options: Ask, Edit, Create).
3. The input placeholder updates to: *"Describe the changes you want... (e.g., 'Add a table of contents')"*
4. The send button turns green with an edit icon.

**Provider restriction**: The mode dropdown hides the xAI (Grok) provider when Edit is selected because Grok does not support structured JSON output. If xAI is the active provider when the user switches to Edit mode, the mode resets automatically to Ask.

---

## Chat Context Toggle

When there are messages in the Ask or multi-agent chat history, a **History icon** toggle button appears in the input toolbar while Edit mode is active:

- Click the icon to include the current Ask/multi-agent chat history as context for the edit request
- When enabled, the icon turns **blue**; when disabled it is muted grey
- The button is hidden when the chat history is empty (nothing to include)
- The toggle state persists in `config.json` (`aiChatContextEnabled`)

**How it works in the prompt**: When enabled, the formatted chat history is injected into the edit prompt between the requested changes and the document content, inside a clearly delimited block:

```
--- PREVIOUS CHAT CONTEXT (use only if relevant to the edit) ---
[user]: {prior question}
[assistant]: {prior answer}
...
--- END CHAT CONTEXT ---
```

The AI is instructed to treat this as reference-only context, not as a directive. This allows the AI to understand what the user was just researching without misinterpreting conversation turns as edit instructions.

**Use case**: Ask questions in Ask mode to explore a topic, then switch to Edit mode with the context toggle enabled so the AI can make edits informed by that prior conversation.

---

## Prompt Construction

### System Prompt

Sent separately as a system-role message (or prepended for Gemini). Instructs the AI to return a single raw JSON object and nothing else:

```
You are helping edit a markdown document. The user will provide the current document content and request specific changes.

CRITICAL: Your ENTIRE response must be a single, raw JSON object. Do NOT include any text, explanation, or commentary before or after the JSON. Do NOT wrap the JSON in markdown code fences (```). Output ONLY the JSON object.

RULES:
1. Return a JSON object with "modifiedContent" (the complete modified document) and "summary" (brief description of changes)
2. Preserve all content that the user did not ask to change
3. Maintain the exact formatting, indentation, and line endings of unchanged sections
4. Make ONLY the changes the user explicitly requested
5. The modifiedContent must be the complete document, not a partial diff
6. Your response MUST be valid JSON and nothing else - no preamble, no explanation, no code fences

Example response format:
{
  "modifiedContent": "# Title\n\nUpdated content here...",
  "summary": "Added a new section about X and fixed typo in paragraph 2"
}
```

### User Prompt

Constructed in `useAIDiffEdit.ts` and assembled around the user's instruction and the full file content:

```
Edit the following markdown document.[optional web context block]

File: {fileName}

Requested changes:
{user's edit instruction}

--- PREVIOUS CHAT CONTEXT (use only if relevant to the edit) ---
[user]: ...
[assistant]: ...
--- END CHAT CONTEXT ---
(only present when Chat Context toggle is enabled and Ask history exists)

Current document:
```markdown
{full file content}
```

Return a JSON object with the complete modified document.
```

### Web Search Context

If the web search toggle is enabled, `useWebSearch` runs a search query derived from the user's prompt before the edit request is sent. The results are injected into the user prompt as a context block between the opening line and the `File:` line:

```
Edit the following markdown document.

Web Search Context:
{search results summary}

File: {fileName}
...
```

---

## Prompt Chain and Request Flow

The full sequence from user action to applied changes:

```
1. User types edit instruction + clicks Send (Edit mode)
        │
        ▼
2. [Optional] Web search executes via useWebSearch
   → Query optimized from user prompt
   → Results retrieved and formatted as context block
        │
        ▼
3. Request ID generated: "ai-edit-{timestamp}-{random}"
        │
        ▼
4. useAIDiffEdit.requestEdit() called with:
   - prompt (user instruction + document content)
   - provider (claude | openai | gemini)
   - model (selected model ID)
   - requestId (for cancellation)
   - webSearchEnabled (boolean)
   - chatContext (formatted Ask history string, only when toggle is enabled)
        │
        ▼
5. IPC call: window.electronAPI.aiEditRequest()
   → Sends message array to main process via "ai:edit-request" channel
        │
        ▼
6. aiIpcHandlers.ts routes to provider-specific API function
        │
        ▼
7. AI returns full modified document as JSON string
        │
        ▼
8. JSON parsed via 3-strategy fallback (see below)
        │
        ▼
9. computeDiffHunks() compares original vs modified content
        │
        ▼
10. OPEN_DIFF_TAB dispatched → Diff tab opens automatically
        │
        ▼
11. User reviews hunks and accepts/rejects each
        │
        ▼
12. applyAcceptedHunks() reconstructs document and writes it
```

---

## Provider-Specific Handling

### Claude (Anthropic)

- **Function**: `callClaudeApiWithSystemPrompt()`
- **Max tokens**: 16,384 (double the 8,192 used for chat, to accommodate full document responses)
- **System prompt**: Sent as the dedicated `system` field in the Anthropic Messages API
- **Endpoint**: `https://api.anthropic.com/v1/messages`

### OpenAI

- **Function**: `callOpenAIApiWithJsonMode()`
- **JSON mode**: `response_format: { type: 'json_object' }` enforced, which guarantees a valid JSON response
- **System prompt**: Sent as a `system` role message in the messages array
- **Endpoint**: `https://api.openai.com/v1/chat/completions`

### Google Gemini

- **Function**: `callGeminiApiWithJsonMode()`
- **JSON mode**: `response_mime_type: 'application/json'` set in generation config
- **System prompt**: Prepended as the first user message (Gemini does not have a dedicated system role)
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta`

### Provider Restrictions

| Provider | Edit Mode Supported |
|----------|-------------------|
| Claude (Anthropic) | ✓ |
| OpenAI | ✓ |
| Google Gemini | ✓ |
| xAI (Grok) | ✗ — no structured JSON output |

---

## JSON Response Parsing

Because AI responses sometimes include unexpected preamble or markdown fences despite the system prompt, `aiIpcHandlers.ts` uses three sequential fallback strategies to extract valid JSON:

1. **Direct parse** — Attempt `JSON.parse(rawResponse)` as-is. Succeeds if the model returned pure JSON (ideal case).
2. **Strip code fences** — If the response is wrapped in ` ```json ... ``` ` or similar, strip the fences and retry `JSON.parse`.
3. **JSON extraction** — Find the first `{` and last `}` in the entire response string, extract that substring, and parse it. Handles cases where the model added preamble text before or after the JSON.

If all three strategies fail, an error is returned to the renderer and the edit is aborted with a user-visible error message.

**Parsed response shape:**
```typescript
{
  modifiedContent: string;  // Complete edited document
  summary: string;          // AI-written description of changes made
}
```

---

## Diff Computation

`computeDiffHunks()` in `useAIDiffEdit.ts` produces an array of hunks representing the differences between the original and modified content:

1. **Line ending normalization** — Both original and modified content have `\r\n` converted to `\n` before comparison, so Windows CRLF files are handled correctly. The original line ending style is recorded and restored when changes are applied.

2. **Line-by-line diff (Pass 1)** — A standard diff algorithm compares the two documents line by line and builds raw hunk objects. Each hunk has:
   - `type`: `add` | `remove` | `modify`
   - `originalLines`: lines from the original document
   - `modifiedLines`: lines from the modified document
   - `originalStart` / `originalEnd`: line range in original
   - `modifiedStart` / `modifiedEnd`: line range in modified

3. **Hunk merging (Pass 2)** — Adjacent hunks separated by ≤ 2 unchanged lines are merged into a single hunk (controlled by `MERGE_GAP_THRESHOLD = 2`). This prevents the diff from fragmenting closely related changes into many tiny hunks.

4. **Status initialization** — Every hunk starts with `status: 'pending'`.

---

## Diff Tab and Visualization

When the diff is ready, a new tab opens in the editor area displaying the document in diff view. This tab is read-only; the source file is protected from direct edits while a diff session is active.

**Visual treatment of lines:**

| Line type | Appearance |
|-----------|-----------|
| Unchanged | Normal text rendering |
| Removed | Red background, red 3px left border, strikethrough, 70% opacity |
| Added | Green background, green 3px left border |
| Current hunk (focused) | 2px blue outline around the hunk block |

**Summary banner**: Displayed at the top of the diff tab, showing the AI's `summary` string and the number of pending hunks remaining.

---

## Accepting and Rejecting Changes

### Per-Hunk Controls

Each hunk in the diff view has two inline action buttons that appear when the hunk is focused:

- **Accept** (green checkmark) — Apply this hunk's changes to the document.
- **Reject** (red undo) — Discard this hunk, keeping the original lines.

After acting on a hunk, focus automatically advances to the next pending hunk.

### Bulk Actions

The **floating navigation toolbar** (bottom-right corner of the diff tab) provides bulk controls:

- **Previous / Next** — Navigate between hunks; shows current position as X / Y.
- **Keep** — Accept the currently focused hunk.
- **Undo** — Reject the currently focused hunk.
- **Keep All** — Accept every remaining pending hunk at once. The button label includes the pending count.
- **Cancel (×)** — Close the diff tab without applying any changes.

When all hunks have been resolved (none remain as `pending`), the diff tab closes automatically and a toast notification appears:

> *"AI changes applied. Remember to save your file (Ctrl+S)."*

### Keyboard Shortcuts

Full keyboard navigation is available while the diff tab is active:

| Key | Action |
|-----|--------|
| `J` or `↓` | Move to next hunk |
| `K` or `↑` | Move to previous hunk |
| `Enter` or `Y` | Accept current hunk |
| `Backspace` or `N` | Reject current hunk |
| `Ctrl+Shift+A` | Accept all hunks |
| `Escape` | Close diff tab (cancel all) |

---

## Document Reconstruction

When a hunk is accepted or all hunks are resolved, `applyAcceptedHunks()` rebuilds the full document:

1. Iterates through all lines of the document.
2. For each hunk region:
   - If `accepted` → uses the **modified** lines from the AI response.
   - If `rejected` or `pending` → uses the **original** lines.
3. Pushes the previous document content onto the undo stack before writing, so the change is reversible with Ctrl+Z.
4. Restores the original line endings (CRLF or LF) to the reconstructed content before writing to the file buffer.

---

## Loading States

While the AI edit request is in progress, the `EditProgress` component replaces the diff view with a three-phase progress indicator:

| Phase | Shown when |
|-------|-----------|
| **Optimizing Query** | Web search is enabled |
| **Searching the Web** | Web search is enabled |
| **Applying Edits** | Always |

Each phase displays rotating typewriter messages to indicate activity. Completed phases show their elapsed time. The user can cancel an in-progress edit request; the `requestId` is used to abort the underlying API call.

---

## Architecture Summary

| Layer | File | Responsibility |
|-------|------|---------------|
| UI / Input | `MessageInput.tsx` | Mode dropdown, send button, web search toggle, spell check |
| UI / Loading | `EditProgress.tsx` | Three-phase progress while request is in-flight |
| UI / Diff view | `DiffView.tsx` | Renders hunks with color coding |
| UI / Toolbar | `DiffNavigationToolbar.tsx` | Floating bulk-action and navigation controls |
| Hook | `useAIDiffEdit.ts` | Builds prompt, calls IPC, computes diff hunks |
| IPC Handler | `aiIpcHandlers.ts` | Routes to provider API, parses JSON response |
| Provider APIs | `claudeApi.ts`, `openaiApi.ts`, `geminiApi.ts` | Provider-specific HTTP calls |
| State | `EditorContext.tsx` | Manages diff session, hunk status, applies accepted changes |
| Types | `diffTypes.ts` | `DiffHunk`, `HunkStatus`, `DiffSession` interfaces |
| Restrictions | `aiProviderModeRestrictions.ts` | Defines which providers support Edit mode |
