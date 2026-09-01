import { HttpStatus } from '@nestjs/common'
import { z } from 'zod'
import { ValidationErrorCode } from '../errors'
import { validationExceptionFromZodError } from '../errors/validation'

/**
 * Locks the Zod-issue -> VALIDATION_* code mapping that `MyZodValidationPipe`
 * relies on. Each case parses a schema that fails, then feeds the resulting
 * ZodError through the same helper the pipe uses.
 */
function codeFor(run: () => unknown) {
  try {
    run()
    throw new Error('expected the schema to reject')
  } catch (err) {
    if (!(err instanceof z.ZodError)) throw err
    const exception = validationExceptionFromZodError(err)
    const body = exception.getResponse() as {
      statusCode: number
      error: string
      code: string
      message: string
      path?: string
    }
    return { status: exception.getStatus(), body }
  }
}

describe('validationExceptionFromZodError', () => {
  it('maps a missing required field to REQUIRED (422)', () => {
    const { status, body } = codeFor(() => z.object({ name: z.string() }).parse({}))
    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
    expect(body.code).toBe(ValidationErrorCode.REQUIRED)
    expect(body.error).toBe('Unprocessable Entity')
    expect(body.message).toBeTruthy()
    expect(body.path).toBe('name')
  })

  it('maps an invalid email to INVALID_EMAIL', () => {
    const { body } = codeFor(() => z.object({ email: z.string().email() }).parse({ email: 'nope' }))
    expect(body.code).toBe(ValidationErrorCode.INVALID_EMAIL)
    expect(body.path).toBe('email')
  })

  it('maps a string shorter than its min (>1) to TOO_SHORT', () => {
    const { body } = codeFor(() => z.object({ name: z.string().min(2) }).parse({ name: 'a' }))
    expect(body.code).toBe(ValidationErrorCode.TOO_SHORT)
  })

  it('maps an out-of-enum value to INVALID_ENUM', () => {
    const { body } = codeFor(() => z.object({ stage: z.enum(['A', 'B']) }).parse({ stage: 'C' }))
    expect(body.code).toBe(ValidationErrorCode.INVALID_ENUM)
  })

  it('maps a password-mismatch refinement to PASSWORD_MISMATCH', () => {
    const schema = z
      .object({ password: z.string(), confirmPassword: z.string() })
      .superRefine(({ password, confirmPassword }, ctx) => {
        if (password !== confirmPassword) {
          ctx.addIssue({
            code: 'custom',
            path: ['confirmPassword'],
            message: ValidationErrorCode.PASSWORD_MISMATCH,
          })
        }
      })
    const { body } = codeFor(() => schema.parse({ password: 'a', confirmPassword: 'b' }))
    expect(body.code).toBe(ValidationErrorCode.PASSWORD_MISMATCH)
    expect(body.path).toBe('confirmPassword')
  })

  it('maps an "at least one field" refinement to AT_LEAST_ONE_FIELD', () => {
    const schema = z
      .object({ a: z.string().optional(), b: z.string().optional() })
      .refine((data) => Object.keys(data).length > 0, {
        message: ValidationErrorCode.AT_LEAST_ONE_FIELD,
      })
    const { body } = codeFor(() => schema.parse({}))
    expect(body.code).toBe(ValidationErrorCode.AT_LEAST_ONE_FIELD)
  })
})
