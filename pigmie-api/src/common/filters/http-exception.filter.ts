import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? 'REQUEST_FAILED';
      // Do not return internal details or arbitrary provider response properties.
      if (status < 500) {
        const body: unknown = exception.getResponse();
        const candidate =
          typeof body === 'string'
            ? body
            : typeof body === 'object' && body !== null && 'message' in body
              ? body.message
              : undefined;
        if (
          typeof candidate === 'string' ||
          (Array.isArray(candidate) &&
            candidate.every((value: unknown) => typeof value === 'string'))
        )
          message = candidate;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        message = 'A record with these details already exists.';
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Record to update/delete not found.';
      } else if (exception.code === 'P2003' || exception.code === 'P2000') {
        status = 400;
        code = 'VALIDATION_ERROR';
        message = 'Invalid record data or related record.';
      } else if (exception.code === 'P2034') {
        status = 409;
        code = 'CONFLICT';
        message = 'A concurrent change prevented this operation. Please retry.';
      }
    }

    response.status(status).json({ error: { code, message } });
    if (status >= 500) this.logger.error(`Request failed (${status})`);
    if (status === 400 || status === 409)
      this.logger.warn(`Request rejected (${status})`);
  }
}
