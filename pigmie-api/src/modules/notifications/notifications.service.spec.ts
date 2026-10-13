import {
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as webpush from 'web-push';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  generateVAPIDKeys: () => ({
    publicKey: 'synthetic-public',
    privateKey: 'synthetic-private',
  }),
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));

function harness() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'subscription',
          endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-test-only',
          p256dh: Buffer.concat([
            Buffer.from([4]),
            Buffer.alloc(64, 1),
          ]).toString('base64url'),
          auth: Buffer.alloc(16, 1).toString('base64url'),
        },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    notification: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn<
          Promise<{ id: string }>,
          [{ data: Prisma.NotificationUncheckedCreateInput }]
        >()
        .mockResolvedValue({ id: 'notification' }),
    },
    staff: {
      findUnique: jest.fn().mockResolvedValue({ authUserId: 'auth-staff' }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({ authUserId: 'auth-customer' }),
      findMany: jest
        .fn<Promise<{ phone: string }[]>, [unknown]>()
        .mockResolvedValue([]),
    },
  };
  const prisma = {
    pushSubscription: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const tenant = {
    run: jest.fn(
      (
        _org: string,
        action: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => action(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    tenant as unknown as TenantPrismaService,
  );
  return { service, tx, prisma, run: tenant.run };
}

describe('Notification ownership and push privacy', () => {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-test-only',
    keys: {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString(
        'base64url',
      ),
      auth: Buffer.alloc(16, 1).toString('base64url'),
    },
  };
  it('restricts SMS recipients to the current manager branch', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue({
      authUserId: 'auth-staff',
      role: 'branch_manager',
      branchId: 'current-branch',
    });
    tx.customer.findMany.mockResolvedValue([{ phone: '0000000000' }]);
    await service.authorizeSmsRecipients('org', 'owner', ['0000000000']);
    expect(tx.customer.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        isActive: true,
        phone: { in: ['0000000000'] },
        branchId: 'current-branch',
      },
      select: { phone: true },
    });
    await expect(
      service.authorizeSmsRecipients('org', 'owner', [
        '0000000000',
        '0000000001',
      ]),
    ).rejects.toThrow(ForbiddenException);
  });
  it('does not authorize SMS for disabled or downgraded senders', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue(null);
    await expect(
      service.authorizeSmsRecipients('org', 'owner', ['0000000000']),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.customer.findMany).not.toHaveBeenCalled();
  });
  it('does not delete a reassigned subscription on a stale provider response', async () => {
    const { service, prisma, tx, run } = harness();
    jest
      .mocked(webpush.sendNotification)
      .mockRejectedValueOnce({ statusCode: 410 });
    await service.notify(
      'org',
      'staff',
      'owner',
      'test',
      'Synthetic',
      'Synthetic',
    );
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
    expect(run.mock.calls).toHaveLength(3);
    expect(
      run.mock.calls.every(([organizationId]) => organizationId === 'org'),
    ).toBe(true);
    expect(tx.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { authUserId: 'auth-staff' },
    });
    expect(tx.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'subscription',
        authUserId: 'auth-staff',
        endpoint: subscription.endpoint,
        ...subscription.keys,
      },
    });
  });
  it.each([
    'https://localhost/private',
    'http://fcm.googleapis.com/test',
    'https://fcm.googleapis.com.attacker.test/test',
    'https://fcm.googleapis.com:8443/test',
    'https://fcm.googleapis.com/test#fragment',
  ])(
    'rejects unsafe push destinations before database access: %s',
    async (endpoint) => {
      const { service, tx } = harness();
      await expect(
        service.subscribe('org', 'staff', 'owner', {
          ...subscription,
          endpoint,
        }),
      ).rejects.toThrow();
      expect(tx.staff.findUnique).not.toHaveBeenCalled();
    },
  );
  it('rejects inactive or foreign recipients before saving a subscription', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue(null);
    await expect(
      service.subscribe('org', 'staff', 'owner', subscription),
    ).rejects.toThrow(UnauthorizedException);
    expect(tx.staff.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'owner', organizationId: 'org', isActive: true },
      }),
    );
    expect(tx.pushSubscription.create).not.toHaveBeenCalled();
  });
  it('rejects endpoint takeover when subscription keys do not match', async () => {
    const { service, tx } = harness();
    tx.pushSubscription.findUnique.mockResolvedValue({
      id: 'old-subscription',
      authUserId: 'other',
      p256dh: subscription.keys.p256dh,
      auth: 'other',
    });
    await expect(
      service.subscribe('org', 'staff', 'owner', subscription),
    ).rejects.toThrow(ConflictException);
    expect(tx.pushSubscription.update).not.toHaveBeenCalled();
  });
  it('allows shared-browser rebinding only with the existing subscription keys', async () => {
    const { service, tx } = harness();
    tx.pushSubscription.findUnique.mockResolvedValue({
      id: 'old-subscription',
      authUserId: 'other',
      ...subscription.keys,
    });
    await service.subscribe('org', 'staff', 'owner', subscription);
    expect(tx.pushSubscription.update).toHaveBeenCalledWith({
      where: { id: 'old-subscription' },
      data: { authUserId: 'auth-staff' },
    });
  });
  it('unsubscribes only the current owner and matching subscription', async () => {
    const { service, tx } = harness();
    await service.unsubscribe('org', 'staff', 'owner', subscription);
    expect(tx.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: {
        authUserId: 'auth-staff',
        endpoint: subscription.endpoint,
        ...subscription.keys,
      },
    });
  });
  it('skips an inactive notification recipient without blocking financial workflows', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue(null);
    await expect(
      service.notify('org', 'staff', 'owner', 'test', 'Synthetic', 'Synthetic'),
    ).resolves.toBeNull();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
  it('keeps staging notifications in-app without sending push', async () => {
    const original = process.env.APP_ENV;
    process.env.APP_ENV = 'staging';
    jest.mocked(webpush.sendNotification).mockClear();
    try {
      const { service, tx } = harness();
      await service.notify(
        'org',
        'staff',
        'owner',
        'test',
        'Synthetic',
        'Synthetic',
      );
      expect(tx.notification.create).toHaveBeenCalledTimes(1);
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    } finally {
      if (original === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = original;
    }
  });
  it.each(['staff', 'customer'] as const)(
    'limits a read mutation to its %s recipient in a single update',
    async (type) => {
      const { service, tx } = harness();
      await expect(
        service.markAsRead('org', 'notification', type, 'owner'),
      ).resolves.toEqual({ id: 'notification', isRead: true });
      expect(tx.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notification',
          organizationId: 'org',
          recipientType: type,
          ...(type === 'staff'
            ? { recipientStaffId: 'owner' }
            : { recipientCustomerId: 'owner' }),
        },
        data: { isRead: true },
      });
    },
  );
  it('rejects an inaccessible notification without a second write', async () => {
    const { service, tx } = harness();
    tx.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.markAsRead('org', 'foreign', 'staff', 'owner'),
    ).rejects.toThrow(NotFoundException);
    expect(tx.notification.updateMany).toHaveBeenCalledTimes(1);
  });
  it.each(['staff', 'customer'] as const)(
    'saves in-app detail but excludes it from %s push delivery',
    async (type) => {
      const { service, tx } = harness();
      await service.notify(
        'org',
        type,
        'owner',
        'balance',
        'Private borrower',
        'Balance 1234',
      );
      const saved: unknown = tx.notification.create.mock.calls[0]?.[0];
      expect(JSON.stringify(saved)).toContain('Private borrower');
      expect(JSON.stringify(saved)).toContain('Balance 1234');
      const calls = jest.mocked(webpush.sendNotification).mock.calls;
      const payload = calls[calls.length - 1]?.[1];
      const parsed: unknown = JSON.parse(String(payload));
      expect(parsed).toEqual({
        title: 'PigmieFinance',
        body: 'You have a new notification. Sign in to view it.',
        url: type === 'customer' ? '/portal/dashboard' : '/app/dashboard',
      });
    },
  );
});
