# Compare Feature

This document describes the Compare feature in Nexus — a side-by-side file comparison tool that lets users visually diff two open files, with line-level highlighting that shows additions, removals, and modifications.

---

## Table of Contents

1. [Overview](#overview)
2. [How to Use](#how-to-use)
   - [Setting the Left File](#setting-the-left-file)
   - [Setting the Right File](#setting-the-right-file)
   - [Clearing the Selection](#clearing-the-selection)
3. [Context Menu States](#context-menu-states)
4. [Compare Dialog](#compare-dialog)
   - [Layout](#layout)
   - [File Tabs](#file-tabs)
   - [Diff View](#diff-view)
   - [Scrolling](#scrolling)
   - [Closing the Dialog](#closing-the-dialog)
5. [Diff Highlighting](#diff-highlighting)
   - [Modified Lines](#modified-lines)
   - [Removed Lines (Left Only)](#removed-lines-left-only)
   - [Added Lines (Right Only)](#added-lines-right-only)
   - [Placeholder Rows](#placeholder-rows)
   - [Identical Files](#identical-files)
6. [Architecture](#architecture)
   - [Key Components](#key-components)
   - [State Management](#state-management)
   - [Diff Computation](#diff-computation)
7. [Logging](#logging)

---

## Overview

The Compare feature allows users to select any two open files and view a full-screen, side-by-side diff. It is accessible via the right-click context menu on any file tab. The left file is chosen first, followed by the right file — once both are selected the compare dialog opens automatically.

The dialog is modal: no actions can be taken in the main application until it is closed.

---

## How to Use

### Setting the Left File

1. Right-click any file tab.
2. Select **Compare - Left** from the context menu.
3. The file is stored as the left-hand reference. The tab bar retains this selection until it is cleared or a comparison is completed.

### Setting the Right File

1. After selecting a left file, right-click any **other** file tab.
2. Select **Compare - Right** from the context menu.
3. The compare dialog opens immediately with the left file on the left pane and the right file on the right pane.
   - If the two files have identical content, no dialog opens. Instead, an info notification appears: `"FileName1" and "FileName2" are the same.`
4. The left file selection is cleared automatically after the dialog opens (or after the identical-files notification).

### Clearing the Selection

- Right-click any file tab (including the file currently set as left) and select **Clear Compare**.
- This discards the left file reference and resets all three menu items to their default states.

---

## Context Menu States

The three compare items appear in the right-click context menu on every file tab. Their enabled/disabled states depend on whether a left file has been selected and which file is being right-clicked.

| Menu Item | Default (no left set) | Left set — same file | Left set — different file |
|---|---|---|---|
| **Compare - Left** | Enabled | Disabled | Disabled |
| **Compare - Right** | Disabled | Disabled | Enabled |
| **Clear Compare** | Disabled | Enabled | Enabled |

> **Why is Compare - Left disabled once a left file is set?**
> To prevent accidentally overwriting the selection. Use **Clear Compare** first, then pick a new left file.

---

## Compare Dialog

### Layout

The dialog is sized to `100vw - 100px` × `100vh - 100px`, centered with a 50px margin on all sides. This keeps the main application window partially visible behind it so users can maintain context of where they are.

```
┌─────────────────────────────────────────────────────┐
│ [X]  FileLeft.md   FileRight.md                     │  ← Header / tabs
├──────────────────────┬──────────────────────────────┤
│ #  │ left content   │ #  │ right content            │  ← Diff view
│ #  │ left content   │ #  │ right content            │
│ #  │ ...            │ #  │ ...                      │
└──────────────────────┴──────────────────────────────┘
```

### File Tabs

Two tabs sit in the header, one for each file. Clicking a tab marks it as **active** (bold text, colored underline). The active tab indicates which file is in focus — this is used to scope future find/search operations against that file's content.

### Diff View

The diff view is a single scrollable container divided into two equal-width columns. Each column has:

- A **line number gutter** (50px, right-aligned, muted color)
- A **content cell** (flex: 1) that fills the remaining width with the line's text

Lines are rendered in a monospace font (`Consolas, Monaco, "Courier New", monospace`) at 14px with a line height of 1.6. Tab characters are expanded to 4 spaces wide.

### Scrolling

Both columns share a single scroll container, so vertical and horizontal scrolling moves both sides in unison. There is only one scrollbar.

### Closing the Dialog

- Click the **X** button in the top-left of the header.
- Press **Escape**.

Closing the dialog does not affect the files or their content. The left file selection is already cleared at the point the dialog opens, so no additional cleanup is needed.

---

## Diff Highlighting

### Modified Lines

When a block of lines was removed from the left and replaced by a different block on the right (a remove immediately followed by an add in the diff output), the lines are **paired side-by-side** and highlighted in both columns:

- **Left column**: red/pink background
- **Right column**: green background

If one side has more lines than the other in a paired modification block, the shorter side is padded with placeholder rows (see below).

### Removed Lines (Left Only)

Lines that exist only in the left file are shown in the left column with a **red/pink background**. The corresponding row in the right column shows a **placeholder** (subtle gray background, no content).

### Added Lines (Right Only)

Lines that exist only in the right file are shown in the right column with a **green background**. The corresponding row in the left column shows a **placeholder** (subtle gray background, no content).

### Placeholder Rows

Placeholder rows use a subtle gray background (`rgba(128, 128, 128, 0.06–0.10)` depending on theme) to indicate that the other side has no corresponding line at that position. They contain a non-breaking space (`\u00A0`) to maintain row height.

### Color Values

| Situation | Light mode | Dark mode |
|---|---|---|
| Removed / modified-left | `rgba(248, 81, 73, 0.15)` | `rgba(248, 81, 73, 0.25)` |
| Added / modified-right | `rgba(46, 160, 67, 0.15)` | `rgba(46, 160, 67, 0.25)` |
| Placeholder | `rgba(128, 128, 128, 0.06)` | `rgba(128, 128, 128, 0.10)` |

These values match the existing AI diff editor color scheme for visual consistency.

### Identical Files

If both files have exactly the same content (after CRLF normalization), the dialog does not open. An **info notification** is shown instead:

> `"FileName1" and "FileName2" are the same.`

---

## Architecture

### Key Components

| File | Purpose |
|---|---|
| `src/renderer/components/CompareDialog.tsx` | Full-screen modal dialog. Handles diff computation, rendering, tab switching, and close. |
| `src/renderer/components/TabBar.tsx` | Hosts compare state, three context menu items, and three handlers. Renders `CompareDialog` when data is set. |
| `src/renderer/components/AppIcons.tsx` | Exports `GitCompareIcon` (Lucide `GitCompareArrows`) used in the context menu items. |

### State Management

Compare state lives entirely in `TabBar` as local `useState` — it is transient UI state that does not need to survive re-mounts or be shared with other parts of the app.

```ts
// ID of the file chosen as "Compare - Left". null when no selection is active.
const [compareLeftFileId, setCompareLeftFileId] = useState<string | null>(null);

// When set, the CompareDialog is rendered. Cleared on dialog close.
const [compareDialogData, setCompareDialogData] = useState<{
    leftFile: IFile;
    rightFile: IFile;
} | null>(null);
```

**No global EditorContext actions are needed.** The `SHOW_NOTIFICATION` dispatch is the only interaction with the global state, used for the identical-files case.

### Diff Computation

Diff computation runs inside a `useMemo` in `CompareDialog`, re-executing only when either file's content changes.

**Library**: [`diff`](https://www.npmjs.com/package/diff) v8.0.3 (`diffLines` function) — already a project dependency used by the AI diff editor.

**Steps:**

1. Normalize both file contents from CRLF to LF to prevent false diffs caused by line-ending differences.
2. Call `diffLines(normalizedLeft, normalizedRight)` to get a flat array of `Change` objects, each marked `added`, `removed`, or neither (unchanged).
3. Iterate through changes:
   - **Unchanged**: emit one `CompareLine` per line with both sides populated and `type: 'unchanged'`.
   - **Removed immediately followed by Added** (modification): zip the two change blocks together line-by-line, emitting `type: 'modified'` lines. If one side is shorter, emit `null` content on that side (rendered as a placeholder).
   - **Removed only**: emit `type: 'removed'` lines with `rightContent: null`.
   - **Added only**: emit `type: 'added'` lines with `leftContent: null`.
4. Return the `CompareLine[]` array, which the render function maps directly to DOM rows.

**`CompareLine` interface:**

```ts
interface CompareLine {
    leftLineNumber:  number | null; // null = placeholder row
    rightLineNumber: number | null;
    leftContent:     string | null; // null = placeholder row
    rightContent:    string | null;
    type: 'unchanged' | 'modified' | 'added' | 'removed';
}
```

---

## Logging

All compare activity is logged to the browser console using the `[TabBar]` and `[CompareDialog]` prefixes, consistent with existing logging conventions in the app.

### TabBar Logs

| Event | Level | Key fields |
|---|---|---|
| Left file selected | `log` | `fileId`, `fileName`, `filePath` |
| Right file selected | `log` | both files' `fileId`, `fileName`, `filePath` |
| Files are identical | `log` | — |
| Dialog opened | `log` | — |
| File lookup failed | `warn` | which side (`leftFile`, `rightFile`) was missing |
| Compare cleared | `log` | `clearedFileId`, `clearedFileName` |

### CompareDialog Logs

| Event | Level | Key fields |
|---|---|---|
| Diff computation started | `log` | `leftFile`, `rightFile`, `leftLen`, `rightLen` (content byte lengths) |
| Diff computation finished | `log` | `totalLines`, `diffLines`, `unchangedLines` |
| Active tab switched to left | `log` | `fileName` |
| Active tab switched to right | `log` | `fileName` |
| Dialog closed | `log` | `leftFile`, `rightFile` |
