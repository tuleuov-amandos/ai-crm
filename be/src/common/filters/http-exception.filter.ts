import { Logger, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'
import { ZodError } from 'zod'
import * as Sentry from '@sentry/node'

@Catch()
export class HttpExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError()
      if (zodError instanceof ZodError) {
        this.logger.error(`ZodSerializationException: ${zodError.message}`)
      }
    }

    // Report anything that is not a normal 4xx business error: unhandled
    // (non-HttpException) errors and genuine 5xx. Sentry is a no-op when
    // SENTRY_DSN is unset. 4xx are expected control flow — never sent.
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    if (status >= 500) {
      Sentry.captureException(exception)
    }

    super.catch(exception, host)
  }
}
