import { createZodValidationPipe } from 'nestjs-zod'
import { ZodError } from 'zod'
import { validationExceptionFromZodError } from '../errors/validation'

/**
 * Turns a failed Zod request validation into an `AppException` (HTTP 422)
 * carrying a stable `VALIDATION_*` code, so the frontend can localize it the
 * same way it localizes every other backend error. Only the first issue is
 * surfaced. The English `message` is a fallback for logs / non-FE clients.
 */
export const MyZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: ZodError) => validationExceptionFromZodError(error),
})
