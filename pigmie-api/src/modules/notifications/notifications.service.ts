import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { NotificationRecipientType, Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService
  ) {}

  async notify(organizationId: string, recipientType: 'staff' | 'customer', recipientId: string, type: string, title: string, message: string, relatedEntityType?: string, relatedEntityId?: string) {
    await this.prisma.notification.create({
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

