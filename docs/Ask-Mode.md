# Ask Mode — Nexus AI

**Stateless Q&A for quick, focused answers**

Ask Mode is the default AI mode in Nexus. It provides a stateless question-and-answer interface where every question is completely independent — no conversation history is carried between requests. Previous Q&A pairs are displayed in the panel for reference, but they are never sent to the AI. This makes Ask Mode ideal for quick, focused questions where each answer stands on its own.

---

## Table of Contents

1. [Overview](#overview)
2. [Activating Ask Mode](#activating-ask-mode)
3. [Prompt Chain](#prompt-chain)
   - [System Prompt](#system-prompt)
   - [Message Construction](#message-construction)
   - [File Attachments](#file-attachments)
4. [Request Flow](#request-flow)
   - [Step-by-Step Walkthrough](#step-by-step-walkthrough)
   - [Provider Routing](#provider-routing)
   - [Request Lifecycle](#request-lifecycle)
5. [Cancellation](#cancellation)
6. [Output and Display](#output-and-display)
   - [Message Bubbles](#message-bubbles)
   - [Markdown Rendering](#markdown-rendering)
   - [Copy Response](#copy-response)
   - [New File from Response](#new-file-from-response)
7. [Clearing Chat](#clearing-chat)
8. [Error Handling](#error-handling)
9. [Provider Support](#provider-support)
10. [Architecture](#architecture)
    - [Key Files](#key-files)
    - [State Management](#state-management)
    - [IPC Channels](#ipc-channels)

---

## Overview

Ask Mode sends a **single, self-contained message** to the AI for every question. The message contains:

1. A baked-in system prompt that instructs the AI to be concise and direct
2. The user's question
3. Any attached file content (optional)

No prior Q&A history is included. The AI sees only the current question and responds accordingly. This stateless design keeps requests lightweight, avoids token waste on stale context, and ensures every answer is independent.

---

## Activating Ask Mode

Ask Mode is the default mode when the Nexus AI panel is first opened.

**To switch to Ask Mode:**

- Select **Ask** from the Mode dropdown at the bottom-left of the Nexus AI panel
- Ask Mode is available for all four providers: **Claude**, **OpenAI**, **Google Gemini**, and **xAI**

**UI indicators when Ask Mode is active:**

- The Mode dropdown reads **"Ask"**
- The send button uses the **primary (blue)** color with a send icon
- The input placeholder reads: *"Ask anything... (each question is independent)"*
- Mode selection is persisted to `config.json` (`aiChatMode`) and restored on next launch

---

## Prompt Chain

### System Prompt

Every Ask Mode request includes a fixed system prompt prepended to the user's question. This prompt shapes the AI's behavior for concise, focused answers:

```
You are a direct, concise question-answering assistant. Follow these rules strictly:
- Answer ONLY the current question. Do not reference any previous questions or answers.
- Be concise and direct. Lead with the answer, not reasoning.
- If the question is unclear, ask exactly ONE clarifying question.
- If file context is provided, use it to inform your answer but do not summarize the files unless asked.
- Use Markdown formatting when it improves readability (code blocks, lists, bold).
- Do not add preamble, filler, or follow-up questions — just answer.
```

This prompt is defined as the constant `ASK_SYSTEM_PROMPT` in `src/renderer/hooks/useAIAsk.ts`.

### Message Construction

The system prompt and user question are combined into a **single user message** sent to the API:

```
{ASK_SYSTEM_PROMPT}

---

Question: {user's question}
```

This is intentional — only one message is ever sent per request. The API messages array always contains exactly one entry with `role: 'user'`.

**No history is included.** Even though prior Q&A pairs are visible in the chat panel, they exist only in local React state (`askMessages`) and are never appended to API requests.

### File Attachments

When files are attached before sending a question, their content is read from disk and included in the same API message:

**Text files** (`.md`, `.txt`, `.json`, `.js`, `.ts`, `.css`, `.html`, `.xml`, `.yaml`, `.yml`, `.log`, etc.):
- Read as UTF-8 text via `window.electronAPI.readFileForAttachment()`
- Included as attachment data alongside the message

**Image files** (`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`):
- Base64-encoded via `window.electronAPI.readFileForAttachment()`
- Sent using each provider's native image format:
  - **Claude**: `{ type: 'image', media_type, data }`
  - **OpenAI / xAI**: `{ type: 'image_url', image_url: { url: 'data:...' } }`
  - **Gemini**: `{ inlineData: { mimeType, data } }`

After the request is sent, the attachment list is cleared automatically.

---

## Request Flow

### Step-by-Step Walkthrough

Here is the complete flow from the user pressing Enter to the response appearing:

```
User types question and presses Enter
          │
          ▼
┌─────────────────────────────────────┐
│  1. handleSendMessage()             │
│     - Clears previous errors        │
│     - Resolves current provider     │
│     - Delegates to submitAsk()      │
│     - Clears input & attachments    │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  2. submitAsk()  [useAIAsk hook]    │
│     - Validates non-empty input     │
│     - Reads attached files from     │
│       disk (if any)                 │
│     - Adds user message to          │
│       askMessages[] for display     │
│     - Sets isAskLoading = true      │
│     - Generates unique requestId    │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  3. Build API Message               │
│     - Single message array:         │
│       [{                            │
│         role: 'user',               │
│         content: SYSTEM_PROMPT +    │
│                  '---' +            │
│                  'Question: ...',   │
│         attachments: [...]          │
│       }]                            │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  4. Route to Provider               │
│     - Claude  → claudeChatRequest   │
│     - OpenAI  → openaiChatRequest   │
│     - Gemini  → geminiChatRequest   │
│     - xAI     → aiChatRequest       │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  5. IPC → Main Process              │
│     - Preload bridge invokes the    │
│       matching IPC channel          │
│     - Main process handler calls    │
│       the provider's API service    │
│     - AbortController tracked by    │
│       requestId for cancellation    │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  6. Provider API Call               │
│     - HTTP request to provider      │
│       endpoint with API key from    │
│       secure storage                │
│     - Waits for response            │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  7. Response Handling               │
│     - Checks requestId still active │
│       (guards against cancel)       │
│     - On success: adds assistant    │
│       message to askMessages[]      │
│     - On failure: sets askError     │
│     - Sets isAskLoading = false     │
└─────────────────────────────────────┘
              │
              ▼
        Response appears as
        assistant bubble in panel
```

### Provider Routing

The provider is determined by the currently selected model. Each model in the dropdown carries a `provider` field (`'claude'`, `'openai'`, `'gemini'`, or `'xai'`). The `getProviderForModel()` function resolves this.

Each provider has a dedicated IPC channel and preload bridge method:

| Provider | Preload Method         | IPC Channel                |
| -------- | ---------------------- | -------------------------- |
| Claude   | `claudeChatRequest`    | `ai:claude-chat-request`   |
| OpenAI   | `openaiChatRequest`    | `ai:openai-chat-request`   |
| Gemini   | `geminiChatRequest`    | `ai:gemini-chat-request`   |
| xAI      | `aiChatRequest`        | `ai:chat-request`          |

### Request Lifecycle

Each request is tracked by a unique `requestId` (format: `ai-ask-{timestamp}-{random}`). This ID serves two purposes:

1. **Cancellation** — The main process stores an `AbortController` keyed by `requestId`. Calling `cancelAIChatRequest(requestId)` aborts the in-flight HTTP request.
2. **Stale response guard** — When the response arrives, the hook checks that `activeRequestIdRef.current` still matches the `requestId`. If it doesn't (because the user canceled or sent a new request), the response is silently discarded.

---

## Cancellation

While an Ask request is in flight:

- The **Cancel** button becomes enabled (orange outline)
- Clicking Cancel calls `cancelAsk()`, which:
  1. Clears `activeRequestIdRef` (prevents the response from being processed)
  2. Sets `isAskLoading = false`
  3. Sets `askError` to `"Request canceled"`
  4. Sends `cancelAIChatRequest(requestId)` to the main process, which aborts the HTTP request via `AbortController`

The user's question bubble remains in the chat (it was added before the request started), but no assistant response appears.

---

## Output and Display

### Message Bubbles

Ask Mode Q&A pairs are displayed as styled chat bubbles in the messages area:

**User messages:**
- Aligned to the **right** side of the container
- Primary color background (blue) with white text
- Maximum width: 85% of the container

**Assistant messages:**
- Aligned to the **left** side of the container
- Grey background (adapts to light/dark theme)
- Maximum width: 85% of the container
- Content rendered as Markdown

Messages auto-scroll to the bottom whenever a new request starts or messages arrive, so the user always sees the latest activity. Users can scroll up manually to review earlier messages.

### Markdown Rendering

Assistant responses are rendered using `ReactMarkdown` with custom components:

- **Inline code**: Rendered with monospace font
- **Fenced code blocks**: Language-aware syntax highlighting using `react-syntax-highlighter` with Prism (oneLight for light theme, oneDark for dark theme)
- **Lists, bold, headings**: Standard Markdown formatting
- **Paragraphs**: Proper spacing with 8px top margin between consecutive paragraphs

### Copy Response

Each assistant response includes a **Copy** button at the bottom:
- Clicking "Copy" writes the raw Markdown content to the clipboard
- The button briefly changes to a checkmark with "Copied" text for 1.5 seconds as confirmation

### New File from Response

Each assistant response also includes a **New File** button next to the Copy button:
- Clicking "New File" opens a new `Untitled.md` editor tab pre-populated with the full response content
- The tab opens in **preview mode** so the rendered Markdown is immediately visible
- The file is unsaved (`path: null`) — use `Ctrl+S` to save it to disk
- This applies to both standard Ask responses and multi-agent responses

**Implementation**: Dispatches an `OPEN_FILE` action to `EditorContext` with `path: null`, `name: 'Untitled.md'`, `viewMode: 'preview'`, and `fileType: 'markdown'` — the same mechanism used by Create Mode to open generated documents.

---

## Clearing Chat

All Ask Mode messages can be cleared:

1. Click the **delete icon** (trash can) in the Nexus AI panel header
2. A confirmation dialog appears: *"This will permanently remove all messages in this chat session. Are you sure you want to continue?"*
3. Confirming calls `clearAsk()`, which resets `askMessages` to an empty array and clears any error state
4. The attachment list is also cleared

Ask Mode history is **not persisted** across sessions. Closing and reopening the app starts with an empty chat.

---

## Error Handling

Errors are displayed as centered red text below the message list:

| Scenario                      | Error Message                      |
| ----------------------------- | ---------------------------------- |
| Failed to read attached files | `"Failed to read attached files"`  |
| API request fails             | Provider-specific error message    |
| Generic request failure       | `"Failed to send message"`         |
| User cancels request          | `"Request canceled"`               |

Errors are cleared automatically when the next question is submitted.

---

## Provider Support

Ask Mode is supported by **all four providers** with no restrictions:

| Provider       | Ask Mode | Notes                                    |
| -------------- | -------- | ---------------------------------------- |
| Claude         | Yes      | Uses Anthropic Messages API              |
| OpenAI         | Yes      | Uses Chat Completions API                |
| Google Gemini  | Yes      | Uses generateContent API                 |
| xAI (Grok)    | Yes      | Uses OpenAI-compatible Chat Completions  |

When switching between providers, no mode restrictions apply to Ask — it is always available regardless of the selected model.

---

## Architecture

### Key Files

| File | Purpose |
| ---- | ------- |
| `src/renderer/hooks/useAIAsk.ts` | Core Ask Mode hook — system prompt, message construction, API call, state management |
| `src/renderer/components/AIChatDialog.tsx` | Orchestrator — wires Ask hook to UI, handles send routing, cancel, and clear |
| `src/renderer/components/ChatMessages.tsx` | Renders Ask Mode greeting, message bubbles, loading spinner, and errors |
| `src/renderer/components/MessageInput.tsx` | Text input, mode/model selectors, send/cancel buttons |
| `src/renderer/hooks/useAIChat.ts` | Provider/model loading, selection management, shared input state |
| `src/main/preload.ts` | IPC bridge — exposes `claudeChatRequest`, `openaiChatRequest`, `geminiChatRequest`, `aiChatRequest` |
| `src/main/aiIpcHandlers.ts` | Main process IPC handlers — routes requests to provider API services |

### State Management

Ask Mode state is managed entirely by the `useAIAsk` hook:

| State Variable       | Type              | Purpose                                                |
| -------------------- | ----------------- | ------------------------------------------------------ |
| `askMessages`        | `AIMessage[]`     | Display-only Q&A history (never sent to API)           |
| `isAskLoading`       | `boolean`         | Whether a request is in flight                         |
| `askError`           | `string \| null`  | Current error message                                  |
| `activeRequestIdRef` | `Ref<string>`     | Tracks the current request for cancellation/stale guard |

Exposed functions: `submitAsk`, `cancelAsk`, `clearAsk`.

The `AIMessage` type used for each message:

```typescript
interface AIMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    attachments?: AttachmentData[];
}
```

### IPC Channels

| Channel                  | Direction        | Purpose                            |
| ------------------------ | ---------------- | ---------------------------------- |
| `ai:claude-chat-request` | Renderer → Main | Send question to Claude            |
| `ai:openai-chat-request` | Renderer → Main | Send question to OpenAI            |
| `ai:gemini-chat-request` | Renderer → Main | Send question to Gemini            |
| `ai:chat-request`        | Renderer → Main | Send question to xAI               |
| `ai:cancel-request`      | Renderer → Main | Cancel an active Ask request       |

Each channel accepts `{ messages, model, requestId, maxTokens? }` and returns `{ success: boolean, response?: string, error?: string }`.
