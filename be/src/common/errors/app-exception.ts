import { HttpException, HttpStatus } from '@nestjs/common'
import { AppErrorCode } from './error-codes'

const STATUS_TEXT: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
}

/**
 * Business error carrying a stable machine-readable `code` alongside an English
 * fallback `message`. The client localizes off `code`; `message` is only a
 * fallback for logs / non-FE consumers.
 *
 * Response body: `{ statusCode, error, code, message, ...extra }`.
 */
export class AppException extends HttpException {
  constructor(status: HttpStatus, code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    super(
      {
        statusCode: status,
        error: STATUS_TEXT[status] ?? 'Error',
        code,
        message,
        ...extra,
      },
      status,
    )
  }

  static badRequest(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, extra)
  }

  static unauthorized(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.UNAUTHORIZED, code, message, extra)
  }

  static forbidden(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.FORBIDDEN, code, message, extra)
  }

  static notFound(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.NOT_FOUND, code, message, extra)
  }

  static conflict(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.CONFLICT, code, message, extra)
  }

  static unprocessable(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, extra)
  }

  static tooManyRequests(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.TOO_MANY_REQUESTS, code, message, extra)
  }

  static serviceUnavailable(code: AppErrorCode, message: string, extra?: Record<string, unknown>) {
    return new AppException(HttpStatus.SERVICE_UNAVAILABLE, code, message, extra)
  }
}
