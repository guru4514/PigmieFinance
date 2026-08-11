import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class PortalService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getMe(organizationId: string, customerId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId }
      });
      if (!customer) throw new NotFoundException('Customer not found');

      const activeLoans = await tx.loan.count({
        where: { customerId, status: 'active' }
      });

      return {
        fullName: customer.fullName,
        phone: customer.phone,
        activeLoans,
      };
    });
  }

  async getLoans(organizationId: string, customerId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.loan.findMany({
        where: { customerId, organizationId },
        include: { loanProduct: true }
      });
    });
  }

  async getLoanDetails(organizationId: string, customerId: string, loanId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: { loanProduct: true }
      });
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.customerId !== customerId) throw new ForbiddenException('Access denied');
      return loan;
    });
  }

  async getLoanSchedule(organizationId: string, customerId: string, loanId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId }
      });
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.customerId !== customerId) throw new ForbiddenException('Access denied');
      
      return tx.loanSchedule.findMany({
        where: { loanId },
        orderBy: { installmentNumber: 'asc' }
      });
    });
  }

  async getLoanCollections(organizationId: string, customerId: string, loanId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId }
      });
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.customerId !== customerId) throw new ForbiddenException('Access denied');
      
      return tx.collection.findMany({
        where: { loanId },
        orderBy: { collectionDate: 'desc' }
      });
    });
  }
}

