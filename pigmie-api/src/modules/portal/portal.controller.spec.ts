jest.mock('../../common/guards/supabase-auth.guard', () => ({
  SupabaseAuthGuard: class {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type {
  CustomerUser,
  StaffUser,
} from '../../common/types/request-user.type';
import { CustomerPdfService } from '../customers/customer-pdf.service';
import { PdfService } from '../loans/pdf.service';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

describe('Portal statement downloads', () => {
  const generateLoanStatement = jest.fn();
  const controller = new PortalController(
    {} as PortalService,
    {} as CustomerPdfService,
    { generateLoanStatement } as unknown as PdfService,
  );
  const set = jest.fn();
  const end = jest.fn();
  const response = { set, end } as unknown as Response;
  const customer: CustomerUser = {
    type: 'customer',
    id: 'customer-a',
    organizationId: 'org-a',
  };

  beforeEach(() => jest.resetAllMocks());

  it('passes authenticated customer ownership into PDF generation', async () => {
    const pdf = Buffer.from('%PDF-test');
    generateLoanStatement.mockResolvedValue(pdf);
    await controller.getLoanStatement('loan-a', customer, response);
    expect(generateLoanStatement).toHaveBeenCalledWith(
      'loan-a',
      'org-a',
      'customer-a',
    );
    expect(end).toHaveBeenCalledWith(pdf);
  });

  it('does not write a PDF response when the ownership-filtered query fails', async () => {
    generateLoanStatement.mockRejectedValue(
      new NotFoundException('Loan not found'),
    );
    await expect(
      controller.getLoanStatement('loan-b', customer, response),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(set).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it('rejects staff before querying a portal statement', async () => {
    const staff: StaffUser = {
      type: 'staff',
      id: 'staff-a',
      organizationId: 'org-a',
      role: 'agent',
      branchId: null,
    };
    await expect(
      controller.getLoanStatement('loan-a', staff, response),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateLoanStatement).not.toHaveBeenCalled();
  });
});
