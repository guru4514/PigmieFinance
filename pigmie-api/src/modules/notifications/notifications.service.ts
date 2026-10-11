import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { Prisma } from '@prisma/client';
import * as webpush from 'web-push';
import { validatePushSubscription } from './push-subscription';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    if (process.env.APP_ENV === 'staging') return;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('VAPID keys must be configured in production');
      }
      this.logger.warn(
        'VAPID keys not configured, generating dynamic keys for testing',
      );
      const keys = webpush.generateVAPIDKeys();
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    }
  }

  getVapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY;
  }
  async authorizeSmsRecipients(
    organizationId: string,
    staffId: string,
    phones: string[],
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT id FROM staff WHERE id = ${staffId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const actor = await tx.staff.findUnique({
        where: { id: staffId, organizationId, isActive: true },
        select: { role: true, branchId: true },
      });
      if (
        !actor ||
        !['org_admin', 'branch_manager'].includes(actor.role) ||
        (actor.role === 'branch_manager' && !actor.branchId)
      )
        throw new ForbiddenException('SMS sending is not permitted');
      const recipients = await tx.customer.findMany({
        where: {
          organizationId,
          isActive: true,
          phone: { in: [...new Set(phones)] },
          ...(actor.role === 'branch_manager'
            ? { branchId: actor.branchId }
            : {}),
        },
        select: { phone: true },
      });
      const permitted = new Set(recipients.map((recipient) => recipient.phone));
      if (phones.some((phone) => !permitted.has(phone)))
        throw new ForbiddenException(
          'SMS recipients are outside your permitted scope',
        );
    });
  }

  private async recipientAuthId(
    tx: Prisma.TransactionClient,
    organizationId: string,
    recipientType: 'staff' | 'customer',
    recipientId: string,
  ) {
    if (recipientType === 'staff') {
      await tx.$executeRaw`SELECT id FROM staff WHERE id = ${recipientId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const staff = await tx.staff.findUnique({
        where: { id: recipientId, organizationId, isActive: true },
        select: { authUserId: true },
      });
      if (staff?.authUserId) return staff.authUserId;
    } else if (recipientType === 'customer') {
      await tx.$executeRaw`SELECT id FROM customers WHERE id = ${recipientId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const customer = await tx.customer.findUnique({
        where: {
          id: recipientId,
          organizationId,
          isActive: true,
          portalAccessEnabled: true,
        },
        select: { authUserId: true },
      });
      if (customer?.authUserId) return customer.authUserId;
    }
    throw new UnauthorizedException('Active notification recipient not found');
  }

  async subscribe(
    organizationId: string,
    recipientType: 'staff' | 'customer',
    recipientId: string,
    input: unknown,
  ) {
    const subscription = validatePushSubscription(input);
    try {
      return await this.tenantPrisma.run(organizationId, async (tx) => {
        const authUserId = await this.recipientAuthId(
          tx,
          organizationId,
          recipientType,
          recipientId,
        );
        await tx.$executeRaw`SELECT id FROM push_subscriptions WHERE endpoint = ${subscription.endpoint} FOR UPDATE`;
        const existing = await tx.pushSubscription.findUnique({
          where: { endpoint: subscription.endpoint },
        });
        if (existing) {
          if (
            existing.p256dh.replace(/=+$/, '') !== subscription.keys.p256dh ||
            existing.auth.replace(/=+$/, '') !== subscription.keys.auth
          )
            throw new ConflictException(
              'Push subscription ownership could not be verified',
            );
          await tx.pushSubscription.update({
            where: { id: existing.id },
            data: { authUserId },
          });
        } else {
          await tx.pushSubscription.create({
            data: {
              authUserId,
              endpoint: subscription.endpoint,
              ...subscription.keys,
            },
          });
        }
        return { success: true };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Push subscription changed; retry registration',
        );
      throw error;
    }
  }

  async unsubscribe(
    organizationId: string,
    recipientType: 'staff' | 'customer',
    recipientId: string,
    input: unknown,
  ) {
    const subscription = validatePushSubscription(input);
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const authUserId = await this.recipientAuthId(
        tx,
        organizationId,
        recipientType,
        recipientId,
      );
      await tx.pushSubscription.deleteMany({
        where: {
          authUserId,
          endpoint: subscription.endpoint,
          ...subscription.keys,
        },
      });
      return { success: true };
    });
  }

  async notify(
    organizationId: string,
    recipientType: 'staff' | 'customer',
    recipientId: string,
    type: string,
    title: string,
    message: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ) {
    const { notification, authUserId } = await this.tenantPrisma.run(
      organizationId,
      async (tx) => {
        let authUserId: string;
        try {
          authUserId = await this.recipientAuthId(
            tx,
            organizationId,
            recipientType,
            recipientId,
          );
        } catch (error) {
          if (error instanceof UnauthorizedException)
            return { notification: null, authUserId: null };
          throw error;
        }
        const notif = await tx.notification.create({
          data: {
            organizationId,
            recipientType,
            recipientStaffId: recipientType === 'staff' ? recipientId : null,
            recipientCustomerId:
              recipientType === 'customer' ? recipientId : null,
            type,
            title,
            message,
            relatedEntityType,
            relatedEntityId,
          },
        });

        return { notification: notif, authUserId };
      },
    );

    if (authUserId && process.env.APP_ENV !== 'staging') {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { authUserId },
      });

      const payload = JSON.stringify({
        title: 'PigmieFinance',
        body: 'You have a new notification. Sign in to view it.',
        url:
          recipientType === 'customer' ? '/portal/dashboard' : '/app/dashboard',
      });

      await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            validatePushSubscription({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            });
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              payload,
            );
          } catch (error: unknown) {
            if (
              typeof error === 'object' &&
              error !== null &&
              'statusCode' in error &&
              (error.statusCode === 410 || error.statusCode === 404)
            ) {
              await this.prisma.pushSubscription.deleteMany({
                where: {
                  id: sub.id,
                  authUserId,
                  endpoint: sub.endpoint,
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              });
            } else {
              this.logger.error('Failed to send push notification');
            }
          }
        }),
      );
    }

    return notification;
  }

  async getNotifications(
    organizationId: string,
    recipientType: 'staff' | 'customer',
    recipientId: string,
    query: { page?: number; limit?: number },
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page || 1;
      const limit = query.limit || 20;

      const where: Prisma.NotificationWhereInput = {
        organizationId,
        recipientType,
        ...(recipientType === 'staff'
          ? { recipientStaffId: recipientId }
          : { recipientCustomerId: recipientId }),
      };

      const total = await tx.notification.count({ where });
      const data = await tx.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async markAsRead(
    organizationId: string,
    id: string,
    recipientType: 'staff' | 'customer',
    recipientId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const result = await tx.notification.updateMany({
        where: {
          id,
          organizationId,
          recipientType,
          ...(recipientType === 'staff'
            ? { recipientStaffId: recipientId }
            : { recipientCustomerId: recipientId }),
        },
        data: { isRead: true },
      });
      if (result.count !== 1) {
        throw new NotFoundException('Notification not found');
      }
      return { id, isRead: true };
    });
  }

  async markAllAsRead(
    organizationId: string,
    recipientType: 'staff' | 'customer',
    recipientId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where: Prisma.NotificationWhereInput = {
        organizationId,
        recipientType,
        ...(recipientType === 'staff'
          ? { recipientStaffId: recipientId }
          : { recipientCustomerId: recipientId }),
        isRead: false,
      };

      const result = await tx.notification.updateMany({
        where,
        data: { isRead: true },
      });
      return { count: result.count };
    });
  }
}
