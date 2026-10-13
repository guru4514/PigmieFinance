import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { PortalAccessDto } from './dto/portal-access.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { EncryptionService } from '../../services/encryption.service';
import { createClient } from '@supabase/supabase-js';
import { Prisma, KycStatus } from '@prisma/client';
import { StaffUser } from '../../common/types/request-user.type';
import { randomUUID } from 'node:crypto';
import { provisioningLockKey } from '../../common/utils/provisioning-lock.util';

@Injectable()
export class CustomersService {
  private supabaseAdmin: ReturnType<typeof createClient>;

  constructor(
    private tenantPrisma: TenantPrismaService,
    private encryptionService: EncryptionService,
  ) {
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
    query: QueryCustomerDto,
    user: StaffUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const {
        page = 1,
        limit = 20,
        search,
        branchId,
        agentId,
        isActive,
      } = query;
      const skip = (page - 1) * limit;

      const where: Prisma.CustomerWhereInput = { organizationId };
      if (isActive !== undefined) where.isActive = isActive;

      let finalBranchId = branchId;
      let finalAgentId = agentId;

      if (user.role === 'agent') {
        finalAgentId = user.id;
      } else if (user.role === 'branch_manager' && user.branchId) {
        finalBranchId = user.branchId;
      }

      if (finalBranchId) where.branchId = finalBranchId;
      if (finalAgentId) where.assignedAgentId = finalAgentId;

      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const total = await tx.customer.count({ where });
      const data = await tx.customer.findMany({
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

  async findOne(
    organizationId: string,
    id: string,
    requestUserRole: string,
    requestUserId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id, organizationId },
        include: {
          assignedAgent: { select: { fullName: true } },
          branch: { select: { name: true } },
        },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      if (
        requestUserRole === 'agent' &&
        customer.assignedAgentId !== requestUserId
      ) {
        throw new NotFoundException('Customer not found');
      }

      if (requestUserRole === 'branch_manager') {
        const staff = await tx.staff.findUnique({
          where: { id: requestUserId, organizationId },
        });
        if (staff && customer.branchId !== staff.branchId) {
          throw new NotFoundException('Customer not found');
        }
      }

      let idProofNumber = null;
      if (customer.idProofNumberEncrypted) {
        try {
          idProofNumber = this.encryptionService.decrypt(
            Buffer.from(customer.idProofNumberEncrypted),
          );
        } catch {
          console.error('Failed to decrypt id proof number');
        }
      }

      return { ...customer, idProofNumber };
    });
  }

  async create(
    organizationId: string,
    dto: CreateCustomerDto,
    user: StaffUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const assignment = await this.validateAssignment(
        tx,
        organizationId,
        dto,
        user,
      );
      const { idProofNumber, ...dataToSave } = dto;
      let idProofNumberEncrypted = null;
      if (idProofNumber) {
        idProofNumberEncrypted = Uint8Array.from(
          this.encryptionService.encrypt(idProofNumber),
        );
      }

      return tx.customer.create({
        data: {
          ...dataToSave,
          ...assignment,
          organizationId,
          idProofNumberEncrypted,
          isActive: true,
          portalAccessEnabled: false,
        },
      });
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCustomerDto,
    user: StaffUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      if (user.organizationId !== organizationId)
        throw new ForbiddenException('Organization mismatch');
      await tx.$executeRaw`SELECT id FROM staff WHERE id = ${user.id}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const actor = await tx.staff.findFirst({
        where: { id: user.id, organizationId, isActive: true },
      });
      if (
        !actor ||
        !['org_admin', 'branch_manager', 'agent'].includes(actor.role)
      )
        throw new ForbiddenException('Customer update is not permitted');
      const currentUser: StaffUser = {
        ...user,
        role: actor.role,
        branchId: actor.branchId,
      };
      const requestUserRole = currentUser.role;
      const requestUserId = currentUser.id;
      // Financial workflows also lock customer before loan, preventing opposite-order waits.
      await tx.$executeRaw`SELECT id FROM customers WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findUnique({
        where: { id, organizationId },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      if (
        requestUserRole === 'agent' &&
        customer.assignedAgentId !== requestUserId
      ) {
        throw new ForbiddenException(
          'Cannot update customer not assigned to you',
        );
      }
      if (requestUserRole === 'branch_manager') {
        if (
          !currentUser.branchId ||
          customer.branchId !== currentUser.branchId
        ) {
          throw new ForbiddenException(
            'Cannot update customer not in your branch',
          );
        }
      }

      const assignment = await this.validateAssignment(
        tx,
        organizationId,
        dto,
        currentUser,
        customer,
      );
      const { idProofNumber, ...customerData } = dto;
      const updateData: Prisma.CustomerUncheckedUpdateInput = {
        ...customerData,
        ...assignment,
      };
      if (idProofNumber) {
        updateData.idProofNumberEncrypted = Uint8Array.from(
          this.encryptionService.encrypt(idProofNumber),
        );
      }

      const updatedCustomer = await tx.customer.update({
        where: { id, organizationId },
        data: updateData,
      });

      if (
        dto.assignedAgentId !== undefined &&
        dto.assignedAgentId !== customer.assignedAgentId
      ) {
        await tx.loan.updateMany({
          where: {
            customerId: id,
            organizationId,
            status: { in: ['pending_approval', 'active', 'approved'] },
          },
          data: {
            assignedAgentId:
              dto.assignedAgentId === null ? null : dto.assignedAgentId,
          },
        });
      }

      return updatedCustomer;
    });
  }

