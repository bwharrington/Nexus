# Nexus AI Feature Documentation

This document describes the Nexus AI feature in Nexus, covering configuration, the chat dialog, all AI modes, diff visualization, and the underlying architecture.

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
   - [API Key Setup](#api-key-setup)
   - [Web Search Setup](#web-search-setup)
   - [Model Selection](#model-selection)
   - [Model Filtering](#model-filtering)
   - [Secure Storage](#secure-storage)
3. [Chat Dialog](#chat-dialog)
   - [Opening and Closing](#opening-and-closing)
   - [Docked Mode](#docked-mode)
   - [Provider and Model Selection](#provider-and-model-selection)
   - [Sending Messages](#sending-messages)
   - [Spell Check](#spell-check)
   - [Message Display](#message-display)
   - [File Attachments](#file-attachments)
   - [Loading Indicators](#loading-indicators)
4. [Web Search](#web-search)
   - [How Web Search Works](#how-web-search-works)
   - [Web Search in Ask Mode](#web-search-in-ask-mode)
   - [Web Search in Edit and Create Modes](#web-search-in-edit-and-create-modes)
5. [Ask Mode](#ask-mode)
   - [How Ask Mode Works](#how-ask-mode-works)
   - [Ask Mode Output](#ask-mode-output)
   - [New File from Response](#new-file-from-response)
6. [Edit Mode and Diff System](#edit-mode-and-diff-system)
   - [Activating Edit Mode](#activating-edit-mode)
   - [Chat Context Toggle](#chat-context-toggle)
   - [How Edits Are Requested](#how-edits-are-requested)
   - [Diff Computation](#diff-computation)
   - [Diff Tab and Visualization](#diff-tab-and-visualization)
   - [Accepting and Rejecting Changes](#accepting-and-rejecting-changes)
   - [Keyboard Shortcuts](#keyboard-shortcuts)
   - [Source File Protection](#source-file-protection)
7. [Create Mode](#create-mode)
   - [Activating Create Mode](#activating-create-mode)
   - [Chat Context Toggle](#chat-context-toggle-1)
   - [How Create Mode Works](#how-create-mode-works)
   - [Create Mode Output](#create-mode-output)
   - [Loading States — Create Progress](#loading-states--create-progress)
8. [Supported AI Providers](#supported-ai-providers)
   - [Claude (Anthropic)](#claude-anthropic)
   - [OpenAI](#openai)
   - [Google Gemini](#google-gemini)
   - [xAI (Grok)](#xai-grok)
9. [Architecture](#architecture)
   - [File Structure](#file-structure)
   - [IPC Communication](#ipc-communication)
   - [State Management](#state-management)

---

## Overview

The Nexus AI feature allows users to interact with AI language models directly within the Nexus editor. It supports three modes:

- **Ask Mode**: A stateless Q&A interface. Every question is completely independent — only the current question (plus any attached files) is sent to the API. Previous Q&A pairs are shown in the panel for reference but are not included in subsequent requests. Great for quick, focused questions where each answer stands alone.
- **Edit Mode**: The AI modifies the current Markdown document based on user instructions. Changes are presented in a **dedicated diff tab** with a unified inline diff view, where the user can accept or reject changes on a per-hunk basis.
- **Create Mode**: The AI generates a complete new Markdown document from a user description. Optional file attachments provide context. The result opens as a new document tab in preview mode.

Four AI providers are supported: **Claude (Anthropic)**, **OpenAI**, **Google Gemini**, and **xAI (Grok)**. All four providers support Ask, Edit, and Create modes. xAI multi-agent models (model IDs containing `multi-agent`) are restricted from Edit mode only — standard xAI Grok models support all three modes.

---

## Configuration

### API Key Setup

API keys are configured in **Settings** (gear icon in the toolbar, or `Ctrl+,`). The AI API Keys section provides input fields for each provider:

- **Claude** - Requires an Anthropic API key
- **OpenAI** - Requires an OpenAI API key
- **Google Gemini** - Requires a Google Gemini API key
- **xAI** - Requires an xAI API key

For each provider:

1. Enter the API key in the password field
2. Click **Set** to validate and store the key
3. The key is validated with a test API call before being stored
4. A status chip indicates the connection state:
   - **"Connected"** (green) — Key is stored and the provider API is reachable
   - **"Set"** (red) — Key is stored but the provider returned an error
5. Click **Clear** to remove a stored key
6. Click the **refresh** icon (spinning arrows) next to Clear to re-test the connection and see a toast with the result

Provider statuses are automatically refreshed whenever you set or clear an API key.

**Development Override**: During development, API keys can be set via environment variables in a `.env` file:

- `ANTHROPIC_API_KEY` for Claude
- `OPENAI_API_KEY` for OpenAI
- `GEMINI_API_KEY` for Google Gemini
- `XAI_API_KEY` for xAI

Environment variable values take precedence over keys stored in secure storage.

### Web Search Setup

Web search is powered by the **Serper API** and is configured on the **Web Search** tab in Settings. A Serper key is separate from AI provider keys — it enables live web context in all three AI modes (Ask, Edit, Create).

1. Obtain a key at [serper.dev](https://serper.dev)
2. Open **Settings → Web Search**
3. Enter the key and click **Set**
4. The key is stored with the same encrypted secure-storage mechanism used for AI provider keys

Once a Serper key is stored, a **globe icon** toggle button appears in the message input. Clicking it enables or disables web search for the current request. The toggle is hidden entirely when no Serper key is configured.

Serper does not have a connection-test flow (unlike AI providers) — the key is stored as-is and validated implicitly on first use.

---

### Model Selection

Once an API key is configured for a provider, an **AI Models** section appears in Settings. Each provider has an expandable accordion containing checkboxes to enable or disable individual models.

**Default fallback models** (used when the provider API cannot be reached):

| Provider | Models                                                                  |
| -------- | ----------------------------------------------------------------------- |
| Claude   | Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5                   |
| OpenAI   | GPT-5.2, GPT-5.1, GPT-5, GPT-5 Mini, GPT-4o Latest, o3, o4 Mini       |
| Gemini   | Gemini 3 Pro Preview, Gemini 3 Flash Preview                            |
| xAI      | Grok 4, Grok 4.1, Grok 4.1 Reasoning                                   |

The application queries each provider's API for dynamically available models. Models returned from the API are first filtered at the provider level to remove irrelevant variants (see [Model Filtering](#model-filtering) below), then further filtered based on the user's enabled/disabled configuration stored in `config.json` under the `aiModels` key.

### Model Filtering

Each provider applies automatic filtering to its API model list to surface only models useful for chat interactions. This prevents embedding models, image-generation variants, dated snapshots, and other non-chat models from cluttering the model dropdown.

**Claude:**

- Only models starting with `claude-` are included
- Old Claude 3 base generation (pre-3.5) models are excluded — models starting with `claude-3-` are filtered out, keeping `claude-3-5+`, `claude-3-7+`, `claude-4+`, etc.

**OpenAI:**

- GPT-5 family models are included via an explicit allowlist (`gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`, `gpt-5.2`); ChatGPT-specific `-chat-latest` aliases are excluded
- GPT chat models outside the GPT-5 family are included only when they use the `-latest` rolling alias (e.g., `gpt-4o-latest`); dated snapshots and audio/search variants are excluded
- O-series reasoning models are included only as base IDs (e.g., `o3`, `o4-mini`, `o4-pro`)

**Google Gemini:**

- Only models that support `generateContent` and start with `gemini-` are included (drops PaLM, Gemma, LearnLM, Imagen, AQA, etc.)
- Embedding models, image-generation variants (`-image`), and image-only models are excluded
- Pinned dated snapshots (e.g., `exp-03-25`, `exp-0827`), numbered versions (`-001`, `-002`), and `-latest` aliases are excluded (the bare model name already serves as the rolling alias)

**xAI:**

- Only models starting with `grok-4` are included
- Image, video, and image-generation variants (`image`, `video`, `imagine`) are excluded

### Secure Storage

API keys are encrypted using Electron's `safeStorage` API, which uses the OS-native credential store:

| Platform | Encryption Method           |
| -------- | --------------------------- |
| Windows  | DPAPI (Data Protection API) |
| macOS    | Keychain                    |
| Linux    | libsecret                   |

Encrypted keys are stored in `{userData}/encrypted-keys.json` as base64-encoded encrypted buffers. Keys are decrypted only when needed for API calls and are never stored in plain text on disk.

---

## Chat Dialog

### Opening and Closing

**Opening:**

- **Keyboard shortcut**: `Ctrl+Shift+A`
- **Toolbar button**: Click the AI icon (SmartToyIcon) in the toolbar

**Closing:**

- Click the **X** button in the dialog header
- Press **Escape** while the dialog is focused

### Docked Mode

The chat panel is docked to the right side of the editor with a resizable divider:

- Minimum dock width: 320px, default: 480px
- Dock width is saved to `config.json` (`aiChatDockWidth`) and persists between sessions
- The panel can be toggled open/closed via the toolbar AI button or `Ctrl+Shift+A`

### Provider and Model Selection

The mode dropdown, model dropdown, and attachment icon are displayed in the input controls at the bottom of the panel:

**Mode Dropdown:**

- Switch between **Ask**, **Edit**, and **Create** modes
- Mode is persisted in `config.json` (`aiChatMode`)
- Disabled while a request is active or a diff tab is open

**Model Dropdown:**

- Lists enabled models for the selected provider, grouped by provider
- Automatically filters out models restricted from the current mode (e.g., xAI is hidden from the model dropdown when Edit mode is selected)
- Updates dynamically when mode changes
- Persists selection in `config.json` (`aiChatModel`)

### Sending Messages

- Type a message in the text input at the bottom of the panel
- Press **Enter** to send (or click the Send/Edit/Create button)
- Press **Shift+Enter** for a line break without sending
- The input supports up to 4 visible rows (multiline)
- The send button is disabled when the input is empty, a request is loading, or a diff tab is currently open
- Active requests can be canceled using the **Cancel** button

### Spell Check

The AI chat message input has native spell checking powered by Electron's built-in Chromium spell checker. No third-party library is required — the browser engine provides red squiggly underlines on misspelled words automatically.

**How it works:**

- Misspelled words are underlined with a red squiggle as you type
- Right-clicking a misspelled word opens a themed context menu showing:
  - The misspelled word (shown in italic at the top)
  - Up to several correction suggestions — click any to replace the word instantly
  - **"No suggestions"** (disabled) when the spell checker has no alternatives
  - **"Add to Dictionary"** — permanently adds the word to your custom dictionary so it is no longer flagged
- Right-clicking correctly spelled text shows no spell menu (right-click falls through normally)
- The spell checker is configured for **en-US** by default
- Custom dictionary words persist for the session via Electron's session API

**Implementation details:**

- `spellcheck: true` is set in the `BrowserWindow` `webPreferences`
- The main process listens for the Chromium `context-menu` event; when a misspelled word is detected (`params.misspelledWord`), it forwards the word and suggestions to the renderer via `spellcheck:context-menu` IPC and suppresses the native OS context menu
- The renderer's `useSpellCheck` hook manages menu state and exposes callbacks for replacing and dictionary-adding
- The `SpellCheckContextMenu` component renders the suggestions as a themed MUI `Menu` positioned at the right-click coordinates

### Message Display

In **Ask Mode**, messages appear as styled bubbles in the messages container:

**User messages:**

- Aligned to the right
- Primary color background (blue) with white text
- Maximum width: 85% of the container

**Assistant messages:**

- Aligned to the left
- Grey background (adapts to light/dark theme)
- Maximum width: 85% of the container
- Content rendered as Markdown using `ReactMarkdown`, supporting formatted text, code blocks, lists, and other Markdown elements
- **Code blocks with syntax highlighting**: Fenced code blocks (e.g., ` ```javascript `) are rendered with language-aware syntax highlighting using `react-syntax-highlighter` with Prism. Colors adapt to light/dark theme (oneLight / oneDark)
- A **Copy** button appears below each assistant response
- A **New File** button appears next to Copy on each assistant response — clicking it creates a new `Untitled.md` editor tab pre-populated with the response content, opened in preview mode

The message area automatically scrolls to the bottom whenever a new request starts or messages arrive, ensuring the user always sees the latest activity. Users can scroll up manually to review earlier messages.

**Clearing Chat:**

- Click the delete icon in the dialog header
- A confirmation dialog appears before clearing all messages
- Clears all Ask mode messages and any error state

### File Attachments

The chat supports file attachments for providing additional context. Files can be attached via the attachment popover or from the tab bar context menu.

**Attach File Popover:**

Clicking the attachment icon (paperclip) next to the text input opens a popover with two sections:

1. **"Files and Folders"** — Opens the native file dialog to browse and select files from the computer (multi-select supported)
2. **Open Files List** — Shows all currently open editor tabs (excluding diff tabs) with per-file actions:
   - **Already manually attached**: The file is hidden from the list since it already appears as a removable chip below the input
   - **Available to attach**: Displays a green plus (+) icon. Clicking attaches the file
   - **Unsaved files** (no path on disk): Shown as disabled/greyed out and cannot be attached

The popover has a maximum height of 360px and scrolls when the file list is long. A close button (X) appears in the top-right corner.

**Tab Bar Context Menu:**

Right-clicking a file tab shows AI attachment options:

- **Attach/Remove *filename***: Attach or detach the file from the AI context

**Supported File Types:**

- **Text files**: `.txt`, `.md`, `.markdown`, `.json`, `.js`, `.ts`, `.tsx`, `.jsx`, `.css`, `.html`, `.xml`, `.yaml`, `.yml`, `.log` — sent inline as `[File: filename]\ncontent` in the message
- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp` — Base64-encoded and sent with their MIME type using provider-specific image formats

**In Ask Mode**, attached files are included in the single-question API call and cleared from the attachment list after sending.

### Loading Indicators

#### Nexus Aura

While any AI request is active, the Nexus panel displays the **Nexus Aura** — a continuously rotating conic gradient that sweeps around the outer border of the panel in a loop of deep blue → cyan → white → gold → amber → white → cyan → deep blue. It is implemented as a 3px masked pseudo-element (`conic-gradient` driven by a CSS custom property `--border-angle` that animates from 0° to 360°) layered on top of the panel border. The Nexus Aura is visible in every mode (Ask, Edit, Create) and stops as soon as the request completes or is cancelled.

**Ask Mode:**

- The **Ask Progress Stepper** (`AskProgress` component) is displayed in the messages area — a vertical timeline showing the active phase(s):
  - Without web search: one step — **Getting Answer**
  - With web search: three steps — **Optimizing Query → Searching the Web → Getting Answer**
- Each active step shows rotating typewriter messages (e.g., "Thinking it through...", "Searching the web...", "Refining your question...")
- Completed steps show their elapsed time (e.g., `420ms`, `1.2s`)

**Edit Mode:**

- The **Edit Progress Stepper** (`EditProgress` component) is displayed in the messages area — a vertical timeline showing the active phase(s):
  - Without web search: one step — **Applying Edits**
  - With web search: three steps — **Optimizing Query → Searching the Web → Applying Edits**
- Each active step shows rotating typewriter messages (e.g., "Rewriting content...", "Fetching live context...")
- Step indicators use green (success color) for active and completed states

**Create Mode:**

- The **Create Progress Stepper** is displayed in the messages area (see [Loading States — Create Progress](#loading-states--create-progress) in the Create Mode section)

**Provider/Model Loading:**

- When provider statuses are being fetched on startup, a centered spinner appears in place of the chat UI
- When models are being loaded for a selected provider, a loading indicator is shown in the model dropdown

---

## Web Search

When a Serper API key is configured, all three AI modes can optionally include live web context in their requests. The web search pipeline is managed by the `useWebSearch` hook and runs as a two-phase process before the main AI call.

### How Web Search Works

**Phase 1 — Query Optimization** (`optimizing`)

Before executing a search, a lightweight AI call rewrites the user's natural-language question into an optimized search query. The optimizer is instructed to:

- Add precise keywords, proper nouns, and technical terms
- Include recency signals when implied (e.g., "2025", "latest", "current")
- Use quotation marks for exact phrases when beneficial
- Keep queries short and natural (under 12–15 words when possible)
- Return a JSON object with a `primary` query and a `fallback` broader variant

If the optimizer call fails or returns unparseable output, the original user question is used as the search query.

**Phase 2 — Search Execution** (`searching`)

The optimized query is sent to the Serper API, which returns up to 5 results. The top 3 results are formatted into a context block injected into the AI prompt:

```
WEB SEARCH RESULTS (use only for this question):

[1] Result Title
Snippet text here.
Source: https://example.com

[2] ...
```

The sources (title + URL) are also stored separately on the AI message for display below the response.

**Result:** `{ webSearchBlock, sources: [{title, link}], optimizedQuery }`

### Web Search in Ask Mode

When web search is enabled for an Ask request, the search block is appended to the user prompt. If the optimized query differs meaningfully from the original question, a note is added to the prompt: `Search query used: "{optimizedQuery}"`.

The Ask mode system prompt includes additional instructions for web search responses:

- Treat the search results as the primary source for current, factual, or time-sensitive details
- Prioritize the most relevant and recent results; cite specific sources when they directly support the answer
- Synthesize multiple results rather than repeating any single one
- If results are weak, irrelevant, or empty, ignore them completely and answer from general knowledge — never mention that a search was performed unless the user asks

After the response, **web search indicator** is shown below assistant messages that used search:
- A small **"Web search included"** badge (globe icon + label) appears beneath the response
- A **Sources** section lists the linked page titles used to answer the question

### Web Search in Edit and Create Modes

Edit and Create modes follow the same two-phase pipeline via `useWebSearch`. The resulting web search block is injected into the document editing or content generation prompt as additional context. The progress steppers for both modes show the web search steps (Optimizing Query, Searching the Web) when enabled, before the main AI step. See [Edit Mode](#edit-mode-and-diff-system) and [Create Mode](#create-mode) for mode-specific behavior.

---

## Ask Mode

Ask Mode is a **stateless Q&A** interface. Each question is completely independent — no conversation history is maintained between requests.

### How Ask Mode Works

When the user submits a question in Ask mode:

1. A baked-in system prompt is prepended to the question:
   ```
   You are a direct, concise question-answering assistant. Follow these rules strictly:
   - Answer ONLY the current question. Do not reference any previous questions or answers.
   - Be concise and direct. Lead with the answer, not reasoning.
   - If the question is unclear, ask exactly ONE clarifying question.
   - If file context is provided, use it to inform your answer but do not summarize the files unless asked.
   - Use Markdown formatting when it improves readability (code blocks, lists, bold).
   - Do not add preamble, filler, or follow-up questions — just answer.
   - The attached web search results were generated from an optimized query designed to match the user's exact intent — treat them as the primary source for any current, factual, or time-sensitive details.
   - Prioritize the most relevant and recent results first; cite specific sources when they directly support your answer.
   - If multiple results are provided, synthesize them rather than repeating any single one.
   - If the results are weak, irrelevant, or empty, ignore them completely and answer from general knowledge — never mention that a search was performed unless the user specifically asks about sources.
   ```
   The web-search-specific instructions are always present in the system prompt; when no web search was performed they have no effect.
2. If web search is enabled, the two-phase search pipeline runs first (see [Web Search](#web-search)), then the formatted search results are appended to the user message
3. The combined system prompt + user question (+ any search context + attached files) is sent as a **single user message** — no prior messages are included
4. The response is displayed as an assistant bubble; the user question is displayed as a user bubble
5. Attached files are cleared from the attachment list after sending

Each question is fully independent at the API level. The Q&A history shown in the panel is for reference only and is never sent to the AI.

**Provider routing** follows the same pattern as other modes: requests are routed to the appropriate provider channel (`claudeChatRequest`, `openaiChatRequest`, `geminiChatRequest`, or `aiChatRequest` for xAI) based on the selected model's provider.

### Ask Mode Output

- Question/answer pairs are displayed as chat bubbles and persist in the panel for the session
- Each assistant response includes a **Copy** button for easy copying
- When web search was used for a response:
  - A **"Web search included"** badge (globe icon) appears below the response text
  - A **Sources** section lists the titles and links of the pages used, clickable to open in the browser
- Clearing the chat (delete icon in the header) removes all Ask mode history
- Ask mode history is not persisted across sessions

### New File from Response

Every assistant message (in both Ask and multi-agent modes) includes a **New File** button next to the Copy button at the bottom of the response:

- Click **New File** to instantly open a new `Untitled.md` editor tab containing the full response content
- The tab opens in **preview mode** for immediate reading
- The file is unsaved (`path: null`) — save it with `Ctrl+S` to write it to disk
- Useful for turning a detailed AI response into a working document without copy-pasting

---

## Edit Mode and Diff System

### Activating Edit Mode

- Select **Edit** from the Mode dropdown in the Nexus panel
- When active, the send button turns green and shows an edit icon instead of a send icon
- The placeholder text changes to:
  - `"Describe the changes you want... (e.g., 'Add a table of contents')"` — default
  - `"Describe changes... (web search enabled)"` — when web search is toggled on
- Edit mode is supported for **all four providers**: Claude, OpenAI, Google Gemini, and xAI. xAI uses `response_format: json_object` on the chat completions API to enforce JSON output. xAI multi-agent models (e.g., `grok-4-multi-agent`) are still restricted from Edit mode (no diff support)
- Edit mode is disabled while a diff tab is already open
- If a Serper key is configured, a **globe icon** toggle is shown next to the input. When enabled, a web search runs before the edit request and its results are included as context in the edit prompt

### Chat Context Toggle

When there are messages in the Ask (or multi-agent) chat history, a **History icon** toggle button appears in the input toolbar while in Edit or Create mode:

- Click the icon to **include Ask chat history as context** for the upcoming Edit or Create request
- When enabled, the icon turns **blue** to indicate context is active
- The toggle state persists in `config.json` (`aiChatContextEnabled`) and is restored on next launch
- The button is only shown when there are actually Ask/multi-agent messages to include (it hides when the chat is empty)
- The chat context is injected into the AI prompt as a clearly delimited block (see [How Edits Are Requested](#how-edits-are-requested) below), so the AI knows it is prior conversation context and not a direct instruction

**Use case**: Ask a series of questions in Ask mode to research a topic, then switch to Edit or Create mode and enable the toggle so the AI can draw on what was just discussed when making changes or generating new content.

### How Edits Are Requested

When the user sends a message in edit mode:

1. The current document content and file name are wrapped in a structured prompt:

   ```
   Edit the following markdown document.

   File: {fileName}

   Requested changes:
   {user's prompt}

   --- PREVIOUS CHAT CONTEXT (use only if relevant to the edit) ---
   [user]: {prior ask question}
   [assistant]: {prior ask answer}
   ... (only present when the Chat Context toggle is enabled)
   --- END CHAT CONTEXT ---

   Current document:
   ```markdown
   {document content}
   ```

   Return a JSON object with the complete modified document.
   ```


2. The AI receives a system prompt instructing it to return only a JSON object:

   ```json
   {
     "modifiedContent": "# Title\n\nUpdated content...",
     "summary": "Brief description of what was changed"
   }
   ```
3. The response is parsed using a three-strategy approach to handle imperfect JSON:

   - **Strategy 1**: Parse the response as-is (pure JSON)
   - **Strategy 2**: Strip markdown code fences (` ```json ... ``` `) and parse
   - **Strategy 3**: Extract JSON by finding the first `{` and last `}` in the response
4. Claude uses `max_tokens: 16384` for edit requests (vs 4096 for chat) to accommodate full document rewrites. OpenAI uses `response_format: { type: 'json_object' }` to enforce JSON output. Gemini uses `response_mime_type: 'application/json'` for guaranteed JSON responses, with the system prompt prepended as the first user message (Gemini's `generateContent` API does not have a dedicated system role).

### Diff Computation

Once the AI returns modified content, diffs are computed using the `diff` npm library's `diffLines` function:

**Line ending normalization:**

- Both the original and modified content are normalized to LF (`\n`) before diffing. This prevents false diffs when the AI returns LF line endings but the original file uses CRLF (`\r\n`).
- When accepted changes are applied back to the source file, the original line ending style (CRLF or LF) is restored.

**Pass 1 - Build raw hunks:**

- The normalized original and modified content are compared line by line
- Consecutive removed+added pairs are detected by checking if the previous change was a removal (`changes[i-1]?.removed`) and merged into `modify` type hunks
- Each hunk captures: original lines, new lines, type (`add`/`remove`/`modify`), start and end line numbers

**Pass 2 - Merge nearby hunks:**

- Hunks separated by 2 or fewer unchanged lines are merged into a single grouped hunk
- The bridging unchanged lines are included in both the original and new line arrays of the merged hunk
- This prevents the UI from showing many tiny scattered changes

Each hunk has a `status` field: `pending`, `accepted`, or `rejected`.

### Diff Tab and Visualization

When the AI returns modified content, a **new diff tab** opens in the tab bar — modeled after the diff experience in VS Code and Cursor. This approach keeps the diff separate from the source file and provides a dedicated review experience.

**How the diff tab works:**

1. A new virtual file entry is created with `viewMode: 'diff'` and the name `"{originalName} (AI Diff)"`
2. The diff tab stores a `sourceFileId` linking it back to the original file, and a `diffSession` containing the computed hunks, original/modified content, and AI summary
3. The diff tab becomes the active tab automatically
4. The source file's tab remains in the tab bar but becomes read-only while the diff tab is open

**Tab bar appearance:**

- Diff tabs display a blue **FileDiff** icon instead of the usual save/dirty indicator
- Diff tabs do not show the edit/preview toggle button (they are always in diff view mode)
- The tab tooltip shows "AI Changes"
- Closing a diff tab discards any unresolved pending changes

**Diff view rendering:**
The `DiffView` component renders a unified inline diff using React elements (not HTML strings):

| Element                  | Appearance                                                                  |
| ------------------------ | --------------------------------------------------------------------------- |
| Unchanged lines          | Normal rendering, no special styling                                        |
| Removed lines (original) | Red background tint, red left border (3px), strikethrough text, 70% opacity |
| Added lines (new)        | Green background tint, green left border (3px)                              |
| Current hunk (focused)   | Blue outline (2px) around the entire hunk                                   |

The background colors adapt to light/dark theme (15% opacity in light mode, 25% in dark mode).

**Summary banner:**

- At the top of the diff view, a banner displays the AI's summary of what was changed
- A chip shows the count of pending hunks remaining to be resolved

**Hunk resolution display:**

- **Pending hunks**: Show both removed (original) and added (new) lines with inline accept/reject buttons
- **Accepted hunks**: Show only the new lines as normal text
- **Rejected hunks**: Show only the original lines as normal text

### Accepting and Rejecting Changes

Changes can be managed through two UI components:

**Inline hunk controls** (on the first line of each pending hunk):

- **Accept** button (green checkmark): Accept this hunk's changes
- **Reject** button (red undo): Reject this hunk's changes
- These buttons appear directly within the diff view on the first line of each pending hunk

**DiffNavigationToolbar** (floating toolbar, bottom-right of diff view):

- **Previous/Next** buttons: Navigate between hunks (shows current position as "X / Y")
- **Keep** button (green): Accept the currently focused hunk
- **Undo** button (red): Reject the currently focused hunk
- **Keep All** button (green, shows pending count): Accept all remaining pending hunks
- **Cancel** button (X icon): Close the diff tab and discard all changes

**How changes are applied:**

- When a hunk is accepted, the `applyAcceptedHunks()` function rebuilds the source file's content line by line, selecting new or original lines based on each hunk's status
- If the source file uses CRLF line endings, the result is converted back from LF to CRLF before updating the source file
- The source file's previous content is pushed to its undo stack before changes are applied, so changes can be undone
- When all hunks are resolved (none remain pending), the diff tab **auto-closes** and the editor switches back to the source file tab
- A global notification toast appears: *"AI changes applied. Remember to save your file (Ctrl+S)."* — this uses the app-level `SHOW_NOTIFICATION` dispatch so it survives the diff tab unmounting
- If the diff tab is closed manually (or via Escape), no changes are applied to the source file

### Keyboard Shortcuts

While a diff tab is active, the following keyboard shortcuts are available:

| Key                    | Action                                 |
| ---------------------- | -------------------------------------- |
| `J` or `ArrowDown` | Navigate to next change                |
| `K` or `ArrowUp`   | Navigate to previous change            |
| `Enter` or `Y`     | Accept (keep) current change           |
| `Backspace` or `N` | Reject (undo) current change           |
| `Ctrl+Shift+A`       | Accept all pending changes             |
| `Escape`             | Close diff tab and discard all changes |

Navigation auto-scrolls to bring the focused hunk into view.

### Source File Protection

While a diff tab is open for a file, the source file's tab is placed in a **read-only state**:

- The editor content is dimmed (70% opacity)
- All editing interactions are disabled (typing, paste, drag-and-drop, keyboard shortcuts)
- The cursor changes to `default` to indicate non-editable state
- Toolbar insert, undo, and redo actions are disabled

This prevents conflicts between manual edits and the pending diff changes. Once the diff tab is closed (either by resolving all hunks or by canceling), normal editing resumes.

---

## Create Mode

Create Mode generates a **complete, new Markdown document** from a user description and opens it as a new editor tab.

### Activating Create Mode

- Select **Create** from the Mode dropdown in the Nexus panel
- The input placeholder changes to "Describe what you want to create... (e.g., 'A blog post about React hooks', 'A project README')"
- The send button shows a create icon with a secondary (purple) color
- Create mode is supported for all four providers: **Claude**, **OpenAI**, **Google Gemini**, and **xAI**

### Chat Context Toggle

The same **History icon** toggle available in Edit mode is also present in Create mode. When there are Ask or multi-agent messages in the chat history and the toggle is enabled, the chat context is included in the content generation prompt as a **Previous Chat Context** reference block. See [Chat Context Toggle](#chat-context-toggle) in the Edit Mode section for full details — the behavior is identical.

### How Create Mode Works

Create Mode uses a **two-phase AI pipeline**:

**Phase 1 — Content Generation:**

When the user submits a description, the AI is instructed to generate a complete, well-structured Markdown document based on the description. Any attached files are included as context to inform the content. The prompt template instructs the AI to:
- Generate a complete document (not a skeleton or outline)
- Use proper Markdown structure with headings, lists, and formatting
- Tailor the output to the described content type (blog post, README, spec, letter, etc.)
- Use the attached file context to inform the content if provided

**Phase 2 — Filename Generation:**

After the content is generated, a lightweight AI call generates a short, descriptive Title Case filename (max 30 characters, no extension). The result is sanitized, and falls back to a slug derived from the description if naming fails.

Both phases support automatic continuation for long responses (`callWithContinuation`).

### Create Mode Output

The generated document is opened as a **new virtual Markdown file tab** in preview mode:
- Tab name: AI-inferred descriptive name with `.md` extension (e.g., `React Hooks Blog Post.md`)
- File is virtual (not saved to disk) with `path: null`
- Opens in preview mode for immediate reading
- Can be saved to disk using `Ctrl+S` / Save As

### Loading States — Create Progress

During a Create request, the chat panel displays the user's description (as a user bubble) followed by the **Create Progress Stepper** (`CreateProgress` component) — a vertical timeline visualizing both phases:

```
◉ Generating Content              ⟳ active
  "Generating your content..."

○ Naming Document                 pending
```

After both phases complete:

```
● Generating Content              ✓
● Naming Document                 ✓
● Document Created
```

**Step indicators:**
- **Active** (pulsing secondary/purple dot): Currently running, shows a rotating typewriter message
- **Complete** (green checkmark): Phase finished

**Phase-specific typewriter messages** rotate every 5 seconds:
- **Generating**: "Generating your content...", "Crafting the document...", "Writing sections...", "Building your document...", "Composing content..."
- **Naming**: "Naming your document...", "Picking a title...", "Generating filename..."

When the document is created, a green **"Created — filename.md"** banner appears in the messages area.

### Cancellation

Create requests can be canceled at any time using the Cancel button. All in-flight API calls (content generation and naming — including any continuation calls) are aborted.

---

## Supported AI Providers

### Claude (Anthropic)

- **API Endpoint**: `https://api.anthropic.com/v1/messages`
- **Authentication**: `X-Api-Key` header
- **API Version**: `2023-06-01`
- **Default Fallback Models**: Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5
- **Chat Token Limit**: 4,096 max output tokens
- **Edit Token Limit**: 16,384 max output tokens
- **Ask Mode**: Supported
- **Edit Mode**: Supported (uses system prompt for structured JSON output)
- **Create Mode**: Supported
- **Image Attachments**: Native format with `media_type` and base64 `data`
- **Model Filtering**: Only `claude-` models are included; old Claude 3 base generation (pre-3.5) models are excluded
- **Validation**: Test call to `/v1/models` endpoint
- **Error Logging**: Full error response body is captured and logged for debugging API issues

### OpenAI

- **API Endpoint**: `https://api.openai.com/v1/chat/completions`
- **Authentication**: `Bearer` token in `Authorization` header
- **Default Fallback Models**: GPT-5.2, GPT-5.1, GPT-5, GPT-5 Mini, GPT-4o Latest, o3, o4 Mini
- **Ask Mode**: Supported
- **Edit Mode**: Supported (uses `response_format: { type: 'json_object' }`)
- **Create Mode**: Supported
- **Image Attachments**: Data URL format with `image_url`
- **Model Filtering**: GPT models included only with `-latest` suffix; o-series reasoning models included as base IDs only (e.g., `o1`, `o3`, `o4-mini`)
- **Validation**: Test call to list models endpoint

### Google Gemini

- **API Endpoint**: `https://generativelanguage.googleapis.com/v1beta`
- **Authentication**: `x-goog-api-key` header
- **Default Fallback Models**: Gemini 3 Pro Preview, Gemini 3 Flash Preview
- **Ask Mode**: Supported
- **Edit Mode**: Supported (uses `response_mime_type: 'application/json'` for JSON mode; system prompt prepended as first user message since Gemini lacks a dedicated system role)
- **Create Mode**: Supported
- **Image Attachments**: Inline data format with `mimeType` and base64 `data` in Gemini's `inlineData` part
- **Text Attachments**: Appended as text parts in the Gemini `parts` array
- **Model Filtering**: Only `gemini-` branded chat models that support `generateContent`; excludes embedding, image-generation, dated snapshot, numbered version, and `-latest` alias variants
- **Validation**: Test call to list models endpoint
- **Role Mapping**: Gemini uses `model` instead of `assistant` for the assistant role

### xAI (Grok)

- **API Endpoint**: `https://api.x.ai/v1/chat/completions` (chat); `https://api.x.ai/v1/responses` (multi-agent)
- **Authentication**: `Bearer` token in `Authorization` header
- **Default Fallback Models**: Grok 4, Grok 4.1, Grok 4.1 Reasoning
- **Ask Mode**: Supported (standard Grok models use chat completions; multi-agent models use the Responses API)
- **Edit Mode**: Supported for standard Grok models via `response_format: json_object`; multi-agent models are restricted from Edit mode
- **Create Mode**: Supported (including multi-agent models)
- **Image Attachments**: Data URL format with `image_url` (same as OpenAI format)
- **Text Attachments**: Inline text content format
- **Model Filtering**: Only `grok-4` models; excludes image, video, and image-generation variants
- **Validation**: Test call to list models endpoint

#### Multi-Agent Mode (xAI Responses API)

When a **multi-agent model** is selected (any model ID containing `multi-agent`, e.g., `grok-4-multi-agent`), Ask mode automatically uses the **xAI Responses API** (`POST /v1/responses`) instead of chat completions. This enables multi-turn stateful conversations backed by multiple collaborating AI agents.

**How it works:**

- The request is sent with a system prompt instructing the AI to use all available tools and answer thoroughly
- Built-in tools can be toggled in the message input toolbar: **Web Search** (`web_search`), **X Search** (`x_search`), and **Code Execution** (`code_execution`) — default enabled: `web_search`, `x_search`
- **Reasoning Effort** can be toggled between **Low** (4 agents) and **High** (16 agents) via a button in the toolbar
- The API returns a `response_id` that is passed back as `previous_response_id` on subsequent requests, enabling multi-turn conversation continuity
- Token usage (including `reasoning_tokens`) is tracked and available per response

**Progress display:**

The **MultiAgentProgress** component shows live activity during the request:
- **Streaming mode** (when verbose stream events arrive via `ai:multi-agent-stream` IPC): shows agent names, active tool calls as chips, reasoning token count, total event count, and a live content preview of the streaming response
- **Fallback mode** (no stream data): shows rotating typewriter messages ("Agents collaborating...", "Research in progress...", etc.)

Multi-agent responses support the same **Copy** and **New File** buttons as standard Ask mode responses. Multi-agent message history is included in the Chat Context Toggle used by Edit and Create modes.

---

## Architecture

### File Structure

**Renderer (React UI):**

| File                                                      | Purpose                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/renderer/components/AIChatDialog.tsx`              | Main chat panel component, orchestrates sub-components and routes mode requests |
| `src/renderer/components/ChatMessages.tsx`              | Chat message bubbles with Markdown rendering                                 |
| `src/renderer/components/FileAttachmentsList.tsx`       | File attachment chips management                                             |
| `src/renderer/components/AttachFilePopover.tsx`         | Popover for attaching open files or browsing from disk                       |
| `src/renderer/components/MessageInput.tsx`              | Message text input, mode/model selectors, send/cancel controls, spell check  |
| `src/renderer/components/SpellCheckContextMenu.tsx`     | Themed MUI context menu for spell-check suggestions and dictionary actions    |
| `src/renderer/components/AskProgress.tsx`               | Ask Mode progress stepper (web search phases + answering)                    |
| `src/renderer/components/EditProgress.tsx`              | Edit Mode progress stepper (web search phases + applying edits)              |
| `src/renderer/components/CreateProgress.tsx`            | Create Mode progress stepper with phase visualization                        |
| `src/renderer/components/TabBar.tsx`                    | File tabs with AI attachment context menu                                    |
| `src/renderer/components/CodeBlock.tsx`                 | Syntax-highlighted code blocks using PrismLight (react-syntax-highlighter)   |
| `src/renderer/components/DiffView.tsx`                  | Dedicated diff tab view with unified inline diff rendering                   |
| `src/renderer/components/DiffNavigationToolbar.tsx`     | Floating toolbar for navigating and resolving diff hunks                     |
| `src/renderer/components/DiffHunkControl.tsx`           | Per-hunk inline accept/reject buttons                                        |
| `src/renderer/hooks/useAIChat.ts`                       | Provider/model loading and selection management                              |
| `src/renderer/hooks/useAIAsk.ts`                        | Ask mode stateless Q&A logic with web search integration                     |
| `src/renderer/hooks/useAIDiffEdit.ts`                   | Edit mode logic, diff computation, opens diff tab                            |
| `src/renderer/hooks/useAICreate.ts`                     | Create mode two-phase pipeline (generate + name)                             |
| `src/renderer/hooks/useAIMultiAgent.ts`                 | Multi-agent mode: Responses API call, stream event handling, multi-turn state |
| `src/renderer/components/MultiAgentProgress.tsx`        | Multi-agent progress UI: streaming agent/tool activity or fallback typewriter |
| `src/renderer/hooks/useWebSearch.ts`                    | Two-phase web search pipeline (query optimization + Serper execution)        |
| `src/renderer/hooks/useAIProviderCache.ts`              | App-level provider status and model cache (shared across components)         |
| `src/renderer/hooks/useSpellCheck.ts`                   | Reusable hook for spell-check menu state and correction/dictionary callbacks  |
| `src/renderer/hooks/useEditLoadingMessage.ts`           | Typewriter-animated loading messages for Edit mode                           |
| `src/renderer/aiProviderModeRestrictions.ts`            | Defines which providers are restricted from which chat modes                 |
| `src/renderer/contexts/AIProviderCacheContext.tsx`      | React context for sharing provider cache across the component tree           |
| `src/renderer/utils/callProviderApi.ts`                 | Single routing function for all provider chat API calls                      |
| `src/renderer/utils/diffUtils.ts`                       | Diff computation utilities (line ending normalization, hunk building)        |
| `src/renderer/types/diffTypes.ts`                       | TypeScript interfaces for DiffHunk and DiffSession                           |
| `src/renderer/contexts/EditorContext.tsx`               | State reducer for diff tab actions (open, update, close)                     |

**Main Process (Electron Backend):**

| File                                     | Purpose                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `src/main/aiIpcHandlers.ts`            | IPC handlers for all AI requests, JSON parsing, model filtering      |
| `src/main/services/claudeApi.ts`       | Claude API integration (chat, edit, model listing, validation)       |
| `src/main/services/openaiApi.ts`       | OpenAI API integration (chat, JSON mode, model listing, validation)  |
| `src/main/services/geminiApi.ts`       | Gemini API integration (chat, JSON mode, model listing, validation)  |
| `src/main/services/xaiApi.ts`          | xAI API integration (chat, JSON mode for edit, model listing, validation) |
| `src/main/services/xaiMultiAgentApi.ts` | xAI Responses API integration (multi-agent requests, verbose streaming) |
| `src/main/services/secureStorage.ts`   | Encrypted API key storage using Electron safeStorage                 |
| `src/main/secureStorageIpcHandlers.ts` | IPC handlers for API key operations                                  |

### IPC Communication

All AI operations communicate between the renderer and main process via Electron IPC channels:

| Channel                           | Direction        | Purpose                                          |
| --------------------------------- | ---------------- | ------------------------------------------------ |
| `ai:claude-chat-request`        | Renderer → Main | Send chat message to Claude                      |
| `ai:openai-chat-request`        | Renderer → Main | Send chat message to OpenAI                      |
| `ai:gemini-chat-request`        | Renderer → Main | Send chat message to Google Gemini               |
| `ai:chat-request`               | Renderer → Main | Send chat message to xAI                         |
| `ai:multi-agent-request`        | Renderer → Main | Send multi-agent request via xAI Responses API   |
| `ai:multi-agent-stream`         | Main → Renderer | Push verbose stream events during multi-agent request |
| `ai:edit-request`               | Renderer → Main | Send edit request (Claude, OpenAI, Gemini, or xAI) |
| `ai:cancel-request`             | Renderer → Main | Cancel an active chat request                    |
| `ai:cancel-edit-request`        | Renderer → Main | Cancel an active edit request                    |
| `ai:list-claude-models`         | Renderer → Main | List available Claude models                     |
| `ai:list-openai-models`         | Renderer → Main | List available OpenAI models                     |
| `ai:list-gemini-models`         | Renderer → Main | List available Gemini models                     |
| `ai:list-models`                | Renderer → Main | List available xAI models                        |
| `ai:get-provider-status`        | Renderer → Main | Check all provider connection statuses (4 total) |
| `web:search`                    | Renderer → Main | Execute a Serper web search query                |
| `web:fetch-page`                | Renderer → Main | Fetch and extract plain text from a URL          |
| `secure-storage:set-api-key`    | Renderer → Main | Validate and store an API key (includes `serper`)|
| `secure-storage:has-api-key`    | Renderer → Main | Check if a provider has a stored key             |
| `secure-storage:delete-api-key` | Renderer → Main | Remove a stored API key                          |
| `secure-storage:get-key-status`  | Renderer → Main | Get storage status of all providers + serper     |
| `spellcheck:context-menu`        | Main → Renderer | Forward misspelled word + suggestions to renderer|
| `spellcheck:add-to-dictionary`   | Renderer → Main | Add a word to the custom spell-check dictionary  |
| `spellcheck:replace-misspelling` | Renderer → Main | Replace the last right-clicked misspelled word   |

Request cancellation uses `AbortController` instances tracked by unique request IDs. Each active request is stored in a `Map` and can be aborted by calling the corresponding cancel channel.

### State Management

**Provider Cache** (managed by `useAIProviderCache` hook, shared via `AIProviderCacheContext`):

- `providerStatuses: AIProviderStatuses` - Connection status for all four providers (xai, claude, openai, gemini)
- `isStatusesLoaded: boolean` - Whether the initial status fetch has completed
- Model cache per provider (stored in a ref, not in React state) with deduplication of in-flight fetches
- `isLoadingModelsFor(provider)` - Whether models are currently being fetched for a given provider
- `invalidateModelsForProvider(provider)` - Clears cached models when a provider's enabled state changes

**Model/Provider State** (managed by `useAIChat` hook):

- `models: AIModelOption[]` - Available models across all configured providers
- `selectedModel: string` - Currently selected model ID
- `isLoadingModels: boolean` - Whether models are being fetched
- `inputValue: string` - Current text input value
- `getProviderForModel(modelId)` - Resolves the provider for a given model ID
- Provider auto-selection priority: saved model → first available model

**Ask State** (managed by `useAIAsk` hook):

- `askMessages: AIMessage[]` - Q&A pairs for display (never sent to API); each message may include `webSearchUsed: boolean` and `sources: {title, link}[]`
- `isAskLoading: boolean` - Whether an Ask request is in progress
- `askPhase: AskPhase` - Current phase: `'answering'` or `null` (used to drive AskProgress stepper)
- `webSearchPhase: WebSearchPhase` - Current web search sub-phase from `useWebSearch`: `'optimizing'`, `'searching'`, or `null`
- `askError: string | null` - Current error message
- Exposes: `submitAsk`, `cancelAsk`, `clearAsk`

**Multi-Agent State** (managed by `useAIMultiAgent` hook):

- `multiAgentMessages: AIMessage[]` - Conversation history shown in the panel
- `isMultiAgentLoading: boolean` - Whether a multi-agent request is in progress
- `multiAgentPhase: MultiAgentPhase` - Current phase: `'agents-working'` or `null`
- `multiAgentError: string | null` - Current error message
- `lastUsage: MultiAgentUsageInfo | null` - Token usage for the last response (`input_tokens`, `output_tokens`, `reasoning_tokens`)
- `streamState: MultiAgentStreamState | null` - Live stream data: events buffer (last 50), event count, reasoning tokens, active tool call names, agent activity descriptions, content preview (first 200 chars)
- `previousResponseId: string | null` - xAI response ID used for multi-turn continuity
- Exposes: `submitMultiAgent`, `cancelMultiAgent`, `clearMultiAgent`

**Create State** (managed by `useAICreate` hook):

- `isCreateLoading: boolean` - Whether a Create request is in progress
- `createPhase: CreatePhase` - Current phase: `'creating'`, `'naming'`, `'complete'`, or `null`
- `createComplete: boolean` - Whether the last Create run finished successfully
- `createFileName: string | null` - Filename of the generated document
- `createError: string | null` - Error message if Create failed
- Exposes: `submitCreate`, `cancelCreate`, `dismissCreateProgress`

**Diff State** (stored on diff tab's `IFile` entry):

Diff state is no longer global — it lives on each diff tab's `IFile` object:

- `file.viewMode` - Set to `'diff'` for diff tabs
- `file.sourceFileId` - ID of the original file being diffed against
- `file.diffSession.originalContent` - Snapshot of content before AI edits
- `file.diffSession.modifiedContent` - Full AI-modified content
- `file.diffSession.hunks: DiffHunk[]` - Array of individual changes with statuses
- `file.diffSession.currentHunkIndex` - Currently focused hunk for navigation
- `file.diffSession.summary` - AI-provided summary of changes

**Reducer Actions:**

- `OPEN_DIFF_TAB` - Creates a new diff tab with computed hunks, sets it as active, links to source file via `sourceFileId`
- `UPDATE_DIFF_SESSION` - Accepts or rejects a hunk, rebuilds source file content for accepted changes, auto-closes the diff tab when all hunks are resolved
- `CLOSE_DIFF_TAB` - Closes the diff tab without applying remaining pending changes, switches back to the source file

**Helper hooks:**

- `useHasDiffTab(sourceFileId?)` - Returns `true` if any open file is a diff tab referencing the given source file (used to enforce read-only state on the source file)

**Configuration State** (persisted in `config.json`):

- `aiModels` - Per-provider model enable/disable flags (providers: `xai`, `claude`, `openai`, `gemini`)
- `aiChatDockWidth` - Width of the docked chat panel
- `aiChatMode` - Current AI chat mode (`'ask'`, `'edit'`, or `'create'`)
- `aiChatModel` - Last selected AI model
- `aiChatContextEnabled` - Whether the Chat Context toggle is on (includes Ask history in Edit/Create requests)

**Provider Mode Restrictions** (defined in `aiProviderModeRestrictions.ts`):

- A static map defines which providers are restricted from which modes
- Currently: xAI is restricted from `edit` mode only (structured output not yet available)
- The UI hides restricted model options from the model dropdown when a restricted mode is active
- The send handler also enforces restrictions at runtime as a safety net
- When switching models, if the new model's provider is restricted from the current mode, the mode automatically resets to `ask`
