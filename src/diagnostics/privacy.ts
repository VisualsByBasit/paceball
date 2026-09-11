import type { ErrorEvent, StackFrame } from '@sentry/react-native';

const ERROR_TYPES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError']);

function cleanFrame(frame: StackFrame): StackFrame {
  // Preserve bundle addresses needed for source maps, never local media paths,
  // route parameters, source context or captured variables.
  const filename = frame.filename?.split(/[\\/]/).pop()?.split(/[?#]/)[0];
  return {
    filename: filename && /^(?:index\.android\.bundle|main\.jsbundle|entry-[a-f0-9]+\.hbc|[a-zA-Z0-9_.-]+\.[jt]sx?)$/.test(filename)
      ? filename : 'app',
    lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
  };
}

/** Build a new allow-listed event instead of trying to blacklist every secret. */
export function scrubDiagnosticEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: 'javascript',
    level: event.level,
    release: event.release,
    environment: event.environment,
    exception: { values: event.exception?.values?.map((exception) => ({
      type: ERROR_TYPES.has(exception.type ?? '') ? exception.type : 'Error',
      value: 'Paceball application error (details withheld for privacy)',
      mechanism: exception.mechanism ? {
        type: 'generic', handled: exception.mechanism.handled,
      } : undefined,
      stacktrace: exception.stacktrace ? {
        frames: exception.stacktrace.frames?.map(cleanFrame),
      } : undefined,
    })) },
    // Debug IDs identify compiled artifacts, not users, and permit symbolication.
    debug_meta: event.debug_meta ? { images: event.debug_meta.images?.filter((image) =>
      image.type === 'sourcemap' && typeof image.debug_id === 'string' &&
      /^[a-f0-9-]{36}$/i.test(image.debug_id)).map((image) => ({
        type: 'sourcemap', debug_id: image.debug_id,
        code_file: cleanFrame({ filename: image.code_file }).filename ?? 'app',
      })) } : undefined,
  };
}
