import { Injectable, InternalServerErrorException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StaffService {
  private supabaseAdmin: SupabaseClient;

  constructor(private tenantPrisma: TenantPrismaService) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase admin credentials not configured in environment variables');
    }
    this.supabaseAdmin = createClient(supabaseUrl, supabaseKey);
  }

  async findAll(organizationId: string, query: QueryStaffDto, requestingUserId?: string, isBranchManager: boolean = false) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const { page = 1, limit = 20, role, branchId, isActive } = query;
      const skip = (page - 1) * limit;
      
      const where: any = { organizationId };
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive;
      
      let finalBranchId = branchId;
      
      if (isBranchManager && requestingUserId) {
        const currentUser = await tx.staff.findUnique({ where: { id: requestingUserId, organizationId } });
        if (!currentUser) throw new ForbiddenException('Branch manager record not found');
        finalBranchId = currentUser.branchId || undefined;
      }
      
      if (finalBranchId) {
        where.branchId = finalBranchId;
      }

      const total = await tx.staff.count({ where });
      const data = await tx.staff.findMany({ 
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

  async findOne(organizationId: string, id: string, requestingUserId?: string, isBranchManager: boolean = false) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const staff = await tx.staff.findUnique({ where: { id, organizationId } });
      if (!staff) {
        throw new NotFoundException('Staff not found');
      }

      if (isBranchManager && requestingUserId) {
        const currentUser = await tx.staff.findUnique({ where: { id: requestingUserId, organizationId } });
        if (!currentUser || currentUser.branchId !== staff.branchId) {
          throw new NotFoundException('Staff not found'); // hide from other branches
        }
      }

      return staff;
    });
  }

  async create(organizationId: string, dto: CreateStaffDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      // 1. Create auth user in Supabase
      const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
        email: dto.email,
        email_confirm: false,
        user_metadata: { full_name: dto.fullName },
      });

      if (error) {
        throw new InternalServerErrorException(`Failed to create auth user: ${error.message}`);
      }

      const authUserId = data.user.id;

      // 2. Invite user
      const inviteRes = await this.supabaseAdmin.auth.admin.inviteUserByEmail(dto.email);
      if (inviteRes.error) {
        console.error('Error inviting user:', inviteRes.error);
        // We continue despite invite error, or we could throw
      }

      // 3. Create staff record in db
      const staff = await tx.staff.create({
        data: {
          organizationId,
          authUserId,
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          role: dto.role,
          branchId: dto.branchId,
          employeeCode: dto.employeeCode,
          isActive: true
        }
      });

      return staff;
    });
  }

  async update(organizationId: string, id: string, dto: UpdateStaffDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const staff = await tx.staff.findUnique({ where: { id, organizationId } });
      if (!staff) throw new NotFoundException('Staff not found');

      return tx.staff.update({
        where: { id, organizationId },
        data: dto
      });
    });
  }

  async updateOwnPhone(organizationId: string, id: string, phone: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const staff = await tx.staff.findUnique({ where: { id, organizationId } });
      if (!staff) throw new NotFoundException('Staff not found');

      return tx.staff.update({
        where: { id, organizationId },
        data: { phone }
      });
    });
  }

  async remove(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const staff = await tx.staff.findUnique({ where: { id, organizationId } });
      if (!staff) throw new NotFoundException('Staff not found');

      return tx.staff.update({
        where: { id, organizationId },
        data: { isActive: false }
      });
    });
  }
}

