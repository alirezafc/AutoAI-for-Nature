export class ProviderError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class RAGError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RAGError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class VoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceError";
  }
}

export class MCPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MCPError";
  }
}

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export const PROVIDER_ERROR_CODES = {
  NOT_CONFIGURED: "not_configured",
  TIMEOUT: "timeout",
  RATE_LIMITED: "rate_limited",
  INVALID_RESPONSE: "invalid_response",
  API_FAILURE: "api_failure",
  AUTH_FAILURE: "auth_failure",
  ALL_FAILED: "all_providers_failed",
} as const;

export type ProviderErrorCode =
  (typeof PROVIDER_ERROR_CODES)[keyof typeof PROVIDER_ERROR_CODES];

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof ProviderError) {
    const retryable: string[] = [
      PROVIDER_ERROR_CODES.TIMEOUT,
      PROVIDER_ERROR_CODES.RATE_LIMITED,
      PROVIDER_ERROR_CODES.API_FAILURE,
    ];
    return retryable.includes(err.code);
  }
  return true;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
