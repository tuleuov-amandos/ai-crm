/**
 * Stable, machine-readable error codes returned to the client in the response
 * body as `code`. The frontend maps each code to a localized string (see
 * `fe/messages/*.json` -> `errors.*`). The human-readable `message` that ships
 * next to the code is an English fallback only (logs, Swagger, non-FE clients,
 * and the FE fallback when a key is missing) — never localize it here.
 */

export enum AuthErrorCode {
  COMPANY_NAME_TAKEN = 'AUTH_COMPANY_NAME_TAKEN',
  EMAIL_TAKEN = 'AUTH_EMAIL_TAKEN',
  INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  WRONG_PASSWORD = 'AUTH_WRONG_PASSWORD',
  REFRESH_TOKEN_MISSING = 'AUTH_REFRESH_TOKEN_MISSING',
  REFRESH_TOKEN_INVALID = 'AUTH_REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_NOT_IN_STORE = 'AUTH_REFRESH_TOKEN_NOT_IN_STORE',
  GOOGLE_EMAIL_NOT_VERIFIED = 'AUTH_GOOGLE_EMAIL_NOT_VERIFIED',
  EMAIL_REGISTERED_WITH_PASSWORD = 'AUTH_EMAIL_REGISTERED_WITH_PASSWORD',
  /** Password change attempted on an account that signs in via Google only. */
  OAUTH_NO_PASSWORD = 'AUTH_OAUTH_NO_PASSWORD',
  /** New password is identical to the current one. */
  PASSWORD_SAME = 'AUTH_PASSWORD_SAME',
}

export enum DealErrorCode {
  FORBIDDEN_CREATE = 'DEAL_FORBIDDEN_CREATE',
  FORBIDDEN_OWNER_SELF_ONLY = 'DEAL_FORBIDDEN_OWNER_SELF_ONLY',
  FORBIDDEN_LIST = 'DEAL_FORBIDDEN_LIST',
  NOT_FOUND = 'DEAL_NOT_FOUND',
  INVALID_STAGE = 'DEAL_INVALID_STAGE',
  MEETING_NOTE_REQUIRED = 'DEAL_MEETING_NOTE_REQUIRED',
}

export enum ContactErrorCode {
  FORBIDDEN_LIST = 'CONTACT_FORBIDDEN_LIST',
  NOT_FOUND = 'CONTACT_NOT_FOUND',
}

export enum DashboardErrorCode {
  FORBIDDEN = 'DASHBOARD_FORBIDDEN',
}

export enum UserErrorCode {
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  CANNOT_CHANGE_OWN_ROLE = 'USER_CANNOT_CHANGE_OWN_ROLE',
  CANNOT_REMOVE_SELF = 'USER_CANNOT_REMOVE_SELF',
  MEMBER_HAS_OWNED_DEALS = 'MEMBER_HAS_OWNED_DEALS',
  /** Uploaded avatar file is not an accepted image type. */
  AVATAR_INVALID_TYPE = 'USER_AVATAR_INVALID_TYPE',
  /** Uploaded avatar file exceeds the size limit. */
  AVATAR_TOO_LARGE = 'USER_AVATAR_TOO_LARGE',
  /** No file was sent with the avatar upload request. */
  AVATAR_FILE_MISSING = 'USER_AVATAR_FILE_MISSING',
  /** Avatar storage (Cloudinary) is not configured / reachable. */
  AVATAR_STORAGE_UNAVAILABLE = 'USER_AVATAR_STORAGE_UNAVAILABLE',
}

export enum RoleErrorCode {
  NOT_FOUND = 'ROLE_NOT_FOUND',
  INVALID = 'ROLE_INVALID',
  NAME_RESERVED = 'ROLE_NAME_RESERVED',
  NAME_TAKEN = 'ROLE_NAME_TAKEN',
  SYSTEM_IMMUTABLE_EDIT = 'ROLE_SYSTEM_IMMUTABLE_EDIT',
  SYSTEM_IMMUTABLE_DELETE = 'ROLE_SYSTEM_IMMUTABLE_DELETE',
  IN_USE_BY_MEMBERS = 'ROLE_IN_USE_BY_MEMBERS',
  IN_USE_BY_INVITATIONS = 'ROLE_IN_USE_BY_INVITATIONS',
}

export enum ActivityErrorCode {
  FORBIDDEN_LIST = 'ACTIVITY_FORBIDDEN_LIST',
  NOT_FOUND = 'ACTIVITY_NOT_FOUND',
  FORBIDDEN_UPDATE = 'ACTIVITY_FORBIDDEN_UPDATE',
  FORBIDDEN_DELETE = 'ACTIVITY_FORBIDDEN_DELETE',
}

