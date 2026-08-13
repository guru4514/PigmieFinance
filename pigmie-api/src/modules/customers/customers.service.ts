import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { PortalAccessDto } from './dto/portal-access.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { EncryptionService } from '../../services/encryption.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class CustomersService {
  private supabaseAdmin: SupabaseClient;

  constructor(
    private tenantPrisma: TenantPrismaService,
    private encryptionService: EncryptionService
  ) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase admin credentials not configured in environment variables');
    }
    this.supabaseAdmin = createClient(supabaseUrl, supabaseKey);
  }

  async findAll(organizationId: string, query: QueryCustomerDto, user: any) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const { page = 1, limit = 20, search, branchId, agentId, isActive } = query;
      const skip = (page - 1) * limit;

      const where: any = { organizationId };
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
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      const total = await tx.customer.count({ where });
      const data = await tx.customer.findMany({ 
        where, 
        skip, 
        take: limit,
        orderBy: { createdAt: 'desc' }
      });

      return {
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    });
  }

  async findOne(organizationId: string, id: string, requestUserRole: string, requestUserId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id, organizationId } });
      if (!customer) throw new NotFoundException('Customer not found');

      if (requestUserRole === 'agent' && customer.assignedAgentId !== requestUserId) {
        throw new NotFoundException('Customer not found');
      }

      if (requestUserRole === 'branch_manager') {
        const staff = await tx.staff.findUnique({ where: { id: requestUserId, organizationId } });
        if (staff && customer.branchId !== staff.branchId) {
          throw new NotFoundException('Customer not found');
        }
      }

      let idProofNumber = null;
      if (customer.idProofNumberEncrypted) {
        try {
          idProofNumber = this.encryptionService.decrypt(Buffer.from(customer.idProofNumberEncrypted));
        } catch (e) {
          console.error('Failed to decrypt id proof number');
        }
      }

      return { ...customer, idProofNumber };
    });
  }

  async create(organizationId: string, dto: CreateCustomerDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      let idProofNumberEncrypted = null;
      if (dto.idProofNumber) {
        idProofNumberEncrypted = Uint8Array.from(this.encryptionService.encrypt(dto.idProofNumber));
      }

      const { idProofNumber, ...dataToSave } = dto;

      return tx.customer.create({
        data: {
          ...dataToSave,
          organizationId,
          idProofNumberEncrypted,
          isActive: true,
          portalAccessEnabled: false
        }
      });
    });
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto, requestUserRole: string, requestUserId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id, organizationId } });
      if (!customer) throw new NotFoundException('Customer not found');

      if (requestUserRole === 'agent' && customer.assignedAgentId !== requestUserId) {
        throw new ForbiddenException('Cannot update customer not assigned to you');
      }
      if (requestUserRole === 'branch_manager') {
        const staff = await tx.staff.findUnique({ where: { id: requestUserId, organizationId } });
        if (staff && customer.branchId !== staff.branchId) {
          throw new ForbiddenException('Cannot update customer not in your branch');
        }
      }

      let updateData: any = { ...dto };
      if (dto.idProofNumber) {
        updateData.idProofNumberEncrypted = Uint8Array.from(this.encryptionService.encrypt(dto.idProofNumber));
      }
      delete updateData.idProofNumber;

      return tx.customer.update({
        where: { id, organizationId },
        data: updateData
      });
    });
  }

  async remove(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id, organizationId } });
      if (!customer) throw new NotFoundException('Customer not found');

      return tx.customer.update({
        where: { id, organizationId },
        data: { isActive: false }
      });
    });
  }

  async findLoans(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.loan.findMany({
        where: { customerId: id, organizationId },
        orderBy: { createdAt: 'desc' }
      });
    });
  }

  async grantPortalAccess(organizationId: string, id: string, dto: PortalAccessDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id, organizationId } });
      if (!customer) throw new NotFoundException('Customer not found');
      if (customer.portalAccessEnabled) throw new BadRequestException('Customer already has portal access');

      const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
        email: dto.email,
        email_confirm: false,
        user_metadata: { full_name: customer.fullName },
      });

      if (error) {
        throw new InternalServerErrorException(`Failed to create auth user: ${error.message}`);
      }

      const authUserId = data.user.id;
      
      const inviteRes = await this.supabaseAdmin.auth.admin.inviteUserByEmail(dto.email);
      if (inviteRes.error) {
        console.error('Error inviting user:', inviteRes.error);
      }

      return tx.customer.update({
        where: { id, organizationId },
        data: {
          authUserId,
          portalAccessEnabled: true,
          email: dto.email
        }
      });
    });
  }

  async revokePortalAccess(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id, organizationId } });
      if (!customer) throw new NotFoundException('Customer not found');
      if (!customer.portalAccessEnabled || !customer.authUserId) throw new BadRequestException('Customer does not have portal access');

      const { error } = await this.supabaseAdmin.auth.admin.deleteUser(customer.authUserId);
      if (error) {
        console.error('Error deleting auth user:', error);
      }

      return tx.customer.update({
        where: { id, organizationId },
        data: {
          authUserId: null,
          portalAccessEnabled: false
        }
      });
    });
  }

  async importCustomers(organizationId: string, dto: ImportCustomersDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const errors = [];
      let successCount = 0;

      for (let i = 0; i < dto.customers.length; i++) {
        const cDto = dto.customers[i];
        try {
          let idProofNumberEncrypted = null;
          if (cDto.idProofNumber) {
            idProofNumberEncrypted = Uint8Array.from(this.encryptionService.encrypt(cDto.idProofNumber));
          }

          const { idProofNumber, ...dataToSave } = cDto;
          await tx.customer.create({
            data: {
              ...dataToSave,
              organizationId,
              idProofNumberEncrypted,
              isActive: true,
              portalAccessEnabled: false
            }
          });
          successCount++;
        } catch (error: any) {
          errors.push({ row: i + 1, message: error.message });
        }
      }

      return {
        totalRows: dto.customers.length,
        successCount,
        errors
      };
    });
  }

  async bulkCreate(organizationId: string, dto: import('./dto/customer.dto').BulkCreateCustomerDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customersToCreate = dto.customers.map(cDto => {
        let idProofNumberEncrypted = null;
        if (cDto.idProofNumber) {
          idProofNumberEncrypted = Uint8Array.from(this.encryptionService.encrypt(cDto.idProofNumber));
        }

        const { idProofNumber, ...dataToSave } = cDto;

        return {
          ...dataToSave,
          organizationId,
          idProofNumberEncrypted,
          isActive: true,
          portalAccessEnabled: false
        };
      });

      const result = await tx.customer.createMany({
        data: customersToCreate
      });

      return {
        successCount: result.count
      };
    });
  }
}

