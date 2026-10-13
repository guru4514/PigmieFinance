import { EmailService } from '../email/email.service';
import { SmsService } from './sms.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('staging delivery isolation', () => {
  const originalEnv = process.env.APP_ENV;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('never initializes email delivery even when provider settings exist', async () => {
    process.env.APP_ENV = 'staging';
    const spy = jest.mocked(nodemailer.createTransport);
    spy.mockClear();
    await new EmailService().sendWelcome('synthetic@example.test', 'Synthetic');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not send an SMS to an external provider', async () => {
    process.env.APP_ENV = 'staging';
    const spy = jest.spyOn(globalThis, 'fetch');
    expect(await new SmsService().sendSMS('synthetic', 'synthetic')).toBe(
      false,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports suppressed staging bulk delivery as failed', async () => {
    process.env.APP_ENV = 'staging';
    const spy = jest.spyOn(globalThis, 'fetch');
    expect(
      await new SmsService().sendBulkSMS([
        { phone: '0000000001', message: 'Synthetic' },
        { phone: '0000000002', message: 'Synthetic' },
      ]),
    ).toEqual({ success: false, count: 2, sent: 0, failed: 2 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports partial bulk failure rather than unconditional success', async () => {
    const service = new SmsService();
    jest
      .spyOn(service, 'sendSMS')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(
      await service.sendBulkSMS([
        { phone: '0000000001', message: 'Synthetic' },
        { phone: '0000000002', message: 'Synthetic' },
      ]),
    ).toEqual({ success: false, count: 2, sent: 1, failed: 1 });
  });
});
