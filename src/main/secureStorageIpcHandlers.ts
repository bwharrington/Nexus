import { ipcMain } from 'electron';
import { log } from './logger';
import {
    setApiKey,
    getApiKey,
    hasApiKey,
    deleteApiKey,
    isSecureStorageAvailable,
    ApiProvider,
} from './services/secureStorage';
import { validateApiKey as validateXAiKey } from './services/xaiApi';
import { validateApiKey as validateClaudeKey } from './services/claudeApi';
import { validateApiKey as validateOpenAIKey } from './services/openaiApi';
import { validateApiKey as validateGeminiKey } from './services/geminiApi';
import { validateSerperKey } from './services/webSearchService';

export interface SetApiKeyData {
    provider: ApiProvider;
    key: string;
}

export interface ApiKeyStatusResponse {
    xai: boolean;
    claude: boolean;
    openai: boolean;
    gemini: boolean;
    serper: boolean;
}

export function registerSecureStorageIpcHandlers() {
    log('Registering Secure Storage IPC handlers');

    // Set API Key (with validation)
    ipcMain.handle('secure-storage:set-api-key', async (_event, data: SetApiKeyData): Promise<{ success: boolean; error?: string }> => {
        log('Secure Storage IPC: set-api-key', { provider: data.provider });
        try {
            // Validate API key before storing
            let validationResult: { valid: boolean; error?: string };

            switch (data.provider) {
                case 'xai':
                    validationResult = await validateXAiKey(data.key);
                    break;
                case 'claude':
                    validationResult = await validateClaudeKey(data.key);
                    break;
                case 'openai':
                    validationResult = await validateOpenAIKey(data.key);
                    break;
                case 'gemini':
                    validationResult = await validateGeminiKey(data.key);
                    break;
                case 'serper':
                    validationResult = await validateSerperKey(data.key);
                    break;
                default:
                    return {
                        success: false,
                        error: `Unknown provider: ${data.provider}`,
                    };
            }

            // If validation failed, return error without storing
            if (!validationResult.valid) {
                log('Secure Storage IPC: API key validation failed', { provider: data.provider, error: validationResult.error });
                return {
                    success: false,
                    error: validationResult.error || 'API key validation failed',
                };
            }

            // Validation succeeded, store the key
            setApiKey(data.provider, data.key);
            log('Secure Storage IPC: API key validated and stored successfully', { provider: data.provider });
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to store API key',
            };
        }
    });

    // Check if API key exists
    ipcMain.handle('secure-storage:has-api-key', async (_event, provider: ApiProvider): Promise<boolean> => {
        log('Secure Storage IPC: has-api-key', { provider });
        return hasApiKey(provider);
    });

    // Delete API key
    ipcMain.handle('secure-storage:delete-api-key', async (_event, provider: ApiProvider): Promise<{ success: boolean; error?: string }> => {
        log('Secure Storage IPC: delete-api-key', { provider });
        try {
            deleteApiKey(provider);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete API key',
            };
        }
    });

    // Get API key status for all providers
    ipcMain.handle('secure-storage:get-key-status', async (): Promise<ApiKeyStatusResponse> => {
        log('Secure Storage IPC: get-key-status');
        return {
            xai: hasApiKey('xai'),
            claude: hasApiKey('claude'),
            openai: hasApiKey('openai'),
            gemini: hasApiKey('gemini'),
            serper: hasApiKey('serper'),
        };
    });

    // Check if secure storage is available
    ipcMain.handle('secure-storage:is-available', async (): Promise<boolean> => {
        log('Secure Storage IPC: is-available');
        return isSecureStorageAvailable();
    });

    // Get API key (only for internal use by API services)
    // This handler should NOT be exposed to renderer - it's for main process only
    // We'll use a different approach - export a function that API services can call
}

/**
 * Get API key for use by API services in main process
 * This is NOT exposed via IPC to keep keys secure
 */
export function getApiKeyForService(provider: ApiProvider): string | null {
    return getApiKey(provider);
}
