import { Catch, ExceptionFilter, ArgumentsHost, HttpException, Logger } from '@nestjs/common';

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
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const body = exception instanceof HttpException ? exception.getResponse() : null;

    response.status(status).json({
      error: {
        code: STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR',
        message: typeof body === 'string' ? body : (body as any)?.message ?? 'Internal server error',
        details: typeof body === 'object' ? body : undefined,
      },
    });

    if (status === 500) this.logger.error(exception);
    if (status === 400) this.logger.warn(`400 error: ${JSON.stringify(typeof body === 'object' ? body : { message: body })}`);
  }
}
