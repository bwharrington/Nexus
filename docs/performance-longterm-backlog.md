# Long-Term Performance Backlog

> Items deferred from the March 2026 performance review pass. Each carries implementation risk or complexity that warrants a dedicated effort rather than being bundled with routine changes.

---

## 1. File Tree Virtualization

### Problem

`FileTreeNode` renders the full directory tree recursively as real DOM nodes. For most projects this is fine, but on large repositories (500+ files across many directories) every expand/collapse triggers a full reconciliation of the entire subtree. All nodes — including collapsed ones — remain in the DOM.

### Why It's Deferred

Virtualizing a tree is significantly more complex than virtualizing a flat list:

- **Expand/collapse state** must be tracked externally (already is, via `expandedPaths`) but the virtualized row index must be computed from it dynamically
- **Multi-select with Shift+click** requires a flattened, ordered view of visible nodes
- **Drag-and-drop** (move file/folder) requires hit-testing against virtualized rows
- **Inline rename** (controlled `InputBase`) must stay in viewport during editing
- **Context menus** are anchored to mouse position, not row position — this part is fine
- **Recursive nesting** (arbitrary depth) doesn't map cleanly to fixed-height rows without dynamic height measurement

### Recommended Approach

Use **TanStack Virtual** (`@tanstack/react-virtual`) rather than `react-window` because it supports dynamic heights and is headless (no imposed DOM structure).

Steps:
1. Flatten the visible tree nodes into a single array (already needed for shift-select)
2. Feed that array to `useVirtualizer` with an estimated row height (~28px)
3. Render only the virtualised rows, with `paddingLeft: depth * 16px` for indentation
4. Preserve all existing interaction handlers (toggle, select, rename, drag, context menu)

### Trigger Condition

Prioritise when a user reports sluggishness opening a directory with > 500 files, or when profiling shows > 50ms paint time on expand/collapse.

---

## 2. Chat Message List Virtualization

### Problem

`ChatMessages` renders all messages with a simple `.map()`. For typical sessions (< 50 messages) this is negligible. For power users running long multi-turn conversations (100+ messages, especially with code blocks rendered by `CodeBlock`), the list accumulates many DOM nodes and `ReactMarkdown` instances.

### Why It's Deferred

Chat messages have **variable heights** — a one-liner and a 20-line code-block response differ by 10×. This rules out `FixedSizeList` from `react-window` and requires either:
- **Dynamic measurement** (`react-virtuoso` or TanStack Virtual with `measureElement`) — accurate but adds complexity
- **Estimated heights with correction** — simpler but can cause scroll jump artifacts

Additional complications:
- **Auto-scroll to bottom** on new messages must still work correctly
- **Copy button** and **sources section** on assistant messages are part of each row's variable content
- The `messagesEndRef` scroll anchor pattern needs to be preserved or replaced

### Recommended Approach

Use **`react-virtuoso`** — it has first-class support for:
- Dynamic/unknown item heights
- "Stick to bottom" behaviour (`followOutput`)
- Prepend items without scroll jump
- `endReached` callback for pagination if conversation history ever loads from storage

Steps:
1. Replace `MessagesContainer` map + `messagesEndRef` with `<Virtuoso>` component
2. Pass `data={askMessages}` and `itemContent` render function
3. Set `followOutput="smooth"` to preserve auto-scroll
4. Wrap progress indicators and banners (create, diff, error) as footer components via `components={{ Footer }}`

### Trigger Condition

Prioritise when profiling shows > 16ms render time during message streaming, or when a user reports the chat panel becoming sluggish after a long session.

---

## Notes

- Both items should be implemented on separate feature branches with thorough manual testing of all interaction paths before merging
- Neither requires changes to state management, IPC, or data models — they are pure rendering optimisations
- Consider adding a React Profiler recording before and after each implementation to quantify the improvement
