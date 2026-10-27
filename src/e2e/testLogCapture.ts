/**
 * Test-log capture for E2E tests (moved out of main.ts, #175). Tagged console messages are kept (the last 1000) and
 * read through `__EDITOR_TEST__.getTestLogs`; `console.log` only reaches the real console in debug mode or when the
 * message is tagged, errors and warnings always do.
 */

const MAX_TEST_LOGS = 1000;

/**
 * Safely stringify a value, handling circular structures and other edge cases.
 * Falls back to String() if JSON.stringify fails.
 */
export function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    // Handle circular structures, DOM elements, vis-network objects, etc.
    try {
      return String(value);
    } catch {
      return '[Unable to stringify]';
    }
  }
}

/**
 * Check if a message string contains any test log tags.
 */
export function hasTestLogTag(message: string): boolean {
  return message.includes('[DELETE]') ||
         message.includes('[GET EDGE DATA]') ||
         message.includes('[DELETE KEY]') ||
         message.includes('[DEBUG]') ||
         message.includes('[TEST]');
}

/**
 * Build message string from args only when needed (lazy evaluation).
 * This avoids overhead when debug mode is off and no tags are present.
 * First checks all string arguments for tags before doing expensive stringification.
 */
export function buildMessageIfNeeded(args: unknown[]): string | null {
  // Quick check: scan all string args first (cheap operation)
  for (const arg of args) {
    if (typeof arg === 'string' && hasTestLogTag(arg)) {
      // Found a tag in a string arg, build full message
      return args.map(safeStringify).join(' ');
    }
  }

  // No tags found in string args, but might be in stringified non-string args
  // Only do expensive stringification if we have non-string args
  if (args.some(arg => typeof arg !== 'string')) {
    const message = args.map(safeStringify).join(' ');
    if (hasTestLogTag(message)) {
      return message;
    }
  }

  return null;
}

export interface TestLogCapture {
  addTestLog(message: string): void;
  /** The kept logs, oldest first. The same array every time. */
  getTestLogs(): string[];
}

/**
 * Override `log`, `error` and `warn` on `target` to capture tagged messages (always), and to log to the real console
 * only as described above.
 */
export function installTestLogCapture(
  isDebugMode: () => boolean,
  target: Pick<Console, 'log' | 'error' | 'warn'> = console
): TestLogCapture {
  const testLogs: string[] = [];

  function addTestLog(message: string): void {
    testLogs.push(`[${new Date().toISOString()}] ${message}`);
    if (testLogs.length > MAX_TEST_LOGS) {
      testLogs.shift(); // Remove oldest log
    }
    // Don't log to console here - let the console override handle it based on debug mode
  }

  const originalConsoleLog = target.log;
  const originalConsoleError = target.error;
  const originalConsoleWarn = target.warn;

  target.log = (...args: unknown[]) => {
    // Only build message string if we might need it (lazy evaluation)
    const message = buildMessageIfNeeded(args);
    // Always capture test logs for E2E testing
    if (message) {
      addTestLog(message);
    }
    // Only log to console if debug mode is enabled (for production performance)
    if (isDebugMode() || message) {
      originalConsoleLog.apply(target, args);
    }
  };

  target.error = (...args: unknown[]) => {
    const message = buildMessageIfNeeded(args);
    if (message) {
      addTestLog(message);
    }
    // Always log errors to console (even without debug mode)
    originalConsoleError.apply(target, args);
  };

  target.warn = (...args: unknown[]) => {
    const message = buildMessageIfNeeded(args);
    if (message) {
      addTestLog(message);
    }
    // Always log warnings to console (warnings are important user feedback)
    // This includes the display.json 404 warning which should always be visible
    originalConsoleWarn.apply(target, args);
  };

  return { addTestLog, getTestLogs: () => testLogs };
}
