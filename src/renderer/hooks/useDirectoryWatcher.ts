import { useEffect, useRef } from 'react';
import type { DirectoryInstance } from './useFileDirectories';

/**
 * Watches open directories for structural changes (files added, removed, renamed)
 * and triggers a tree refresh when changes are detected.
 *
 * Mirrors the pattern used by useExternalFileWatcher:
 * - Subscribes to the IPC event once on mount via a ref (no re-subscription on renders)
 * - Debounces per-directory at 500ms to coalesce rapid fs events (e.g. bulk file operations)
 * - Cleans up all timers on unmount
 */
export function useDirectoryWatcher(directoriesRef: React.RefObject<DirectoryInstance[]>): void {
    const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    useEffect(() => {
        const cleanup = window.electronAPI.onDirectoryChange((dirPath: string) => {
            // Clear any existing debounce timer for this directory
            const existingTimer = debounceTimersRef.current.get(dirPath);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            const timer = setTimeout(async () => {
                debounceTimersRef.current.delete(dirPath);

                // Find the DirectoryInstance whose rootPath matches the changed directory
                const dirs = directoriesRef.current;
                if (!dirs) return;

                const instance = dirs.find(d => d.rootPath === dirPath);
                if (instance) {
                    await instance.refreshTree();
                }
            }, 500);

            debounceTimersRef.current.set(dirPath, timer);
        });

        return () => {
            debounceTimersRef.current.forEach(timer => clearTimeout(timer));
            debounceTimersRef.current.clear();
            cleanup();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Runs once on mount. Directories read via ref.
}
