import { useEffect, useRef } from 'react';
import type { IFile } from '../types';

/**
 * Custom hook that handles external file change detection and reload behavior.
 *
 * When a file is modified outside of Markdown Nexus, this hook determines whether
 * to reload it silently or prompt the user, based on the `silentFileUpdates`
 * config setting:
 *
 * - **Silent Updates ON (default):** Files are automatically reloaded in place
 *   with no user interaction required, UNLESS the user has unsaved local edits
 *   in which case the silent reload is skipped and the user is notified.
 * - **Silent Updates OFF:** The user is always prompted with a dialog asking
 *   whether to refresh the file with the latest changes. Choosing "No" marks
 *   the file dirty so the save icon clearly signals the on-disk version differs.
 *
 * The `config.json` file is always auto-reloaded regardless of settings.
 *
 * Performance notes:
 * - Accepts openFiles and dispatch as parameters so the hook does NOT call
 *   useEditorState() internally, avoiding an independent context subscription
 *   that would cause extra reconciliation work.
 * - Uses a ref to hold the latest openFiles so the IPC listener is subscribed
 *   only once (on mount) rather than torn down and re-created on every render.
 * - dispatch from useReducer is stable across renders, so it is safe as an
 *   effect dependency without causing re-subscriptions.
 */

interface UseExternalFileWatcherParams {
    openFiles: IFile[];
    dispatch: ReturnType<typeof import('../contexts').useEditorDispatch>;
    silentFileUpdates: boolean;
}

