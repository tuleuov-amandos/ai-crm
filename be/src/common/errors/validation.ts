import { HttpStatus } from '@nestjs/common'
import { ZodError } from 'zod'
import { AppException } from './app-exception'
import { ValidationErrorCode } from './error-codes'

type ZodIssue = ZodError['issues'][number]

/**
 * English fallback text for each validation code. Shipped as `message` in the
 * 422 body for logs / Swagger / non-FE clients. The frontend localizes off
 * `code` (see `fe/messages/*.json` -> `errors.VALIDATION_*`) — never localize
 * these here.
 */
export const VALIDATION_FALLBACK_MESSAGE: Record<ValidationErrorCode, string> = {
  [ValidationErrorCode.FAILED]: 'Validation failed',
  [ValidationErrorCode.REQUIRED]: 'This field is required',
  [ValidationErrorCode.TOO_SHORT]: 'Value is too short',
  [ValidationErrorCode.TOO_LONG]: 'Value is too long',
  [ValidationErrorCode.INVALID_EMAIL]: 'Invalid email address',
  [ValidationErrorCode.INVALID_TYPE]: 'Invalid value type',
  [ValidationErrorCode.INVALID_ENUM]: 'Value is not one of the allowed options',
  [ValidationErrorCode.NUMBER_MIN]: 'Number is below the allowed minimum',
  [ValidationErrorCode.NUMBER_MAX]: 'Number is above the allowed maximum',
  [ValidationErrorCode.UNRECOGNIZED_KEYS]: 'Request contains unexpected fields',
  [ValidationErrorCode.PASSWORD_MISMATCH]: 'Passwords do not match',
  [ValidationErrorCode.AT_LEAST_ONE_FIELD]: 'At least one field must be provided',
}

const KNOWN_CODES = new Set<string>(Object.values(ValidationErrorCode))

/**
 * Maps the first Zod issue of a failed request validation to a stable
 * `VALIDATION_*` code.
 *
 * Note on `invalid_type`: Zod reports it both for a genuinely wrong primitive
 * type and for a missing/`null` required field. We can't reliably tell them
 * apart from a finalized issue, and for these request DTOs a typed frontend
 * almost never sends the wrong primitive — the dominant real cause is an
 * omitted/nulled field. So `invalid_type` maps to `REQUIRED`; the generic
 * "please fill this field in correctly" phrasing covers both cases.
 */
export function zodIssueToValidationCode(issue: ZodIssue): ValidationErrorCode {
  switch (issue.code) {
    case 'invalid_type':
      return ValidationErrorCode.REQUIRED

    case 'too_small': {
      if (issue.origin === 'number' || issue.origin === 'bigint') {
        return ValidationErrorCode.NUMBER_MIN
      }
      // string / array: min length of 0 or 1 is effectively a "required" check.
      return Number(issue.minimum) <= 1 ? ValidationErrorCode.REQUIRED : ValidationErrorCode.TOO_SHORT
    }

    case 'too_big':
      if (issue.origin === 'number' || issue.origin === 'bigint') {
        return ValidationErrorCode.NUMBER_MAX
      }
      return ValidationErrorCode.TOO_LONG

    case 'invalid_format':
      return issue.format === 'email' ? ValidationErrorCode.INVALID_EMAIL : ValidationErrorCode.FAILED

    case 'invalid_value':
      return ValidationErrorCode.INVALID_ENUM

    case 'unrecognized_keys':
      return ValidationErrorCode.UNRECOGNIZED_KEYS

    case 'custom':
      // Refinements set the code string itself as the issue message.
      return KNOWN_CODES.has(issue.message) ? (issue.message as ValidationErrorCode) : ValidationErrorCode.FAILED

    default:
      return ValidationErrorCode.FAILED
  }
}

/**
 * Builds the 422 exception thrown by `MyZodValidationPipe` from a Zod error.
 * Body shape matches every other business error: `{ statusCode, error, code,
 * message, path }`.
 */
export function validationExceptionFromZodError(error: ZodError): AppException {
  const issue = error.issues[0]
  const code = issue ? zodIssueToValidationCode(issue) : ValidationErrorCode.FAILED
  const path = issue?.path?.join('.') || undefined
  return new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    code,
    VALIDATION_FALLBACK_MESSAGE[code],
    path ? { path } : undefined,
  )
}
