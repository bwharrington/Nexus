# File Directory Panel

This document describes the File Directory Panel feature in Markdown Nexus — a collapsible, resizable left-hand panel that displays a full directory tree for one or more folders, inspired by the workspace explorer in tools like Obsidian and VS Code.

---

## Table of Contents

1. [Overview](#overview)
2. [Opening and Closing the Panel](#opening-and-closing-the-panel)
   - [Opening a Folder](#opening-a-folder)
   - [Closing a Folder](#closing-a-folder)
   - [Panel Visibility Toggle](#panel-visibility-toggle)
3. [Directory Tree](#directory-tree)
   - [Supported File Types](#supported-file-types)
   - [Expanding and Collapsing Folders](#expanding-and-collapsing-folders)
   - [Selecting and Opening Files](#selecting-and-opening-files)
4. [Per-Directory Toolbar](#per-directory-toolbar)
5. [File and Folder Operations](#file-and-folder-operations)
   - [Creating a New File](#creating-a-new-file)
   - [Creating a New Folder](#creating-a-new-folder)
   - [Sorting](#sorting)
   - [Expand / Collapse All](#expand--collapse-all)
6. [Context Menu](#context-menu)
7. [Drag and Drop](#drag-and-drop)
8. [Multiple Directories](#multiple-directories)
9. [Nexus AI Integration](#nexus-ai-integration)
10. [Persistence and Auto-Restore](#persistence-and-auto-restore)
    - [Open Directories](#open-directories)
    - [Recent Directories](#recent-directories)
    - [Landing Page Integration](#landing-page-integration)
    - [Settings Dialog Integration](#settings-dialog-integration)
11. [Architecture](#architecture)
    - [Key Components](#key-components)
    - [Key Hooks](#key-hooks)
    - [Config Fields](#config-fields)
    - [IPC Channels](#ipc-channels)

---

## Overview

The File Directory Panel gives you a persistent sidebar view of one or more folders on your file system. Unlike the standard Open File workflow (which is file-at-a-time), the panel lets you browse entire project trees, create and organize files and folders, and open documents with a double-click — all without leaving the editor.

Key capabilities:

- Open **multiple directories** simultaneously, each with its own isolated tree view
- **Create, rename, delete, and move** files and folders directly from the panel
- **Drag-and-drop** files and folders within a directory to reorganize them
- **Right-click context menu** with all common file operations
- **Sort** files A-to-Z or Z-to-A per directory
- **Attach files** to the Nexus AI chat context without opening them in the editor
- Automatically **restore open directories** on application startup
- Track **recently opened directories** on the landing page and in Settings

---

## Opening and Closing the Panel

### Opening a Folder

There are two ways to open a folder in the panel:

1. **Open Folder button** in the main toolbar — click the folder icon (with a plus badge) to open the OS folder picker. The selected folder is added to the panel and remembered for next session.
2. **Open Folder button** in the panel itself — when no directories are currently open, the panel displays a centered placeholder with an "Open Folder" button.
3. **Landing page / EmptyState** — recently opened and currently open directories are listed on the landing page. Clicking a recent directory re-opens it directly in the panel.

Each folder open operation:
- Adds the directory to `openDirectoryPaths` in `config.json`
- Adds the directory to `openDirectories` (used by Settings and landing page)
- Adds the directory to `recentDirectories` (if not already present)
- Immediately reads and renders the directory tree

### Closing a Folder

Click the **X (Close)** button in a directory's toolbar. A confirmation dialog appears:

> "Close **FolderName**? The folder will no longer appear in the directory panel."

Clicking **Close Folder** removes the directory from the panel and from `openDirectoryPaths` / `openDirectories` in the config. The directory remains in `recentDirectories` so it can be quickly reopened from the landing page.

### Panel Visibility Toggle

The **panel toggle** button in the main toolbar shows or hides the entire File Directory panel without affecting which directories are currently open. The panel's visibility (`fileDirectoryOpen`) and width (`fileDirectoryWidth`) are both persisted across sessions so the panel reopens at the same size.

---

## Directory Tree

### Supported File Types

The tree displays all files with the following extensions:

| Extension Group | Extensions |
|---|---|
| Markdown | `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`, `.mdx`, `.mdwn`, `.mdc` |
| reStructuredText | `.rst`, `.rest` |
| Plain Text | `.txt` |
| Best-Effort | `.adoc`, `.asciidoc`, `.org`, `.textile` |

Files with other extensions and all hidden files/folders (names starting with `.`) are excluded from the tree. Folders are shown regardless of their contents.

### Expanding and Collapsing Folders

- **Single-click** a folder node to toggle its expansion (expand if collapsed, collapse if expanded).
- Expanded folder paths are tracked in memory per-directory and are **not** persisted across sessions. All folders start collapsed when a directory is first opened or restored.
- Use the **Expand All** / **Collapse All** button in the toolbar to quickly open or close every folder in the tree at once.

### Selecting and Opening Files

- **Single-click** a file to select it (highlights the row). This does not open the file.
- **Double-click** a file to open it in the main editor as a new tab. If the file is already open in a tab, that tab becomes active without opening a duplicate.

---

## Per-Directory Toolbar

Each open directory has its own toolbar displayed at the top of its tree section. The toolbar contains, from left to right:

| Element | Description |
|---|---|
| **Folder name label** | Displays the root folder's name. Truncated with ellipsis if too long. Full path shown on hover via tooltip. |
| **New File** (FilePlus icon) | Creates a new `.md` file in the root of the directory |
| **New Folder** (FolderPlus icon) | Creates a new empty folder in the root of the directory |
| **Sort** (A↓Z / Z↑A icon) | Toggles file sort order between A-to-Z and Z-to-A |
| **Expand/Collapse All** (double chevron icon) | Expands or collapses all folder nodes in the tree |
| **Close** (X icon) | Closes the directory with a confirmation prompt |

---

## File and Folder Operations

### Creating a New File

Click the **New File** button in the toolbar or the **New File** item in a folder's context menu.

- A new file is created on disk in the root of the target folder (toolbar button uses the directory root; context menu uses the right-clicked folder).
- The filename is auto-generated as `Untitled.md`. If `Untitled.md` already exists, it increments: `Untitled 1.md`, `Untitled 2.md`, etc.
- The tree refreshes automatically after creation.
- The new file is **not** automatically opened in the editor; double-click it to open.

### Creating a New Folder

Click the **New Folder** button in the toolbar or the **New Folder** item in a folder's context menu.

- A new empty folder named `New Folder` is created on disk (with auto-increment if the name is taken).
- The tree refreshes automatically after creation.

### Sorting

Each directory maintains its own sort order, persisted across sessions in `config.json` under `openDirectorySort` (a map of directory path → sort order).

- **A-to-Z (asc):** Files within each folder are sorted alphabetically ascending. This is the default.
- **Z-to-A (desc):** Files within each folder are sorted alphabetically descending.

Folders themselves are **not** sorted — they always appear before files in each directory level and maintain their natural file system order.

### Expand / Collapse All

- **Expand All** sets all folder nodes in the tree as expanded.
- **Collapse All** collapses all folder nodes back to the root level.
- The toolbar button icon changes to reflect the current state: chevrons-down-up when all expanded, chevrons-up-down when not.

---

## Context Menu

Right-clicking any file or folder in the tree opens a context menu. The available actions depend on whether the item is a file or folder.

### Folder Actions

| Action | Description |
|---|---|
| **New File** | Create a new `.md` file inside this folder |
| **New Folder** | Create a new subfolder inside this folder |
| **Rename** | Rename the folder inline (activates the inline rename input) |
| **Delete** | Delete the folder and all its contents (with OS confirmation via system dialog) |
| **Reveal in Explorer** | Open the folder's location in the OS file explorer / Finder |
| **Copy Path** | Copy the full absolute path to the clipboard |
| **Copy Name** | Copy just the folder name to the clipboard |

### File Actions

| Action | Description |
|---|---|
| **Rename** | Rename the file inline |
| **Delete** | Delete the file from disk (with OS confirmation) |
| **Reveal in Explorer** | Reveal the file in the OS file explorer / Finder |
| **Copy Path** | Copy the full absolute path to the clipboard |
| **Copy Name** | Copy the filename (with extension) to the clipboard |
| **Attach to Nexus** / **Hide from Nexus** | Toggle whether the file is attached to the Nexus AI chat context (see [Nexus AI Integration](#nexus-ai-integration)) |

### Inline Rename

When **Rename** is selected:
- An inline text input replaces the file/folder label in the tree.
- Press **Enter** or click away to confirm the rename.
- Press **Escape** to cancel without renaming.
- For files, the existing extension is preserved if the new name doesn't include one.

---

## Drag and Drop

Files and folders can be **dragged within a directory** to move them to a different location:

- Drag a file or folder row and drop it onto a **folder** node to move it into that folder.
- Drop onto the **root tree area** (empty space) to move the item to the directory root.
- A visual drop indicator shows where the item will land.
- Drag-and-drop is **isolated within a single directory** — dragging between two open directories is not currently supported.
- The tree refreshes automatically after a move.

---

## Multiple Directories

The panel supports any number of open directories simultaneously:

- Each directory occupies a **vertical section** within the panel, with its own toolbar and tree.
- If the combined height of all open directories exceeds the panel height, the panel becomes **vertically scrollable**.
- Each directory has **independent state**: its own sort order, expanded paths, loading state, and rename state.
- Opening and closing directories via the toolbar's Open Folder button or context menu only affects the targeted directory.

---

## Nexus AI Integration

Files in the directory tree can be attached to the **Nexus AI chat context** without needing to open them in the editor.

- Right-click a file and select **"Attach 'filename' to Nexus"** to add it to the AI chat context. The file is read from disk and made available as a context document for all subsequent AI messages.
- If the file is already attached, the context menu shows **"Hide 'filename' from Nexus"** instead, which removes it from the AI context.
- This operation does not open the file in the editor.
- The attachment state is shared with the main editor's AI attachment system — files attached from the directory panel appear alongside files attached via the tab bar or attachment popover in the Nexus chat dialog.

---

## Persistence and Auto-Restore

### Open Directories

The list of currently open directories is persisted in `config.json` as `openDirectoryPaths` (an ordered array of absolute paths). On application startup, the `useFileDirectories` hook reads this list and automatically re-opens each directory, restoring the panel to the same state as when the app was last closed.

The panel itself (`fileDirectoryOpen: true`) is also restored, so the sidebar is visible if it was visible when the app closed.

### Recent Directories

Every directory that has ever been opened is tracked in `config.json` under `recentDirectories` (an array of absolute paths). Closing a directory removes it from `openDirectoryPaths` but leaves it in `recentDirectories`.

### Landing Page Integration

The **landing page** (shown when no files are open) displays two directory-related sections:

- **Open Directories** — Lists directories that are currently open in the panel. Clicking one re-opens it (or focuses it if already visible).
- **Recent Directories** — Lists previously opened directories. Clicking one opens it in the panel.

### Settings Dialog Integration

The **Settings dialog** displays two read-only directory tables:

- **Open Directories** — Shows all directories currently loaded in the panel.
- **Recent Directories** — Shows the history of all opened directories.

Both tables update reactively as directories are opened and closed.

---

## Architecture

### Key Components

| Component | File | Purpose |
|---|---|---|
| `FileDirectoryContainer` | `src/renderer/components/FileDirectoryContainer.tsx` | Scrollable container that renders all open `DirectoryInstance` objects stacked vertically. Shows an empty state when no directories are open. |
| `FileDirectory` | `src/renderer/components/FileDirectory.tsx` | Renders a single directory section: its toolbar, loading spinner, or tree nodes. |
| `FileDirectoryToolbar` | `src/renderer/components/FileDirectoryToolbar.tsx` | Per-directory toolbar with folder name label, action buttons, and the close confirmation dialog. |
| `FileTreeNode` | `src/renderer/components/FileTreeNode.tsx` | Recursive component for a single file or folder row in the tree. Handles click, double-click, drag, drop, inline rename, and context menu. |
| `FileTreeContextMenu` | `src/renderer/components/FileTreeContextMenu.tsx` | Right-click context menu for file/folder rows with all available actions. |

### Key Hooks

| Hook | File | Purpose |
|---|---|---|
| `useFileDirectories` | `src/renderer/hooks/useFileDirectories.ts` | Central hook that manages the `Map<path, InstanceState>` for all open directories. Exposes `openFolder`, `openRecentDirectory`, and the `directories` array of `DirectoryInstance` objects. Handles auto-restore on startup and config persistence. |

Each `DirectoryInstance` (produced by `useFileDirectories`) exposes the complete per-directory API consumed by `FileDirectory` and its children:

```typescript
interface DirectoryInstance {
    id: string;                    // equals rootPath
    rootPath: string;
    tree: DirectoryNode | null;
    isLoading: boolean;
    expandedPaths: Set<string>;
    sortOrder: FileDirectorySortOrder;
    isAllExpanded: boolean;
    renamingPath: string | null;
    refreshTree: () => Promise<void>;
    closeDirectory: () => void;
    toggleNode: (path: string) => void;
    expandAll: () => void;
    collapseAll: () => void;
    setSortOrder: (order: FileDirectorySortOrder) => void;
    createNewFile: (parentPath?: string) => Promise<void>;
    createNewFolder: (parentPath?: string) => Promise<void>;
    moveItem: (sourcePath: string, destDirPath: string) => Promise<void>;
    deleteItem: (itemPath: string) => Promise<void>;
    renameItem: (oldPath: string, newName: string) => Promise<void>;
    startRename: (path: string) => void;
    cancelRename: () => void;
    openFileInEditor: (filePath: string) => Promise<void>;
}
```

### Config Fields

| Field | Type | Description |
|---|---|---|
| `fileDirectoryOpen` | `boolean` | Whether the panel is currently visible |
| `fileDirectoryWidth` | `number` | Width of the panel in pixels |
| `openDirectoryPaths` | `string[]` | Ordered list of currently open directory paths |
| `openDirectorySort` | `Record<string, FileDirectorySortOrder>` | Per-directory sort order (`'asc'` or `'desc'`), keyed by path |
| `openDirectories` | `string[]` | Mirror of `openDirectoryPaths`; used by Settings and landing page display |
| `recentDirectories` | `string[]` | Historical list of all directories ever opened |

### IPC Channels

All file system operations are handled in the Electron main process and called from the renderer via the preload context bridge:

| Channel | Direction | Purpose |
|---|---|---|
| `file:read-directory` | Renderer → Main | Read a directory tree recursively |
| `file:create-file` | Renderer → Main | Create a new file on disk |
| `file:create-folder` | Renderer → Main | Create a new folder on disk |
| `file:delete` | Renderer → Main | Delete a file or folder (moves to OS trash) |
| `file:rename` | Renderer → Main | Rename or move a file/folder |
| `file:reveal-in-explorer` | Renderer → Main | Open the OS file explorer at the given path |
| `file:read` | Renderer → Main | Read a file's contents (used when opening from the panel) |

---

*Markdown Nexus — File Directory Panel*
