import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { provisioningLockKey } from '../../common/utils/provisioning-lock.util';

export const publicStaffSelect = {
  id: true,
  organizationId: true,
  authUserId: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  branchId: true,
  employeeCode: true,
  isActive: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StaffSelect;

@Injectable()
export class StaffService {
  private supabaseAdmin: ReturnType<typeof createClient>;

  constructor(private tenantPrisma: TenantPrismaService) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase admin credentials not configured in environment variables',
      );
    }
    this.supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
  }

  async findAll(
    organizationId: string,
    query: QueryStaffDto,
    requestingUserId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const scope = await this.readScope(tx, organizationId, requestingUserId);
      const { page = 1, limit = 20, role, branchId, isActive } = query;
      const skip = (page - 1) * limit;

      const where: Prisma.StaffWhereInput = { ...scope };
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive;

      if (scope.branchId === undefined && branchId) where.branchId = branchId;

      const total = await tx.staff.count({ where });
      const data = await tx.staff.findMany({
        select: publicStaffSelect,
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return {
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  async findOne(organizationId: string, id: string, requestingUserId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const scope = await this.readScope(tx, organizationId, requestingUserId);
      const staff = await tx.staff.findUnique({
        where: { id, ...scope },
        select: publicStaffSelect,
      });
      if (!staff) {
        throw new NotFoundException('Staff not found');
      }

      return staff;
    });
  }

  private async readScope(
    tx: Prisma.TransactionClient,
    organizationId: string,
    requestingUserId: string,
  ): Promise<{ organizationId: string; branchId?: string }> {
    await tx.$executeRaw`SELECT id FROM staff WHERE id = ${requestingUserId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
    const actor = await tx.staff.findFirst({
      where: {
        id: requestingUserId,
        organizationId,
        isActive: true,
        role: { in: ['org_admin', 'branch_manager'] },
      },
      select: { role: true, branchId: true },
    });
    if (!actor)
      throw new ForbiddenException('Staff directory access is not permitted');
    if (actor.role === 'branch_manager') {
      if (!actor.branchId)
        throw new ForbiddenException('Branch manager has no assigned branch');
      return { organizationId, branchId: actor.branchId };
    }
    return { organizationId };
  }

  async create(
    organizationId: string,
    dto: CreateStaffDto,
    requestingUserId: string,
  ) {
    let createdAuthUserId: string | undefined;
    const attemptId = randomUUID();
    try {
      return await this.tenantPrisma.run(
        organizationId,
        async (tx) => {
          await tx.$executeRaw`SELECT id FROM staff WHERE id = ${requestingUserId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
          const actor = await tx.staff.findFirst({
            where: {
              id: requestingUserId,
              organizationId,
              isActive: true,
              role: 'org_admin',
            },
            select: { id: true },
          });
          if (!actor)
            throw new ForbiddenException('Staff creation is not permitted');
          await this.validateBranch(
            tx,
            organizationId,
            dto.branchId,
            dto.role,
            true,
          );
          const lockKey = provisioningLockKey(attemptId);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          const { data, error } =
            await this.supabaseAdmin.auth.admin.createUser({
              email: dto.email,
              email_confirm: false,
              user_metadata: { full_name: dto.fullName },
              app_metadata: {
                pigmie_provisioning_attempt: attemptId,
                pigmie_organization_id: organizationId,
              },
            });
          if (error || !data.user)
            throw new InternalServerErrorException(
              'Provider account creation failed',
            );
          createdAuthUserId = data.user.id;
          if (process.env.APP_ENV !== 'staging') {
            const frontendUrl =
              process.env.CORS_ORIGIN || 'http://localhost:5173';
            const invitation =
              await this.supabaseAdmin.auth.admin.inviteUserByEmail(dto.email, {
                redirectTo: frontendUrl + '/update-password',
              });
            if (
              invitation.error ||
              invitation.data.user?.id !== createdAuthUserId
            )
              throw new InternalServerErrorException('Staff invitation failed');
          }
          return tx.staff.create({
            select: publicStaffSelect,
            data: {
              organizationId,
              authUserId: createdAuthUserId,
              fullName: dto.fullName,
              email: dto.email,
              phone: dto.phone,
              role: dto.role,
              branchId: dto.branchId,
              employeeCode: dto.employeeCode,
              isActive: true,
            },
          });
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (error) {
      if (createdAuthUserId) {
        try {
          const cleanup =
            await this.supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
          if (cleanup.error) throw new Error('Cleanup failed');
        } catch {
          throw new InternalServerErrorException(
            'Staff provisioning failed; provider reconciliation is required',
          );
        }
      }
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException('Staff provisioning failed');
    }
  }

  private async lockMutationActor(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    requestingUserId: string,
  ) {
    await tx.$executeRaw`SELECT id FROM staff WHERE organization_id = ${organizationId}::uuid AND id IN (${id}::uuid, ${requestingUserId}::uuid) ORDER BY id FOR UPDATE`;
    const actor = await tx.staff.findFirst({
      where: {
        id: requestingUserId,
        organizationId,
        isActive: true,
        role: { in: ['org_admin', 'branch_manager', 'agent', 'accountant'] },
      },
      select: { id: true, role: true },
    });
    if (!actor) throw new ForbiddenException('Staff mutation is not permitted');
    return actor;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateStaffDto,
    requestingUserId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const actor = await this.lockMutationActor(
        tx,
        organizationId,
        id,
        requestingUserId,
      );
      if (
        actor.role !== 'org_admin' &&
        (actor.id !== id || Object.keys(dto).some((key) => key !== 'phone'))
      )
        throw new ForbiddenException(
          'You can only update your own phone number',
        );
      const staff = await tx.staff.findUnique({
        where: { id, organizationId },
        select: publicStaffSelect,
      });
      if (!staff) throw new NotFoundException('Staff not found');

      if (
        dto.branchId !== undefined ||
        dto.role !== undefined ||
        dto.isActive === true
      ) {
        await this.validateBranch(
          tx,
          organizationId,
          dto.branchId === undefined ? staff.branchId : dto.branchId,
          dto.role ?? staff.role,
          dto.isActive ?? staff.isActive,
        );
      }

      return tx.staff.update({
        select: publicStaffSelect,
        where: { id, organizationId },
        data: dto,
      });
    });
  }

  async updateOwnPhone(organizationId: string, id: string, phone: string) {
    return this.update(organizationId, id, { phone }, id);
  }

  async remove(organizationId: string, id: string, requestingUserId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const actor = await this.lockMutationActor(
        tx,
        organizationId,
        id,
        requestingUserId,
      );
      if (actor.role !== 'org_admin')
        throw new ForbiddenException('Staff removal is not permitted');
      const staff = await tx.staff.findUnique({
        where: { id, organizationId },
        select: publicStaffSelect,
      });
      if (!staff) throw new NotFoundException('Staff not found');

      return tx.staff.update({
        select: publicStaffSelect,
        where: { id, organizationId },
        data: { isActive: false },
      });
    });
  }

  private async validateBranch(
    tx: Prisma.TransactionClient,
    organizationId: string,
    branchId: string | null | undefined,
    role: string,
    isActive: boolean,
  ) {
    if (role === 'branch_manager' && isActive && !branchId)
      throw new BadRequestException(
        'An active branch manager requires a branch',
      );
    if (
      branchId &&
      !(await tx.branch.findFirst({
        where: { id: branchId, organizationId },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException(
        'Branch does not belong to this organization',
      );
    }
  }
}
