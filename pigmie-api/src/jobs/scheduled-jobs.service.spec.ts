import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('ScheduledJobsService', () => {
  let service: ScheduledJobsService;
  let prismaService: any;
  let tenantPrismaService: any;

  const mockTx = {
    loanSchedule: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    loan: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    prismaService = {
      organization: {
        findMany: jest.fn(),
      },
    };

    tenantPrismaService = {
      run: jest.fn().mockImplementation((orgId, fn) => fn(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledJobsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: TenantPrismaService, useValue: tenantPrismaService },
      ],
    }).compile();

    service = module.get<ScheduledJobsService>(ScheduledJobsService);
    jest.clearAllMocks();
  });

  it('should apply late fee and increment parent loan totalPayable and outstandingBalance', async () => {
    prismaService.organization.findMany.mockResolvedValue([{ id: 'org-1', isActive: true }]);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    mockTx.loanSchedule.findMany.mockResolvedValue([
      {
        id: 'sched-1',
        dueAmount: { toNumber: () => 100 },
        status: 'pending',
        dueDate: pastDate,
        loan: {
          id: 'loan-1',
          loanProduct: {
            lateFeeValue: { toNumber: () => 10 },
            lateFeeType: 'flat',
          },
        },
      },
    ]);
    mockTx.loan.findMany.mockResolvedValue([]);

    await service.markOverdueInstallments();

    expect(mockTx.loanSchedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { status: 'overdue', dueAmount: 110 },
    });

    expect(mockTx.loan.update).toHaveBeenCalledWith({
      where: { id: 'loan-1' },
      data: {
        totalPayable: { increment: 10 },
        outstandingBalance: { increment: 10 },
      },
    });

    expect(mockTx.auditLog.create).toHaveBeenCalled();
  });

  it('should not update loan totals if late fee is 0', async () => {
    prismaService.organization.findMany.mockResolvedValue([{ id: 'org-1', isActive: true }]);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    mockTx.loanSchedule.findMany.mockResolvedValue([
      {
        id: 'sched-2',
        dueAmount: { toNumber: () => 100 },
        status: 'pending',
        dueDate: pastDate,
        loan: {
          id: 'loan-2',
          loanProduct: {
            lateFeeValue: { toNumber: () => 0 },
            lateFeeType: 'flat',
          },
        },
      },
    ]);
    mockTx.loan.findMany.mockResolvedValue([]);

    await service.markOverdueInstallments();

    expect(mockTx.loanSchedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-2' },
      data: { status: 'overdue', dueAmount: 100 },
    });

    expect(mockTx.loan.update).not.toHaveBeenCalled();
  });
});
