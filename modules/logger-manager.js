const { app } = require('electron');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

let logger = null;
let currentLogDirectory = null;
let currentPathLog = null;
let config = {
    enabled: true,
    level: 'info',
    maxFileSizeMB: 5,
    maxFiles: 5
};

function formatMessage(message, ...args) {
    let index = 0;
    return message.replace(/{}/g, () => {
        const value = args[index++];
        return typeof value === 'object' ? JSON.stringify(value) : value;
    }) + (index < args.length ? ' ' + args.slice(index).map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ') : '');
}

function log(level, message, ...args) {
    if (!config.enabled) return;
    const formatted = formatMessage(message, ...args);
    if (logger) {
        logger.log(level, formatted);
    } else {
        const fn = console[level] || console.log;
        fn(`[${level.toUpperCase()}] ${formatted}`);
    }
}

function disposeLogger() {
    if (!logger) return;
    try {
        for (const t of logger.transports.slice()) {
            logger.remove(t);
            if (t.close) t.close();
        }
        logger.close();
    } catch (_) { /* ignore */ }
    logger = null;
}

function buildLogger() {
    const consoleFormat = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize({ level: true }),
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level}] ${message}`)
    );
    const fileFormat = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] [${level.toUpperCase()}] ${message}`)
    );

    if (!fs.existsSync(currentLogDirectory)) {
        fs.mkdirSync(currentLogDirectory, { recursive: true });
    }

    logger = winston.createLogger({
        level: config.level,
        transports: [
            new winston.transports.Console({ format: consoleFormat }),
            new winston.transports.File({
                filename: path.join(currentLogDirectory, 'app.log'),
                format: fileFormat,
                maxsize: Math.max(1, config.maxFileSizeMB) * 1024 * 1024,
                maxFiles: Math.max(1, config.maxFiles),
                tailable: true
            })
        ]
    });
}

function createLogger(pathLog) {
    currentPathLog = pathLog;
    currentLogDirectory = path.join(app.getPath('userData'), pathLog, 'logs');
    if (config.enabled) {
        buildLogger();
    }
}

function reconfigure(newConfig) {
    const merged = {
        enabled: newConfig && typeof newConfig.enabled === 'boolean' ? newConfig.enabled : config.enabled,
        level: newConfig && newConfig.level ? newConfig.level : config.level,
        maxFileSizeMB: newConfig && newConfig.maxFileSizeMB ? newConfig.maxFileSizeMB : config.maxFileSizeMB,
        maxFiles: newConfig && newConfig.maxFiles ? newConfig.maxFiles : config.maxFiles
    };
    config = merged;

    disposeLogger();
    if (config.enabled && currentLogDirectory) {
        buildLogger();
    }
}

function setLogging(enabled) {
    reconfigure({ enabled });
}

function isEnabled() {
    return config.enabled;
}

function setLogLevel(level) {
    reconfigure({ level });
}

function getLogDirectory() {
    return currentLogDirectory;
}

function clearLogs() {
    if (!currentLogDirectory || !fs.existsSync(currentLogDirectory)) return 0;
    disposeLogger();
    let removed = 0;
    for (const entry of fs.readdirSync(currentLogDirectory)) {
        const full = path.join(currentLogDirectory, entry);
        try {
            const stat = fs.statSync(full);
            if (stat.isFile()) {
                fs.unlinkSync(full);
                removed++;
            }
        } catch (_) { /* ignore */ }
    }
    if (config.enabled) {
        buildLogger();
    }
    return removed;
}

const info = (message, ...args) => log('info', message, ...args);
const warn = (message, ...args) => log('warn', message, ...args);
const error = (message, ...args) => log('error', message, ...args);
const debug = (message, ...args) => log('debug', message, ...args);

module.exports = {
    info, warn, error, debug,
    setLogging, isEnabled, setLogLevel,
    createLogger, reconfigure,
    getLogDirectory, clearLogs
};
