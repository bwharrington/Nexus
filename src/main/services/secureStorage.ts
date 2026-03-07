import { safeStorage, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { log, logError } from '../logger';

/**
 * Secure storage for API keys using Electron's safeStorage API
 * Keys are encrypted using the OS's native credential storage:
 * - Windows: DPAPI (Data Protection API)
 * - macOS: Keychain
 * - Linux: libsecret
 *
 * Encrypted keys are persisted to disk in userData directory
 * 
 * Development Override:
 * In development, .env file values take precedence over secure storage.
 * This allows developers to use .env files without storing keys in the system.
 */

const API_KEY_PREFIX = 'markdownplus_api_key_';

export type ApiProvider = 'xai' | 'claude' | 'openai' | 'gemini' | 'serper';

// Map provider names to environment variable names
const ENV_VAR_MAP: Record<ApiProvider, string> = {
    xai: 'XAI_API_KEY',
    claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
    serper: 'SERPER_API_KEY',
};

// In-memory cache of encrypted keys
const keyCache = new Map<string, Buffer>();

// Path to store encrypted keys
const getKeysFilePath = () => {
    return path.join(app.getPath('userData'), 'encrypted-keys.json');
};

/**
 * Load encrypted keys from disk on startup
 */
export function loadEncryptedKeys(): void {
    try {
        const keysPath = getKeysFilePath();

        if (!fs.existsSync(keysPath)) {
            log('Secure Storage: No encrypted keys file found (first run)');
            return;
        }

        const data = fs.readFileSync(keysPath, 'utf-8');
        const stored = JSON.parse(data);

        // Convert base64 strings back to Buffers
        for (const [key, base64Value] of Object.entries(stored)) {
            if (typeof base64Value === 'string') {
                keyCache.set(key, Buffer.from(base64Value, 'base64'));
            }
        }

        log('Secure Storage: Loaded encrypted keys from disk', { count: keyCache.size });
    } catch (error) {
        logError('Failed to load encrypted keys from disk', error as Error);
    }
}

/**
 * Save encrypted keys to disk
 */
function saveEncryptedKeys(): void {
    try {
        const keysPath = getKeysFilePath();

        // Convert Buffers to base64 strings for JSON storage
        const toStore: Record<string, string> = {};
        for (const [key, buffer] of keyCache.entries()) {
            toStore[key] = buffer.toString('base64');
        }

        fs.writeFileSync(keysPath, JSON.stringify(toStore, null, 2), 'utf-8');
        log('Secure Storage: Saved encrypted keys to disk');
    } catch (error) {
        logError('Failed to save encrypted keys to disk', error as Error);
        throw error;
    }
}

/**
 * Store an API key securely
 */
export function setApiKey(provider: ApiProvider, key: string): void {
    try {
        if (!key || key.trim() === '') {
            throw new Error('API key cannot be empty');
        }

        // Encrypt the key using OS credential storage
        const encrypted = safeStorage.encryptString(key);

        // Store in memory cache
        const cacheKey = `${API_KEY_PREFIX}${provider}`;
        keyCache.set(cacheKey, encrypted);

        // Persist to disk
        saveEncryptedKeys();

        log('Secure Storage: API key stored', { provider });
    } catch (error) {
        logError(`Failed to store API key for ${provider}`, error as Error);
        throw error;
    }
}

/**
 * Get an API key (decrypted)
 * In development, checks .env first as an override
 */
export function getApiKey(provider: ApiProvider): string | null {
    try {
        // Development override: Check .env file first
        const envVarName = ENV_VAR_MAP[provider];
        const envValue = process.env[envVarName];
        if (envValue && envValue.trim() !== '') {
            log('Secure Storage: Using API key from .env (development override)', { provider });
            return envValue.trim();
        }

        // Fall back to secure storage
        const cacheKey = `${API_KEY_PREFIX}${provider}`;
        const encrypted = keyCache.get(cacheKey);

        if (!encrypted) {
            return null;
        }

        // Decrypt the key
        const decrypted = safeStorage.decryptString(encrypted);
        return decrypted;
    } catch (error) {
        logError(`Failed to retrieve API key for ${provider}`, error as Error);
        return null;
    }
}

/**
 * Check if an API key exists
 * In development, checks .env first as an override
 */
export function hasApiKey(provider: ApiProvider): boolean {
    // Development override: Check .env file first
    const envVarName = ENV_VAR_MAP[provider];
    const envValue = process.env[envVarName];
    if (envValue && envValue.trim() !== '') {
        return true;
    }

    // Fall back to secure storage
    const cacheKey = `${API_KEY_PREFIX}${provider}`;
    return keyCache.has(cacheKey);
}

/**
 * Delete an API key
 */
export function deleteApiKey(provider: ApiProvider): void {
    try {
        const cacheKey = `${API_KEY_PREFIX}${provider}`;
        keyCache.delete(cacheKey);

        // Persist to disk
        saveEncryptedKeys();

        log('Secure Storage: API key deleted', { provider });
    } catch (error) {
        logError(`Failed to delete API key for ${provider}`, error as Error);
        throw error;
    }
}

/**
 * Clear all stored API keys
 */
export function clearAllApiKeys(): void {
    keyCache.clear();

    // Persist to disk
    saveEncryptedKeys();

    log('Secure Storage: All API keys cleared');
}

/**
 * Check if safeStorage is available
 */
export function isSecureStorageAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
}
