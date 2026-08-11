import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateLoanProductDto } from './dto/create-loan-product.dto';
import { UpdateLoanProductDto } from './dto/update-loan-product.dto';
import { QueryLoanProductDto } from './dto/query-loan-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class LoanProductsService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  async create(organizationId: string, dto: CreateLoanProductDto, staffId: string) {
    if (dto.minAmount > dto.maxAmount) {
      throw new BadRequestException('minAmount cannot be greater than maxAmount');
    }
    if (dto.minTenure > dto.maxTenure) {
      throw new BadRequestException('minTenure cannot be greater than maxTenure');
    }

    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.loanProduct.create({
        data: {
          organizationId,
          name: dto.name,
          interestType: dto.interestType,
          interestRateAnnual: new Prisma.Decimal(dto.interestRateAnnual),
          collectionFrequency: dto.collectionFrequency,
          minAmount: new Prisma.Decimal(dto.minAmount),
          maxAmount: new Prisma.Decimal(dto.maxAmount),
          minTenure: dto.minTenure,
          maxTenure: dto.maxTenure,
          lateFeeType: dto.lateFeeType,
          lateFeeValue: new Prisma.Decimal(dto.lateFeeValue ?? 0),
          processingFee: new Prisma.Decimal(dto.processingFee ?? 0),
        },
      });
    });
  }

  async findAll(organizationId: string, query: QueryLoanProductDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const where: Prisma.LoanProductWhereInput = {
        organizationId,
      };

      if (query.isActive !== undefined) {
        where.isActive = query.isActive;
      }

      const total = await tx.loanProduct.count({ where });
      const data = await tx.loanProduct.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async findOne(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const product = await tx.loanProduct.findFirst({
        where: { id, organizationId },
      });
      if (!product) {
        throw new NotFoundException('Loan product not found');
      }
      return product;
    });
  }

  async update(organizationId: string, id: string, dto: UpdateLoanProductDto, staffId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const product = await tx.loanProduct.findFirst({
        where: { id, organizationId },
      });
      if (!product) {
        throw new NotFoundException('Loan product not found');
      }

      const currentMinAmount = dto.minAmount ?? product.minAmount.toNumber();
      const currentMaxAmount = dto.maxAmount ?? product.maxAmount.toNumber();
      const currentMinTenure = dto.minTenure ?? product.minTenure;
      const currentMaxTenure = dto.maxTenure ?? product.maxTenure;

      if (currentMinAmount > currentMaxAmount) {
        throw new BadRequestException('minAmount cannot be greater than maxAmount');
      }
      if (currentMinTenure > currentMaxTenure) {
        throw new BadRequestException('minTenure cannot be greater than maxTenure');
      }

      const data: Prisma.LoanProductUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.interestType !== undefined) data.interestType = dto.interestType;
      if (dto.interestRateAnnual !== undefined) data.interestRateAnnual = new Prisma.Decimal(dto.interestRateAnnual);
      if (dto.collectionFrequency !== undefined) data.collectionFrequency = dto.collectionFrequency;
      if (dto.minAmount !== undefined) data.minAmount = new Prisma.Decimal(dto.minAmount);
      if (dto.maxAmount !== undefined) data.maxAmount = new Prisma.Decimal(dto.maxAmount);
      if (dto.minTenure !== undefined) data.minTenure = dto.minTenure;
      if (dto.maxTenure !== undefined) data.maxTenure = dto.maxTenure;
      if (dto.lateFeeType !== undefined) data.lateFeeType = dto.lateFeeType;
      if (dto.lateFeeValue !== undefined) data.lateFeeValue = new Prisma.Decimal(dto.lateFeeValue);
      if (dto.processingFee !== undefined) data.processingFee = new Prisma.Decimal(dto.processingFee);
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      return tx.loanProduct.update({
        where: { id },
        data,
      });
    });
  }

  async remove(organizationId: string, id: string, staffId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const product = await tx.loanProduct.findFirst({
        where: { id, organizationId },
      });
      if (!product) {
        throw new NotFoundException('Loan product not found');
      }

      return tx.loanProduct.update({
        where: { id },
        data: { isActive: false },
      });
    });
  }
}

