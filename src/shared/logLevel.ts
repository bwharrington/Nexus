export enum LogLevel {
    Debug = 'debug',
    Info = 'info',
    Warn = 'warn',
    Error = 'error',
    Off = 'off',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    [LogLevel.Debug]: 0,
    [LogLevel.Info]: 1,
    [LogLevel.Warn]: 2,
    [LogLevel.Error]: 3,
    [LogLevel.Off]: 4,
};

/** Returns true if a message at `messageLevel` should be logged given the `configuredLevel`. */
export function shouldLog(messageLevel: LogLevel, configuredLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[configuredLevel];
}
