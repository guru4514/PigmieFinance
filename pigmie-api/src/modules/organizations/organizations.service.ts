import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { publicStaffSelect } from '../staff/staff.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { randomUUID } from 'node:crypto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async createOrganization(authUserId: string, dto: CreateOrganizationDto) {
    const organizationId = randomUUID();
    return this.prisma.runOnboarding(authUserId, organizationId, async (tx) => {
      const identities = await tx.$queryRaw<
        {
          email: string | null;
          confirmed: boolean;
          banned: boolean;
          provisioning: boolean;
          linked: boolean;
        }[]
      >`
      SELECT * FROM public.runtime_onboarding_identity(${authUserId}::uuid)
    `;
      const identity = identities[0];
      if (
        !identity ||
        !identity.confirmed ||
        identity.banned ||
        identity.provisioning
      )
        throw new ForbiddenException(
          'Identity is not eligible for organization onboarding',
        );
      if (
        !identity.email ||
        identity.email.toLowerCase() !== dto.adminEmail.toLowerCase()
      )
        throw new BadRequestException(
          'Administrator email must match the verified account',
        );
      const existingStaff = await tx.staff.findUnique({
        where: { authUserId },
      });
      const existingCustomer = await tx.customer.findUnique({
        where: { authUserId },
      });
      if (identity.linked || existingStaff || existingCustomer) {
        throw new ConflictException(
          'Auth identity already belongs to an organization',
        );
      }

      const org = await tx.organization.create({
        data: {
          id: organizationId,
          name: dto.organizationName,
          operatorType: dto.operatorType || 'organization',
          currency: dto.currency || 'INR',
          timezone: dto.timezone || 'Asia/Kolkata',
          contactPhone: dto.contactPhone || null,
        },
      });

      const branch = await tx.branch.create({
        data: {
          organizationId: org.id,
          name: 'Head Office',
          isActive: true,
        },
      });

      const staff = await tx.staff.create({
        select: publicStaffSelect,
        data: {
          organizationId: org.id,
          branchId: branch.id,
          authUserId,
          fullName: dto.adminFullName || `${dto.organizationName} Admin`,
          email: identity.email,
          role: 'org_admin',
          isActive: true,
        },
      });

      return { organization: org, staff, branch };
    });
  }

  private async authorize(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    adminOnly = false,
  ) {
    await tx.$executeRaw`SELECT id FROM staff WHERE id = ${actorId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
    const actor = await tx.staff.findFirst({
      where: {
        id: actorId,
        organizationId,
        isActive: true,
        role: {
          in: adminOnly
            ? ['org_admin']
            : ['org_admin', 'branch_manager', 'agent', 'accountant'],
        },
      },
      select: { id: true },
    });
    if (!actor)
      throw new ForbiddenException('Organization access is not permitted');
  }

  async getMyOrganization(organizationId: string, actorId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, actorId);
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
      });
      if (!org) throw new NotFoundException('Organization not found');
      return org;
    });
  }

  async updateOrganization(
    organizationId: string,
    dto: UpdateOrganizationDto,
    actorId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, actorId, true);
      return tx.organization.update({
        where: { id: organizationId },
        data: dto,
      });
    });
  }

  async getBranches(organizationId: string, actorId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, actorId);
      return tx.branch.findMany({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async getBranch(organizationId: string, id: string, actorId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, actorId);
      const branch = await tx.branch.findFirst({
        where: { id, organizationId, isActive: true },
      });
      if (!branch) throw new NotFoundException('Branch not found');
      return branch;
    });
  }

  async createBranch(
    organizationId: string,
    dto: CreateBranchDto,
    actorId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, actorId, true);
      return tx.branch.create({
        data: {
          organizationId,
          name: dto.name,
          address: dto.address,
          isActive: true,
        },
      });
    });
  }

  async updateBranch(
    organizationId: string,
    id: string,
    dto: UpdateBranchDto,
    actorId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, actorId, true);
      await tx.$executeRaw`SELECT id FROM branches WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const branch = await tx.branch.findFirst({
        where: { id, organizationId, isActive: true },
      });
      if (!branch) throw new NotFoundException('Branch not found');

      return tx.branch.update({
        where: { id, organizationId, isActive: true },
        data: dto,
      });
    });
  }

  async deleteBranch(organizationId: string, id: string, actorId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, actorId, true);
      await tx.$executeRaw`SELECT id FROM branches WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const branch = await tx.branch.findFirst({
        where: { id, organizationId, isActive: true },
      });
      if (!branch) throw new NotFoundException('Branch not found');

      return tx.branch.update({
        where: { id, organizationId, isActive: true },
        data: { isActive: false },
      });
    });
  }
}