  async remove(organizationId: string, id: string, requestingUserId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.administrativeCustomer(
        tx,
        organizationId,
        id,
        requestingUserId,
      );
      return tx.customer.update({
        where: { id, organizationId },
        data: { isActive: false, portalAccessEnabled: false },
      });
    });
  }

  async findLoans(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.loan.findMany({
        where: { customerId: id, organizationId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async grantPortalAccess(
    organizationId: string,
    id: string,
    dto: PortalAccessDto,
    requestingUserId: string,
  ) {
    let createdAuthUserId: string | undefined;
    const attemptId = randomUUID();
    try {
      return await this.tenantPrisma.run(
        organizationId,
        async (tx) => {
          const customer = await this.administrativeCustomer(
            tx,
            organizationId,
            id,
            requestingUserId,
          );
          if (!customer.isActive)
            throw new BadRequestException('Customer is inactive');
          if (customer.portalAccessEnabled)
            throw new BadRequestException('Customer already has portal access');

          if (customer.authUserId) {
            if (customer.email?.toLowerCase() !== dto.email.toLowerCase())
              throw new BadRequestException(
                'Use the existing portal account email',
              );
            const existing = await this.supabaseAdmin.auth.admin.getUserById(
              customer.authUserId,
            );
            if (
              existing.error ||
              !existing.data.user ||
              existing.data.user.email?.toLowerCase() !==
                dto.email.toLowerCase()
            )
              throw new BadRequestException(
                'Existing portal identity requires operator recovery',
              );
            return tx.customer.update({
              where: { id, organizationId },
              data: { portalAccessEnabled: true },
              select: {
                id: true,
                email: true,
                authUserId: true,
                portalAccessEnabled: true,
              },
            });
          }

          const lockKey = provisioningLockKey(attemptId);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          const { data, error } =
            await this.supabaseAdmin.auth.admin.createUser({
              email: dto.email,
              email_confirm: false,
              user_metadata: { full_name: customer.fullName },
              app_metadata: {
                pigmie_provisioning_attempt: attemptId,
                pigmie_organization_id: organizationId,
                pigmie_provisioning_kind: 'customer_portal',
              },
            });

          if (error || !data.user) {
            throw new InternalServerErrorException(
              'Portal account creation failed',
            );
          }

          const authUserId = data.user.id;
          createdAuthUserId = authUserId;

          if (process.env.APP_ENV !== 'staging') {
            const inviteRes =
              await this.supabaseAdmin.auth.admin.inviteUserByEmail(dto.email);
            if (inviteRes.error || inviteRes.data.user?.id !== authUserId)
              throw new InternalServerErrorException(
                'Portal invitation failed',
              );
          }

          return tx.customer.update({
            select: {
              id: true,
              email: true,
              authUserId: true,
              portalAccessEnabled: true,
            },
            where: { id, organizationId },
            data: {
              authUserId,
              portalAccessEnabled: true,
              email: dto.email,
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
            'Portal provisioning failed; provider reconciliation is required',
          );
        }
      }
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException('Portal provisioning failed');
    }
  }

  private async administrativeCustomer(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    requestingUserId: string,
  ) {
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
    if (!actor || (actor.role === 'branch_manager' && !actor.branchId))
      throw new ForbiddenException('Customer administration is not permitted');
    await tx.$executeRaw`SELECT id FROM customers WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    const customer = await tx.customer.findUnique({
      where: {
        id,
        organizationId,
        ...(actor.role === 'branch_manager'
          ? { branchId: actor.branchId }
          : {}),
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async revokePortalAccess(
    organizationId: string,
    id: string,
    requestingUserId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await this.administrativeCustomer(
        tx,
        organizationId,
        id,
        requestingUserId,
      );
      if (!customer.portalAccessEnabled || !customer.authUserId)
        throw new BadRequestException('Customer does not have portal access');

      return tx.customer.update({
        select: {
          id: true,
          email: true,
          authUserId: true,
          portalAccessEnabled: true,
        },
        where: { id, organizationId },
        data: {
          portalAccessEnabled: false,
        },
      });
    });
  }

  async importCustomers(
    organizationId: string,
    dto: ImportCustomersDto,
    user: StaffUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const errors = [];
      let successCount = 0;

      for (let i = 0; i < dto.customers.length; i++) {
        const cDto = dto.customers[i];
        try {
          const assignment = await this.validateAssignment(
            tx,
            organizationId,
            cDto,
            user,
          );
          const { idProofNumber, ...dataToSave } = cDto;
          let idProofNumberEncrypted = null;
          if (idProofNumber) {
            idProofNumberEncrypted = Uint8Array.from(
              this.encryptionService.encrypt(idProofNumber),
            );
          }
          await tx.customer.create({
            data: {
              ...dataToSave,
              ...assignment,
              organizationId,
              idProofNumberEncrypted,
              isActive: true,
              portalAccessEnabled: false,
            },
          });
          successCount++;
        } catch (error: unknown) {
          errors.push({
            row: i + 1,
            message:
              error instanceof Error ? error.message : 'Customer import failed',
          });
        }
      }

      return {
        totalRows: dto.customers.length,
        successCount,
        errors,
      };
    });
  }

  async bulkCreate(
    organizationId: string,
    dto: import('./dto/customer.dto').BulkCreateCustomerDto,
    user: StaffUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customersToCreate = await Promise.all(
        dto.customers.map(async (cDto) => {
          const assignment = await this.validateAssignment(
            tx,
            organizationId,
            cDto,
            user,
          );
          const { idProofNumber, ...dataToSave } = cDto;
          let idProofNumberEncrypted = null;
          if (idProofNumber) {
            idProofNumberEncrypted = Uint8Array.from(
              this.encryptionService.encrypt(idProofNumber),
            );
          }

          return {
            ...dataToSave,
            ...assignment,
            organizationId,
            idProofNumberEncrypted,
            isActive: true,
            portalAccessEnabled: false,
          };
        }),
      );

      const result = await tx.customer.createMany({
        data: customersToCreate,
      });

      return {
        successCount: result.count,
      };
    });
  }
  private async validateAssignment(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: { branchId?: string | null; assignedAgentId?: string | null },
    user: StaffUser,
    current?: { branchId: string | null; assignedAgentId: string | null },
  ) {
    if (user.organizationId !== organizationId)
      throw new ForbiddenException('Organization mismatch');
    // Contact/KYC changes must remain possible when an old assignment is inactive.
    if (
      current &&
      dto.branchId === undefined &&
      dto.assignedAgentId === undefined
    )
      return {};
    let branchId =
      dto.branchId !== undefined ? dto.branchId : current?.branchId;
    let assignedAgentId =
      dto.assignedAgentId !== undefined
        ? dto.assignedAgentId
        : current?.assignedAgentId;
    if (user.role === 'agent') {
      if (current && branchId !== current.branchId)
        throw new ForbiddenException(
          'Agents cannot move customers between branches',
        );
      if (assignedAgentId !== undefined && assignedAgentId !== user.id)
        throw new ForbiddenException('Agents cannot reassign customers');
      if (!current && branchId !== undefined && branchId !== user.branchId)
        throw new ForbiddenException(
          'Agents can only create customers in their own branch',
        );
      assignedAgentId = user.id;
      if (!current) branchId = user.branchId;
    }
    if (user.role === 'branch_manager') {
      if (
        !user.branchId ||
        (branchId !== undefined && branchId !== user.branchId)
      )
        throw new ForbiddenException('Customers must remain in your branch');
      branchId = user.branchId;
    }
    if (branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId },
        select: { id: true },
      });
      if (!branch)
        throw new BadRequestException('Branch not found in your organization');
    }
    if (assignedAgentId) {
      await tx.$executeRaw`SELECT id FROM staff WHERE id = ${assignedAgentId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const agent = await tx.staff.findFirst({
        where: {
          id: assignedAgentId,
          organizationId,
          isActive: true,
          role: 'agent',
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true },
      });
      if (!agent)
        throw new BadRequestException(
          'Assigned agent must be active and belong to the customer’s organization and branch',
        );
    }
    return { branchId, assignedAgentId };
  }

  async getKycSummary(organizationId: string, user: StaffUser) {
    if (user.role === 'branch_manager' && !user.branchId)
      throw new ForbiddenException('A branch assignment is required');
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const summary = await tx.customer.groupBy({
        by: ['kycStatus'],
        where: {
          organizationId,
          ...(user.role === 'agent' ? { assignedAgentId: user.id } : {}),
          ...(user.role === 'branch_manager'
            ? { branchId: user.branchId }
            : {}),
        },
        _count: { id: true },
      });
      return summary.map((item) => ({
        status: item.kycStatus,
        count: item._count.id,
      }));
    });
  }

  async updateKycStatus(organizationId: string, id: string, status: unknown) {
    if (
      typeof status !== 'string' ||
      !Object.values(KycStatus).includes(status as KycStatus)
    )
      throw new BadRequestException('Invalid KYC status');
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id, organizationId },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      return tx.customer.update({
        where: { id, organizationId },
        data: { kycStatus: status as KycStatus },
      });
    });
  }
}
