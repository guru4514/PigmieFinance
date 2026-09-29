import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CustomersService } from '../customers/customers.service';
import { CollectionsService } from '../collections/collections.service';
import { LoansService } from '../loans/loans.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ReviewApprovalDto } from './dto/review-approval.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly customersService: CustomersService,
    private readonly collectionsService: CollectionsService,
    private readonly loansService: LoansService,
  ) {}

  async create(organizationId: string, staffId: string, dto: CreateApprovalDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.approvalRequest.create({
        data: {
          organizationId,
          submittedById: staffId,
          actionType: dto.actionType as any,
          payload: dto.payload,
          reason: dto.reason,
          entityType: dto.entityType,
          entityId: dto.entityId,
          status: 'pending',
        },
      });
    });
  }

  async findAll(organizationId: string, query: any, user: any) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where: any = { organizationId };

      if (query.status) {
        where.status = query.status;
      }

      if (user.role === 'agent') {
        where.submittedById = user.id;
      }

      const [data, total] = await Promise.all([
        tx.approvalRequest.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            submittedBy: { select: { id: true, fullName: true } },
            reviewedBy: { select: { id: true, fullName: true } },
          },
        }),
        tx.approvalRequest.count({ where }),
      ]);

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async findOne(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const request = await tx.approvalRequest.findUnique({
        where: { id, organizationId },
        include: {
          submittedBy: { select: { id: true, fullName: true } },
          reviewedBy: { select: { id: true, fullName: true } },
        },
      });

      if (!request) {
        throw new NotFoundException('Approval request not found');
      }

      return request;
    });
  }

  async getPendingCount(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const count = await tx.approvalRequest.count({
        where: {
          organizationId,
          status: 'pending',
        },
      });
      return { count };
    });
  }

  async approve(organizationId: string, id: string, staffId: string) {
    const request = await this.findOne(organizationId, id);
    if (request.status !== 'pending') {
      throw new BadRequestException('Approval request is not pending');
    }

    // Execute the requested action
    await this.executeAction(organizationId, request, staffId);

    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.approvalRequest.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: staffId,
          reviewedAt: new Date(),
        },
      });
    });
  }

  async reject(organizationId: string, id: string, staffId: string, dto: ReviewApprovalDto) {
    const request = await this.findOne(organizationId, id);
    if (request.status !== 'pending') {
      throw new BadRequestException('Approval request is not pending');
    }

    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.approvalRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedById: staffId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote,
        },
      });
    });
  }

  private async executeAction(organizationId: string, request: any, reviewerId: string) {
    switch (request.actionType) {
      case 'delete_customer':
        await this.customersService.remove(organizationId, request.entityId);
        break;
      case 'reverse_collection':
        await this.collectionsService.reverseCollection(
          organizationId,
          request.entityId,
          reviewerId,
          request.reason || 'Reversed via approval workflow'
        );
        break;
      case 'close_loan':
        await this.loansService.close(organizationId, request.entityId, reviewerId, request.payload as any);
        break;
      case 'write_off_loan':
        await this.loansService.writeOff(organizationId, request.entityId, request.reason || 'Written off via approval workflow');
        break;
      case 'restructure_loan':
        await this.loansService.restructure(organizationId, request.entityId, reviewerId, request.payload as any);
        break;
      default:
        throw new BadRequestException(`Unsupported action type: ${request.actionType}`);
    }
  }
}
