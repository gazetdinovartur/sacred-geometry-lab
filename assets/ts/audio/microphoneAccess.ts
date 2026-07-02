export type MicAccessFailure = 'denied' | 'unavailable';

export class MicrophoneAccessError extends Error {
  readonly failure: MicAccessFailure;

  constructor(failure: MicAccessFailure, cause?: unknown) {
    super(failure === 'denied' ? 'Microphone permission denied' : 'Microphone unavailable');
    this.name = 'MicrophoneAccessError';
    this.failure = failure;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function classifyGetUserMediaError(error: unknown): MicAccessFailure {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'denied';
    }

    if (error.name === 'NotFoundError' || error.name === 'NotReadableError' || error.name === 'OverconstrainedError') {
      return 'unavailable';
    }
  }

  return 'unavailable';
}
