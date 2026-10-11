import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApprovalActionType, ApprovalRequest, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import {
  AuthenticatedUser,
  StaffUser,
} from '../../common/types/request-user.type';
import { CustomersService } from '../customers/customers.service';
import { CollectionsService } from '../collections/collections.service';
import { LoansService } from '../loans/loans.service';
import { CloseLoanDto } from '../loans/dto/close-loan.dto';
import { RestructureLoanDto } from '../loans/dto/restructure-loan.dto';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ReviewApprovalDto } from './dto/review-approval.dto';
import { QueryApprovalsDto } from './dto/query-approvals.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly customersService: CustomersService,
    private readonly collectionsService: CollectionsService,
    private readonly loansService: LoansService,
  ) {}

  private async actor(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    lock = false,
  ): Promise<StaffUser> {
    if (lock)
      await tx.$queryRaw`SELECT id FROM staff WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
    const staff = await tx.staff.findFirst({
      where: { id, organizationId, isActive: true },
      select: { id: true, role: true, branchId: true },
    });
    if (!staff || (staff.role === 'branch_manager' && !staff.branchId))
      throw new ForbiddenException('Approval scope is unavailable');
    return { ...staff, organizationId, type: 'staff' };
  }

  private async readScope(
    tx: Prisma.TransactionClient,
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<Prisma.ApprovalRequestWhereInput> {
    if (user.type !== 'staff' || user.organizationId !== organizationId)
      throw new ForbiddenException();
    const actor = await this.actor(tx, organizationId, user.id);
    if (!['org_admin', 'branch_manager', 'agent'].includes(actor.role))
      throw new ForbiddenException();
    return this.scope(actor);
  }

  private scope(actor: StaffUser): Prisma.ApprovalRequestWhereInput {
    return {
      organizationId: actor.organizationId,
      ...(actor.role === 'agent' ? { submittedById: actor.id } : {}),
      ...(actor.role === 'branch_manager'
        ? {
            submittedBy: {
              organizationId: actor.organizationId,
              branchId: actor.branchId,
            },
          }
        : {}),
    };
  }

  private entityType(action: ApprovalActionType): string {
    if (action === 'delete_customer') return 'customer';
    if (action === 'reverse_collection') return 'collection';
    if (['close_loan', 'write_off_loan', 'restructure_loan'].includes(action))
      return 'loan';
    throw new BadRequestException('Unsupported approval action');
  }

  private async target(
    tx: Prisma.TransactionClient,
    actor: StaffUser,
    action: ApprovalActionType,
    entityId: string,
  ) {
    const organizationId = actor.organizationId;
    const type = this.entityType(action);
    if (type === 'customer') {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${entityId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findFirst({
        where: {
          id: entityId,
          organizationId,
          ...(actor.role === 'agent' ? { assignedAgentId: actor.id } : {}),
          ...(actor.role === 'branch_manager'
            ? { branchId: actor.branchId }
            : {}),
        },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Approval target not found');
      return;
    }
    let loanId = entityId;
    if (type === 'collection') {
      const collection = await tx.collection.findFirst({
        where: {
          id: entityId,
          organizationId,
          ...(actor.role === 'agent' ? { collectedById: actor.id } : {}),
        },
        select: { loanId: true },
      });
      if (!collection) throw new NotFoundException('Approval target not found');
      loanId = collection.loanId;
    }
    await tx.$queryRaw`SELECT c.id FROM customers c JOIN loans l ON l.customer_id = c.id WHERE l.id = ${loanId}::uuid AND l.organization_id = ${organizationId}::uuid AND c.organization_id = ${organizationId}::uuid FOR SHARE OF c`;
    await tx.$queryRaw`SELECT id FROM loans WHERE id = ${loanId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    const loan = await tx.loan.findFirst({
      where: {
        id: loanId,
        organizationId,
        customer: {
          organizationId,
          ...(actor.role === 'branch_manager'
            ? { branchId: actor.branchId }
            : {}),
        },
        ...(actor.role === 'agent' && type === 'loan'
          ? { assignedAgentId: actor.id }
          : {}),
      },
      select: { id: true },
    });
    if (!loan) throw new NotFoundException('Approval target not found');
  }

  private async payload<T extends object>(
    ctor: new () => T,
    value: unknown,
  ): Promise<T> {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Invalid approval payload');
    const dto = plainToInstance(ctor, value);
    if (
      (await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
        .length
    )
      throw new BadRequestException('Invalid approval payload');
    return dto;
  }

  async create(
    organizationId: string,
    staffId: string,
    dto: CreateApprovalDto,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const actor = await this.actor(tx, organizationId, staffId, true);
      const entityType = this.entityType(dto.actionType);
      if (
        typeof dto.entityType !== 'string' ||
        dto.entityType.toLowerCase() !== entityType
      )
        throw new BadRequestException(
          'Approval action and entity type do not match',
        );
      if (dto.actionType === 'close_loan')
        await this.payload(CloseLoanDto, dto.payload);
      if (dto.actionType === 'restructure_loan')
        await this.payload(RestructureLoanDto, dto.payload);
      await this.target(tx, actor, dto.actionType, dto.entityId);
      return tx.approvalRequest.create({
        data: {
          organizationId,
          submittedById: staffId,
          actionType: dto.actionType,
          payload: dto.payload,
          reason: dto.reason,
          entityType,
          entityId: dto.entityId,
          status: 'pending',
        },
      });
    });
  }

  async findAll(
    organizationId: string,
    query: QueryApprovalsDto,
    user: AuthenticatedUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const where: Prisma.ApprovalRequestWhereInput = {
        ...(await this.readScope(tx, organizationId, user)),
        ...(query.status ? { status: query.status } : {}),
      };
      const [data, total] = await Promise.all([
        tx.approvalRequest.findMany({
          where,
          skip: (page - 1) * limit,
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

  async findOne(organizationId: string, id: string, user: AuthenticatedUser) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const request = await tx.approvalRequest.findFirst({
        where: { ...(await this.readScope(tx, organizationId, user)), id },
        include: {
          submittedBy: { select: { id: true, fullName: true } },
          reviewedBy: { select: { id: true, fullName: true } },
        },
      });
      if (!request) throw new NotFoundException('Approval request not found');
      return request;
    });
  }

  async getPendingCount(organizationId: string, user: AuthenticatedUser) {
    return this.tenantPrisma.run(organizationId, async (tx) => ({
      count: await tx.approvalRequest.count({
        where: {
          ...(await this.readScope(tx, organizationId, user)),
          status: 'pending',
        },
      }),
    }));
  }

  private async review(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    staffId: string,
  ) {
    const actor = await this.actor(tx, organizationId, staffId, true);
    if (!['org_admin', 'branch_manager'].includes(actor.role))
      throw new ForbiddenException();
    // ApprovalRequest uses camel-case column mappings, unlike the financial tables.
    await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${id}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    const request = await tx.approvalRequest.findFirst({
      where: { ...this.scope(actor), id },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'pending')
      throw new BadRequestException('Approval request is not pending');
    return { actor, request };
  }

  async approve(organizationId: string, id: string, staffId: string) {
    return this.tenantPrisma.runAtomic(organizationId, async (tx) => {
      const { actor, request } = await this.review(
        tx,
        organizationId,
        id,
        staffId,
      );
      await this.target(tx, actor, request.actionType, request.entityId);
      await this.executeAction(organizationId, request, staffId);
      return tx.approvalRequest.update({
        where: { id, organizationId, status: 'pending' },
        data: {
          status: 'approved',
          reviewedById: staffId,
          reviewedAt: new Date(),
        },
      });
    });
  }

  async reject(
    organizationId: string,
    id: string,
    staffId: string,
    dto: ReviewApprovalDto,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.review(tx, organizationId, id, staffId);
      return tx.approvalRequest.update({
        where: { id, organizationId, status: 'pending' },
        data: {
          status: 'rejected',
          reviewedById: staffId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote,
        },
      });
    });
  }

  private async executeAction(
    organizationId: string,
    request: ApprovalRequest,
    reviewerId: string,
  ) {
    switch (request.actionType) {
      case 'delete_customer':
        return this.customersService.remove(
          organizationId,
          request.entityId,
          reviewerId,
        );
      case 'reverse_collection':
        return this.collectionsService.reverseCollection(
          organizationId,
          request.entityId,
          reviewerId,
          request.reason || 'Reversed via approval workflow',
        );
      case 'close_loan':
        return this.loansService.close(
          organizationId,
          request.entityId,
          reviewerId,
          await this.payload(CloseLoanDto, request.payload),
        );
      case 'write_off_loan':
        return this.loansService.writeOff(
          organizationId,
          request.entityId,
          request.reason || 'Written off via approval workflow',
          reviewerId,
        );
      case 'restructure_loan':
        return this.loansService.restructure(
          organizationId,
          request.entityId,
          reviewerId,
          await this.payload(RestructureLoanDto, request.payload),
        );
      default:
        throw new BadRequestException('Unsupported approval action');
    }
  }
}
