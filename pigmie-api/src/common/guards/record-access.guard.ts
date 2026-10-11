import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import {
  RECORD_ACCESS_KEY,
  RecordAccessRule,
} from '../decorators/record-access.decorator';
import { RequestUser, StaffUser } from '../types/request-user.type';
import type { Prisma } from '@prisma/client';

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return {};
  return value as Record<string, unknown>;
}

/** Runs after authentication and role checks, before record handlers. */
@Injectable()
export class RecordAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RecordAccessRule>(
      RECORD_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!rule)
      throw new ForbiddenException('Record access configuration is missing');
    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      params?: Record<string, unknown>;
      body?: unknown;
    }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication is required');
    if (user.type !== 'staff')
      throw new ForbiddenException('Staff access is required');
    if (user.role === 'branch_manager' && !user.branchId)
      throw new ForbiddenException('A branch assignment is required');
    let ids: unknown[];
    if (rule.source === 'collections') {
      const entries = object(request.body).collections;
      if (
        !Array.isArray(entries) ||
        entries.length === 0 ||
        entries.length > 100
      )
        throw new BadRequestException('Provide between 1 and 100 collections');
      ids = entries.map((entry) => object(entry).loanId);
    } else if (rule.source === 'body') {
      ids = [object(request.body)[rule.field ?? 'id']];
    } else {
      const id = request.params?.[rule.field ?? 'id'];
      // Class-level rules also guard list routes; these have no record ID.
      if (id === undefined) return true;
      ids = [id];
    }
    if (!ids.every((id): id is string => typeof id === 'string' && isUUID(id)))
      throw new BadRequestException('Invalid record identifier');
    await this.tenantPrisma.run(user.organizationId, async (tx) => {
      for (const id of new Set(ids)) {
        let record: { id: string } | null;
        if (rule.resource === 'customer') {
          record = await tx.customer.findFirst({
            where: {
              id,
              organizationId: user.organizationId,
              ...(user.role === 'agent' ? { assignedAgentId: user.id } : {}),
              ...(user.role === 'branch_manager'
                ? { branchId: user.branchId }
                : {}),
            },
            select: { id: true },
          });
        } else if (rule.resource === 'loan') {
          record = await tx.loan.findFirst({
            where: {
              id,
              organizationId: user.organizationId,
              ...(user.role === 'agent' ? { assignedAgentId: user.id } : {}),
              ...(user.role === 'branch_manager'
                ? { customer: { branchId: user.branchId } }
                : {}),
            },
            select: { id: true },
          });
        } else {
          record = await tx.collection.findFirst({
            where: {
              id,
              organizationId: user.organizationId,
              ...(user.role === 'agent' ? { collectedById: user.id } : {}),
              ...(user.role === 'branch_manager'
                ? { customer: { branchId: user.branchId } }
                : {}),
            },
            select: { id: true },
          });
        }
        if (!record && rule.resource === 'loan' && rule.allowRecordedRetry) {
          const body = object(request.body);
          const entries =
            rule.source === 'collections' && Array.isArray(body.collections)
              ? body.collections
              : [body];
          const candidates = entries.filter(
            (entry) => object(entry).loanId === id,
          );
          let allRecorded = candidates.length > 0;
          for (const entry of candidates) {
            if (
              !(await this.matchesRecordedPayment(tx, user, object(entry), id))
            ) {
              allRecorded = false;
              break;
            }
          }
          if (allRecorded) record = { id };
        }
        if (!record) throw new NotFoundException('Record not found');
      }
    });
    return true;
  }

  private async matchesRecordedPayment(
    tx: Prisma.TransactionClient,
    user: StaffUser,
    entry: Record<string, unknown>,
    loanId: string,
  ): Promise<boolean> {
    const { clientGeneratedId, amount, collectionDate, collectionMethod } =
      entry;
    if (
      typeof clientGeneratedId !== 'string' ||
      !isUUID(clientGeneratedId) ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      typeof collectionDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate) ||
      (collectionMethod !== 'cash' &&
        collectionMethod !== 'cheque' &&
        collectionMethod !== 'other')
    )
      return false;
    const date = new Date(`${collectionDate}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().split('T')[0] !== collectionDate
    )
      return false;
    // Allow acknowledgement recovery for an original operation, never a new payment
    // on an inaccessible loan. Ownership and financial fields must all match.
    const existing = await tx.collection.findFirst({
      where: {
        clientGeneratedId,
        organizationId: user.organizationId,
        collectedById: user.id,
        loanId,
        amount,
        collectionDate: date,
        collectionMethod,
      },
      select: { id: true },
    });
    return existing !== null;
  }
}
