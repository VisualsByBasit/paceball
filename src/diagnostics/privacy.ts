// Structural input only: the privacy policy has no SDK/runtime dependency.
// The integration adapter supplies Sentry events after Basit enables the SDK.
interface StackFrame {
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}
interface DiagnosticEvent {
  event_id?: string;
  timestamp?: number;
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
  release?: string;
  environment?: string;
  exception?: { values?: {
    type?: string;
    value?: string;
    mechanism?: { handled?: boolean };
    stacktrace?: { frames?: StackFrame[] };
  }[] };
  debug_meta?: { images?: { type: string; debug_id?: string; code_file?: string }[] };
}

// Only exact, reviewed static messages. Never infer safety from a filename,
// in_app flag, error prefix or constructor; our own errors can contain paths.
const SAFE_MESSAGES = new Map([
  'Paceball diagnostic test',
  'Cannot save an invalid Paceball session.',
  'Cannot export an invalid saved delivery.',
  'Export requires frames in permanent app storage.',
  'The saved release frame is missing.',
  'The saved release frame could not be decoded.',
  'Could not allocate the export image.',
  'The export renderer produced an empty image.',
  'The export font cannot render the required text.',
  'Cannot export an image with invalid dimensions.',
  'Saved frame orientation does not match this delivery.',
  'Invalid export frame.',
  'Player name cannot be empty or longer than 80 characters.',
  'Player was not found.',
  'Select an existing player.',
].map((message) => [message, message]));

const ERROR_TYPES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError']);

function cleanFrame(frame: StackFrame): StackFrame {
  // Preserve bundle addresses needed for source maps, never local media paths,
  // route parameters, source context or captured variables.
  const filename = frame.filename?.split(/[\\/]/).pop()?.split(/[?#]/)[0];
  return {
    filename: filename && /^(?:index\.android\.bundle|index\.bundle|main\.jsbundle|entry-[a-f0-9]+\.hbc)$/.test(filename)
      ? filename : 'app',
    lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
  };
}

/** Build a new allow-listed event instead of trying to blacklist every secret. */
export function scrubDiagnosticEvent(event: DiagnosticEvent) {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: 'javascript' as const,
    level: event.level,
    release: event.release,
    environment: event.environment,
    exception: { values: event.exception?.values?.map((exception) => ({
      type: ERROR_TYPES.has(exception.type ?? '') ? exception.type : 'Error',
      value: exception.type === 'Error'
        ? SAFE_MESSAGES.get(exception.value ?? '') ?? 'Paceball application error (details withheld for privacy)'
        : 'Paceball application error (details withheld for privacy)',
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
        type: 'sourcemap' as const, debug_id: image.debug_id!,
        code_file: cleanFrame({ filename: image.code_file }).filename ?? 'app',
      })) } : undefined,
  };
}
