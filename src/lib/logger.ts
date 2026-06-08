/**
 * Structured logger for CMS
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.debug('questions', 'Loading question', { id: '123' });
 *   logger.info('questions', 'Question saved', { id: '123' });
 *   logger.warn('questions', 'Missing field', { field: 'prompt' });
 *   logger.error('questions', 'Failed to save', { error: err.message });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogModule =
  | 'questions'
  | 'categories'
  | 'featured'
  | 'auth'
  | 'api'
  | 'form'
  | 'admin-users'
  | 'general';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: LogModule;
  message: string;
  data?: Record<string, unknown>;
}

// Enable/disable logging per module (can be controlled via localStorage in browser)
const getEnabledModules = (): Set<LogModule> => {
  if (typeof window === 'undefined') return new Set(['questions', 'categories', 'featured', 'auth', 'api', 'form', 'general']);
  
  try {
    const stored = localStorage.getItem('cms_log_modules');
    if (stored) {
      return new Set(JSON.parse(stored) as LogModule[]);
    }
  } catch {
    // ignore
  }
  // Default: all modules enabled in development
  return new Set(['questions', 'categories', 'featured', 'auth', 'api', 'form', 'general']);
};

const isEnabled = (module: LogModule): boolean => {
  if (process.env.NODE_ENV === 'production') return false;
  return getEnabledModules().has(module);
};

const formatLog = (entry: LogEntry): string => {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}`;
};

const createLogFn = (level: LogLevel) => {
  return (module: LogModule, message: string, data?: Record<string, unknown>) => {
    if (level !== 'error' && !isEnabled(module)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString().split('T')[1].slice(0, 12),
      level,
      module,
      message,
      data,
    };

    const formatted = formatLog(entry);
    
    switch (level) {
      case 'debug':
        if (data) {
          console.log(`%c${formatted}`, 'color: #888', data);
        } else {
          console.log(`%c${formatted}`, 'color: #888');
        }
        break;
      case 'info':
        if (data) {
          console.info(`%c${formatted}`, 'color: #2196F3', data);
        } else {
          console.info(`%c${formatted}`, 'color: #2196F3');
        }
        break;
      case 'warn':
        if (data) {
          console.warn(formatted, data);
        } else {
          console.warn(formatted);
        }
        break;
      case 'error':
        if (data) {
          console.error(formatted, data);
        } else {
          console.error(formatted);
        }
        break;
    }
  };
};

export const logger = {
  debug: createLogFn('debug'),
  info: createLogFn('info'),
  warn: createLogFn('warn'),
  error: createLogFn('error'),
  
  /**
   * Enable logging for specific modules
   * Usage: logger.enableModules(['questions', 'api'])
   */
  enableModules: (modules: LogModule[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cms_log_modules', JSON.stringify(modules));
    }
  },
  
  /**
   * Enable all modules
   */
  enableAll: () => {
    const all: LogModule[] = ['questions', 'categories', 'featured', 'auth', 'api', 'form', 'general'];
    if (typeof window !== 'undefined') {
      localStorage.setItem('cms_log_modules', JSON.stringify(all));
    }
  },
  
  /**
   * Disable all logging
   */
  disableAll: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cms_log_modules', JSON.stringify([]));
    }
  },
};

// Make logger available in browser console for debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).cmsLogger = logger;
}