export enum ReportErrorCode {
  FORBIDDEN_OVERVIEW = 'REPORT_FORBIDDEN_OVERVIEW',
  FORBIDDEN_TEAM = 'REPORT_FORBIDDEN_TEAM',
  FORBIDDEN_PIPELINE = 'REPORT_FORBIDDEN_PIPELINE',
  FORBIDDEN_ACTIVITY = 'REPORT_FORBIDDEN_ACTIVITY',
  FORBIDDEN_KPI_UPDATE = 'REPORT_FORBIDDEN_KPI_UPDATE',
}

export enum InvitationErrorCode {
  EMAIL_IN_OTHER_WORKSPACE = 'INVITATION_EMAIL_IN_OTHER_WORKSPACE',
  ROLE_ABOVE_SELF = 'INVITATION_ROLE_ABOVE_SELF',
  NOT_FOUND = 'INVITATION_NOT_FOUND',
  TOKEN_INVALID = 'INVITATION_TOKEN_INVALID',
  ALREADY_RESOLVED = 'INVITATION_ALREADY_RESOLVED',
  EXPIRED = 'INVITATION_EXPIRED',
  NOT_PENDING = 'INVITATION_NOT_PENDING',
  EMAIL_TAKEN = 'INVITATION_EMAIL_TAKEN',
  DUPLICATE = 'INVITATION_DUPLICATE',
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
}

export enum TenantErrorCode {
  /** Workspace is awaiting manual approval — most endpoints return 403 until then. */
  TENANT_PENDING = 'TENANT_PENDING',
  /** Workspace access has been revoked by an operator. */
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  /** The current user's workspace row could not be found. */
  NOT_FOUND = 'TENANT_NOT_FOUND',
  /** Non-ADMIN tried to change workspace settings. */
  FORBIDDEN = 'TENANT_FORBIDDEN',
  /** Uploaded logo file is not an accepted image type. */
  LOGO_INVALID_TYPE = 'TENANT_LOGO_INVALID_TYPE',
  /** Uploaded logo file exceeds the size limit. */
  LOGO_TOO_LARGE = 'TENANT_LOGO_TOO_LARGE',
  /** No file was sent with the logo upload request. */
  LOGO_FILE_MISSING = 'TENANT_LOGO_FILE_MISSING',
}

export enum AiErrorCode {
  RATE_LIMIT_EXCEEDED = 'AI_RATE_LIMIT_EXCEEDED',
  OPENAI_TIMEOUT = 'OPENAI_TIMEOUT',
  OPENAI_AUTH_ERROR = 'OPENAI_AUTH_ERROR',
  OPENAI_RATE_LIMIT = 'OPENAI_RATE_LIMIT',
  OPENAI_ERROR = 'OPENAI_ERROR',
  PERSIST_FAILED = 'AI_PERSIST_FAILED',
}

/**
 * Request-body / query validation failures (HTTP 422). Emitted by
 * `MyZodValidationPipe` from the first Zod issue via
 * `zodIssueToValidationCode` (see `./validation.ts`). The frontend localizes
 * each code through the `errors` namespace; `path` in the response body names
 * the offending field for debugging (field names are not localized yet).
 */
export enum ValidationErrorCode {
  FAILED = 'VALIDATION_FAILED',
  REQUIRED = 'VALIDATION_REQUIRED',
  TOO_SHORT = 'VALIDATION_TOO_SHORT',
  TOO_LONG = 'VALIDATION_TOO_LONG',
  INVALID_EMAIL = 'VALIDATION_INVALID_EMAIL',
  INVALID_TYPE = 'VALIDATION_INVALID_TYPE',
  INVALID_ENUM = 'VALIDATION_INVALID_ENUM',
  NUMBER_MIN = 'VALIDATION_NUMBER_MIN',
  NUMBER_MAX = 'VALIDATION_NUMBER_MAX',
  UNRECOGNIZED_KEYS = 'VALIDATION_UNRECOGNIZED_KEYS',
  PASSWORD_MISMATCH = 'VALIDATION_PASSWORD_MISMATCH',
  AT_LEAST_ONE_FIELD = 'VALIDATION_AT_LEAST_ONE_FIELD',
}

export type AppErrorCode =
  | AuthErrorCode
  | DealErrorCode
  | ContactErrorCode
  | DashboardErrorCode
  | UserErrorCode
  | RoleErrorCode
  | ActivityErrorCode
  | ReportErrorCode
  | InvitationErrorCode
  | TenantErrorCode
  | AiErrorCode
  | ValidationErrorCode
