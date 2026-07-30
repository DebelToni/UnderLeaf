export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'request_error',
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function assertHttp(condition: unknown, status: number, message: string, code?: string): asserts condition {
  if (!condition) throw new HttpError(status, message, code);
}
