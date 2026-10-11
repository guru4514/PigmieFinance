import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from './http-exception.filter';

function handle(error: unknown) {
  const json = jest.fn<void, [unknown]>();
  const status = jest
    .fn<{ json: typeof json }, [number]>()
    .mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(error, host);
  return {
    status: status.mock.calls[0][0],
    body: json.mock.calls[0][0],
  };
}
function databaseError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('DUMMY_INTERNAL_DIAGNOSTIC', {
    code,
    clientVersion: 'test',
    meta: { target: ['DUMMY_PRIVATE_METADATA'] },
  });
}
describe('HTTP exception confidentiality', () => {
  let errorLog: jest.SpyInstance;
  let warningLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warningLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());
  it.each([
    new Error('DUMMY_INTERNAL_DIAGNOSTIC'),
    new ServiceUnavailableException({
      message: 'DUMMY_INTERNAL_DIAGNOSTIC',
      credential: 'DUMMY_PRIVATE_METADATA',
    }),
    databaseError('P2010'),
  ])('hides internal exception messages and details', (error) => {
    const result = handle(error);
    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(result)).not.toContain('DUMMY_');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('DUMMY_');
  });
  it('preserves validation arrays and removes arbitrary details', () => {
    const message = ['amount must be positive', 'loanId must be a UUID'];
    expect(
      handle(
        new BadRequestException({ message, extra: 'DUMMY_PRIVATE_METADATA' }),
      ),
    ).toEqual({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message } },
    });
    expect(JSON.stringify(warningLog.mock.calls)).not.toContain('amount');
  });
  it('preserves authentication denial', () => {
    expect(handle(new UnauthorizedException('Session expired'))).toEqual({
      status: 401,
      body: { error: { code: 'UNAUTHORIZED', message: 'Session expired' } },
    });
  });
  it.each([
    ['P2002', 409],
    ['P2025', 404],
    ['P2003', 400],
    ['P2000', 400],
    ['P2034', 409],
  ])('maps %s without disclosing driver metadata', (code, status) => {
    const result = handle(databaseError(code));
    expect(result.status).toBe(status);
    expect(JSON.stringify(result)).not.toContain('DUMMY_');
    expect(JSON.stringify(warningLog.mock.calls)).not.toContain('DUMMY_');
  });
  it('omits malformed exception response values', () => {
    expect(
      JSON.stringify(
        handle(
          new HttpException(
            { message: { private: 'DUMMY_PRIVATE_METADATA' } },
            400,
          ),
        ),
      ),
    ).not.toContain('DUMMY_');
  });
});
