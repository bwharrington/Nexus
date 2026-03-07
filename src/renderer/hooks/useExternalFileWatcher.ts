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
 *   with no user interaction required.
 * - **Silent Updates OFF:** The user is always prompted with a dialog asking
 *   whether to refresh the file with the latest changes. Choosing "No" keeps
 *   the current editor content; saving will overwrite the external changes.
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
}

export function useExternalFileWatcher({ openFiles, dispatch }: UseExternalFileWatcherParams): void {
    // Keep a ref to the latest openFiles so the IPC callback can read
    // current state without the effect needing to re-run on every change.
    const openFilesRef = useRef(openFiles);
    openFilesRef.current = openFiles;

    // Debounce map to prevent multiple prompts for the same file.
    // File saves often trigger multiple fs.watch events (write, metadata, close).
    // Key: file path, Value: timeout ID
    const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Subscribe to the IPC events once on mount, clean up on unmount.
    // The callbacks read from the ref so they never go stale.
    useEffect(() => {
        // Helper function that does the actual file change handling
        const handleFileChange = async (filePath: string) => {

            // Find if this file is open (read from ref for latest state)
            const openFile = openFilesRef.current.find(f => f.path === filePath);
            if (!openFile) {
                return;
            }

            // Helper to reload a file and update the editor state
            const reloadFile = async () => {
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
                }
            };

            // Extract filename for display
            const fileName = filePath.split(/[\\/]/).pop() || filePath;

            // Config file: always auto-reload without prompting or notification
            if (filePath.endsWith('config.json')) {
                console.log('[useExternalFileWatcher] Auto-reloading config file');
                await reloadFile();
                return;
            }

            // Load current config to check silentFileUpdates setting
            const config = await window.electronAPI.loadConfig();
            const silentUpdates = config.silentFileUpdates !== false; // default true

            if (silentUpdates) {
                // Silent mode: reload automatically in place with no prompt
                console.log('[useExternalFileWatcher] Silent mode - auto-reloading file:', fileName);
                await reloadFile();
            } else {
                // Prompt mode: always ask the user before refreshing
                console.log('[useExternalFileWatcher] Prompt mode - asking user about file:', fileName);
                const result = await window.electronAPI.showExternalChangeDialog(fileName);
                if (result === 'reload') {
                    await reloadFile();
                }
                // If 'keep', do nothing - the user's current content is preserved.
                // Saving will overwrite the external changes on disk.
            }
        };

        const cleanupChange = window.electronAPI.onExternalFileChange(async (filePath: string) => {
            console.log('[useExternalFileWatcher] External file change detected:', filePath);

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
            console.log('[useExternalFileWatcher] External file rename/delete detected:', filePath);

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
