import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService
  ) {}

  async createOrganization(authUserId: string, dto: CreateOrganizationDto) {
    const existingStaff = await this.prisma.staff.findUnique({ where: { authUserId } });
    const existingCustomer = await this.prisma.customer.findUnique({ where: { authUserId } });
    if (existingStaff || existingCustomer) {
      throw new ConflictException('Auth identity already belongs to an organization');
    }

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          operatorType: dto.operatorType || 'organization',
          currency: dto.currency || 'USD',
          timezone: dto.timezone || 'UTC',
          contactPhone: dto.contactPhone || null,
        }
      });

      const branch = await tx.branch.create({
        data: {
          organizationId: org.id,
          name: 'Head Office',
          isActive: true
        }
      });

      const staff = await tx.staff.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          authUserId,
          fullName: dto.adminFullName || `${dto.organizationName} Admin`,
          email: dto.adminEmail,
          role: 'org_admin',
          isActive: true
        }
      });

      return { organization: org, staff, branch };
    });
  }

  async getMyOrganization(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: organizationId }
      });
      if (!org) throw new NotFoundException('Organization not found');
      return org;
    });
  }

  async updateOrganization(organizationId: string, dto: UpdateOrganizationDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.organization.update({
        where: { id: organizationId },
        data: dto
      });
    });
  }

  async getBranches(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.branch.findMany({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: 'asc' }
      });
    });
  }

  async getBranch(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id, organizationId, isActive: true }
      });
      if (!branch) throw new NotFoundException('Branch not found');
      return branch;
    });
  }

  async createBranch(organizationId: string, dto: CreateBranchDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.branch.create({
        data: {
          organizationId,
          name: dto.name,
          address: dto.address,
          isActive: true
        }
      });
    });
  }

  async updateBranch(organizationId: string, id: string, dto: UpdateBranchDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id, organizationId, isActive: true }
      });
      if (!branch) throw new NotFoundException('Branch not found');

      return tx.branch.update({
        where: { id },
        data: dto
      });
    });
  }

  async deleteBranch(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id, organizationId, isActive: true }
      });
      if (!branch) throw new NotFoundException('Branch not found');

      return tx.branch.update({
        where: { id },
        data: { isActive: false }
      });
    });
  }
}

