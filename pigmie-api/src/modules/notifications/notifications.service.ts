import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { NotificationRecipientType, Prisma } from '@prisma/client';
import * as webpush from 'web-push';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      this.logger.warn('VAPID keys not configured, generating dynamic keys for testing');
      const keys = webpush.generateVAPIDKeys();
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    }
  }

  getVapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY;
  }

  async subscribe(authUserId: string, subscriptionData: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await this.prisma.pushSubscription.create({
      data: {
        authUserId,
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.keys.p256dh,
        auth: subscriptionData.keys.auth,
      },
    });
    return { success: true };
  }

  async notify(organizationId: string, recipientType: 'staff' | 'customer', recipientId: string, type: string, title: string, message: string, relatedEntityType?: string, relatedEntityId?: string) {
    const notification = await this.prisma.notification.create({
      data: { 
        organizationId, 
        recipientType: recipientType as NotificationRecipientType, 
        recipientStaffId: recipientType === 'staff' ? recipientId : null, 
        recipientCustomerId: recipientType === 'customer' ? recipientId : null, 
        type, 
        title, 
        message, 
        relatedEntityType, 
        relatedEntityId 
      },
    });

    let authUserId: string | null = null;
    if (recipientType === 'staff') {
      const staff = await this.prisma.staff.findUnique({ where: { id: recipientId } });
      authUserId = staff?.authUserId || null;
    } else {
      const customer = await this.prisma.customer.findUnique({ where: { id: recipientId } });
      authUserId = customer?.authUserId || null;
    }

    if (authUserId) {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { authUserId },
      });

      const payload = JSON.stringify({ title, body: message, type });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          );
        } catch (error: any) {
          if (error.statusCode === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
          } else {
            this.logger.error(`Failed to send push notification: ${error.message}`);
          }
        }
      }
    }

    return notification;
  }

  async getNotifications(organizationId: string, recipientType: 'staff' | 'customer', recipientId: string, query: { page?: number, limit?: number }) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page || 1;
      const limit = query.limit || 20;

      const where: Prisma.NotificationWhereInput = {
        organizationId,
        recipientType: recipientType as NotificationRecipientType,
        ...(recipientType === 'staff' ? { recipientStaffId: recipientId } : { recipientCustomerId: recipientId }),
      };

      const total = await tx.notification.count({ where });
      const data = await tx.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    });
  }

  async markAsRead(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const notification = await tx.notification.findUnique({ where: { id } });
      if (!notification || notification.organizationId !== organizationId) {
        throw new NotFoundException('Notification not found');
      }
      return tx.notification.update({
        where: { id },
        data: { isRead: true },
      });
    });
  }

  async markAllAsRead(organizationId: string, recipientType: 'staff' | 'customer', recipientId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where: Prisma.NotificationWhereInput = {
        organizationId,
        recipientType: recipientType as NotificationRecipientType,
        ...(recipientType === 'staff' ? { recipientStaffId: recipientId } : { recipientCustomerId: recipientId }),
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
