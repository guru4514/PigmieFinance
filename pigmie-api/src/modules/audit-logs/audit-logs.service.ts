import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { QueryAuditLogsDto } from './dto/audit-log.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async findAll(
    organizationId: string,
    query: QueryAuditLogsDto,
    staffId: string,
  ) {
    const {
      page = 1,
      limit = 20,
      action,
      entityType,
      dateFrom,
      dateTo,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = { organizationId };

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    return this.tenantPrisma.run(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT id FROM staff WHERE id = ${staffId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const actor = await tx.staff.findFirst({
        where: {
          id: staffId,
          organizationId,
          role: 'org_admin',
          isActive: true,
        },
        select: { id: true },
      });
      if (!actor) throw new ForbiddenException('Audit access is not permitted');
      const [data, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            actorStaff: {
              select: {
                fullName: true,
              },
            },
          },
        }),
        tx.auditLog.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }
}