export function useExternalFileWatcher({ openFiles, dispatch, silentFileUpdates }: UseExternalFileWatcherParams): void {
    // Keep a ref to the latest openFiles so the IPC callback can read
    // current state without the effect needing to re-run on every change.
    const openFilesRef = useRef(openFiles);
    openFilesRef.current = openFiles;

    // Keep a ref to silentFileUpdates so the single-mounted effect always
    // reads the latest config value without re-subscribing the IPC listener.
    const silentFileUpdatesRef = useRef(silentFileUpdates);
    silentFileUpdatesRef.current = silentFileUpdates;

    // Debounce map to prevent multiple prompts for the same file.
    // File saves often trigger multiple fs.watch events (write, metadata, close).
    // Key: file path, Value: timeout ID
    const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Subscribe to the IPC events once on mount, clean up on unmount.
    // The callbacks read from the ref so they never go stale.
    useEffect(() => {
        // Helper to reload a file's content from disk and update editor state
        const reloadFile = async (openFile: IFile, filePath: string) => {
            const fileData = await window.electronAPI.readFile(filePath);
            if (fileData) {
                dispatch({
                    type: 'UPDATE_FILE_CONTENT',
                    payload: {
                        id: openFile.id,
                        content: fileData.content,
                        lineEnding: fileData.lineEnding,
                    },
                });
                console.log('[useExternalFileWatcher] File reloaded from disk', {
                    fileId: openFile.id,
                    filePath,
                    contentLength: fileData.content.length,
                });
            } else {
                console.warn('[useExternalFileWatcher] readFile returned null — file may be inaccessible', { filePath });
            }
        };

        // Helper function that does the actual file change handling
        const handleFileChange = async (filePath: string) => {
            try {
                // Find if this file is open (read from ref for latest state)
                const openFile = openFilesRef.current.find(f => f.path === filePath);
                if (!openFile) {
                    console.log('[useExternalFileWatcher] File not currently open, ignoring change', { filePath });
                    return;
                }

                // Extract filename for display
                const fileName = filePath.split(/[\\/]/).pop() || filePath;

                // Config file: always auto-reload without prompting or notification
                if (filePath.endsWith('config.json')) {
                    console.log('[useExternalFileWatcher] Auto-reloading config file');
                    await reloadFile(openFile, filePath);
                    return;
                }

                // Read silentFileUpdates from the ref (updated on every render via the
                // assignment above) — avoids an IPC round-trip on every file change event.
                const silentUpdates = silentFileUpdatesRef.current;

                console.log('[useExternalFileWatcher] Handling external file change', {
                    fileId: openFile.id,
                    fileName,
                    silentUpdates,
                    isDirty: openFile.isDirty,
                });

                if (silentUpdates) {
                    // Race condition guard: if the user has local unsaved edits, do NOT
                    // silently overwrite them. Instead notify the user and leave the file as-is.
                    if (openFile.isDirty) {
                        console.log('[useExternalFileWatcher] Silent mode skipped — file has unsaved local edits', { fileName });
                        dispatch({
                            type: 'SHOW_NOTIFICATION',
                            payload: {
                                message: `"${fileName}" was changed externally but has unsaved local edits. Save or discard your changes to sync the file.`,
                                severity: 'warning',
                            },
                        });
                        return;
                    }

                    // Silent mode: reload automatically with no prompt
                    console.log('[useExternalFileWatcher] Silent mode — auto-reloading file', { fileName });
                    await reloadFile(openFile, filePath);

                    // Notify the user that the file was refreshed so the update isn't invisible
                    dispatch({
                        type: 'SHOW_NOTIFICATION',
                        payload: {
                            message: `"${fileName}" was updated from disk.`,
                            severity: 'info',
                        },
                    });
                } else {
                    // Prompt mode: always ask the user before refreshing
                    console.log('[useExternalFileWatcher] Prompt mode — showing dialog for file', { fileName });
                    const result = await window.electronAPI.showExternalChangeDialog(fileName);
                    console.log('[useExternalFileWatcher] User response to external change dialog', { fileName, result });

                    if (result === 'reload') {
                        await reloadFile(openFile, filePath);
                    } else {
                        // User chose to keep their current content. Mark the file dirty and
                        // store the pending external path so the tab can show a refresh button.
                        dispatch({
                            type: 'SET_DIRTY',
                            payload: { id: openFile.id, isDirty: true },
                        });
                        dispatch({
                            type: 'SET_PENDING_EXTERNAL_PATH',
                            payload: { id: openFile.id, path: filePath },
                        });
                        console.log('[useExternalFileWatcher] User kept local content — marked file dirty, pending refresh available', { fileName });
                    }
                }
            } catch (error) {
                const filePart = filePath.split(/[\\/]/).pop() || filePath;
                console.error('[useExternalFileWatcher] Error handling external file change', {
                    filePath,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                });
                // Notify the user so they know the file state may be stale
                dispatch({
                    type: 'SHOW_NOTIFICATION',
                    payload: {
                        message: `Failed to handle external change for "${filePart}". The file may be out of sync.`,
                        severity: 'error',
                    },
                });
            }
        };

        const cleanupChange = window.electronAPI.onExternalFileChange(async (filePath: string) => {
            console.log('[useExternalFileWatcher] External file change detected', { filePath });

            // Clear any existing debounce timer for this file
            const existingTimer = debounceTimersRef.current.get(filePath);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            // Set a new debounce timer (300ms is enough to coalesce multiple fs events)
            const timer = setTimeout(async () => {
                debounceTimersRef.current.delete(filePath);
                await handleFileChange(filePath);
            }, 300);

            debounceTimersRef.current.set(filePath, timer);
        });

        const cleanupRename = window.electronAPI.onExternalFileRename((filePath: string) => {
            console.log('[useExternalFileWatcher] External file rename/delete detected', { filePath });

            const openFile = openFilesRef.current.find(f => f.path === filePath);
            if (!openFile) return;

            // Detach the file from its saved path and mark it dirty so the user
            // knows it needs to be saved again under a name of their choosing.
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            dispatch({ type: 'DETACH_FILE_PATH', payload: { id: openFile.id } });
            dispatch({
                type: 'SHOW_NOTIFICATION',
                payload: {
                    message: `"${fileName}" was renamed or moved externally. The file needs to be saved again.`,
                    severity: 'warning',
                },
            });
        });

        return () => {
            // Clear all pending debounce timers on unmount
            debounceTimersRef.current.forEach(timer => clearTimeout(timer));
            debounceTimersRef.current.clear();
            cleanupChange();
            cleanupRename();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Runs once on mount. dispatch is stable; openFiles read via ref.
}
