import { Catch, ExceptionFilter, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as any)?.message ?? message;
      details = typeof body === 'object' ? body : undefined;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle Prisma errors
      if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        const target = (exception.meta?.target as string[])?.join(', ') || 'field';
        message = `Unique constraint failed: A record with this ${target} already exists.`;
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Record to update/delete not found.';
      } else {
        status = 400;
        code = 'BAD_REQUEST';
        message = `Database error: ${exception.message.split('\\n').pop()}`;
      }
    }

    response.status(status).json({
      error: { code, message, details },
    });

    if (status >= 500) this.logger.error(exception);
    if (status === 400 || status === 409) this.logger.warn(`${status} error: ${message}`);
  }
}
