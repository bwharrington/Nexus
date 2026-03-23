import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { LogLevel, shouldLog } from '../shared/logLevel';

let logsDir: string;
let currentLogDate: string = '';
let currentLogFilePath: string = '';
let logBuffer: string[] = [];
let isWriting = false;
let currentLevel: LogLevel = LogLevel.Info;

// Get the YYYY-MM-DD string for today in local time
function getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Compute path for a given date string
function buildLogFilePath(dateStr: string): string {
    return path.join(logsDir, `nexus-${dateStr}.log`);
}

// Ensure the log directory exists and return today's log file path.
// If the date has rolled over since the last write, updates currentLogDate/currentLogFilePath.
function getOrRotateLogFilePath(): string {
    const today = getTodayDateString();
    if (today !== currentLogDate) {
        currentLogDate = today;
        currentLogFilePath = buildLogFilePath(today);
    }
    return currentLogFilePath;
}

// Internal: format and buffer a log entry
function writeLogEntry(levelTag: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logLine = data
        ? `[${timestamp}] [${levelTag}] ${message}\n${JSON.stringify(data, null, 2)}\n\n`
        : `[${timestamp}] [${levelTag}] ${message}\n\n`;

    // Console output
    if (levelTag === 'ERROR') {
        console.error(`[${levelTag}] ${message}`, data || '');
    } else if (levelTag === 'WARN') {
        console.warn(`[${levelTag}] ${message}`, data || '');
    } else {
        console.log(`[${levelTag}] ${message}`, data || '');
    }

    // Buffer for file write
    logBuffer.push(logLine);

    // Flush after a short delay
    setTimeout(flushLogs, 100);
}

// Set the active log level
export function setLogLevel(level: LogLevel) {
    currentLevel = level;
}

// Get the active log level
export function getLogLevel(): LogLevel {
    return currentLevel;
}

// Initialize logger — creates the logs directory and appends a session-start header
export function initLogger(initialLevel?: LogLevel) {
    if (initialLevel) {
        currentLevel = initialLevel;
    }

    const appPath = app.isPackaged
        ? path.dirname(app.getPath('exe'))
        : app.getAppPath();

    logsDir = path.join(appPath, 'logs');

    // Ensure the logs directory exists synchronously so the first log write succeeds
    try {
        fsSync.mkdirSync(logsDir, { recursive: true });
    } catch {
        // Ignore — directory may already exist
    }

    // Prime the current date / file path
    getOrRotateLogFilePath();

    // Append a session-start header (do NOT overwrite previous entries for the day)
    const header = `\n=== Nexus Session Start ===\n`;
    try {
        fsSync.appendFileSync(currentLogFilePath, header, 'utf-8');
    } catch {
        // Ignore write errors during init
    }

    logInfo('Logger initialized', { appPath, logsDir, logFilePath: currentLogFilePath, isPackaged: app.isPackaged, logLevel: currentLevel });
}

// Write buffered logs to file (handles date rollover between flushes)
async function flushLogs() {
    if (isWriting || logBuffer.length === 0) return;

    isWriting = true;
    const toWrite = [...logBuffer];
    logBuffer = [];

    // Re-evaluate the path in case the date has changed since the entries were queued
    const targetPath = getOrRotateLogFilePath();

    try {
        await fs.appendFile(targetPath, toWrite.join(''), 'utf-8');
    } catch (error) {
        console.error('Failed to write logs:', error);
    } finally {
        isWriting = false;
    }
}

// Level-specific logging methods

export function logDebug(message: string, data?: any) {
    if (!shouldLog(LogLevel.Debug, currentLevel)) return;
    writeLogEntry('DEBUG', message, data);
}

export function logInfo(message: string, data?: any) {
    if (!shouldLog(LogLevel.Info, currentLevel)) return;
    writeLogEntry('INFO', message, data);
}

export function logWarn(message: string, data?: any) {
    if (!shouldLog(LogLevel.Warn, currentLevel)) return;
    writeLogEntry('WARN', message, data);
}

export function logError(message: string, error: any) {
    if (!shouldLog(LogLevel.Error, currentLevel)) return;
    const errorInfo = {
        message: error?.message || String(error),
        stack: error?.stack,
        ...(error && typeof error === 'object' ? error : {}),
    };
    writeLogEntry('ERROR', message, errorInfo);
}

// Backward-compatible alias — maps to logInfo
export function log(message: string, data?: any) {
    logInfo(message, data);
}

// Force flush logs (call before app quit)
export async function flushLogsSync() {
    await flushLogs();
}

// Get current log file path (today's log file)
export function getLogFilePath(): string {
    return currentLogFilePath;
}

// Get the logs directory path (used for watcher exclusion)
export function getLogsDir(): string {
    return logsDir;
}
