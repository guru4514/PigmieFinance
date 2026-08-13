import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class PdfService {
  constructor(private readonly prisma: TenantPrismaService) {}

  async generateLoanStatement(loanId: string, orgId: string): Promise<Buffer> {
    return this.prisma.run(orgId, async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId, organizationId: orgId },
        include: {
          customer: true,
          organization: true,
          schedule: {
            orderBy: { installmentNumber: 'asc' },
          },
          collections: {
            orderBy: { collectionDate: 'asc' },
          },
        },
      });

      if (!loan) {
        throw new NotFoundException('Loan not found');
      }

      return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (buffer) => buffers.push(buffer));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).text(loan.organization.name, { align: 'center' });
        doc.fontSize(14).text('Loan Statement', { align: 'center' });
        doc.moveDown();

        // Customer Info
        doc.fontSize(12).text(`Customer Name: ${loan.customer.fullName}`);
        doc.text(`Phone: ${loan.customer.phone}`);
        doc.moveDown();

        // Loan Info
        doc.text(`Loan Code: ${loan.loanCode}`);
        doc.text(`Principal: ${loan.principalAmount.toString()}`);
        doc.text(`Interest: ${loan.interestRateAnnual.toString()}% (${loan.interestType})`);
        doc.text(`Tenure: ${loan.tenure} ${loan.collectionFrequency}`);
        if (loan.startDate) {
          doc.text(`Start Date: ${loan.startDate.toISOString().split('T')[0]}`);
        }
        if (loan.expectedEndDate) {
          doc.text(`Expected End Date: ${loan.expectedEndDate.toISOString().split('T')[0]}`);
        }
        doc.text(`Total Payable: ${loan.totalPayable.toString()}`);
        doc.text(`Outstanding Balance: ${loan.outstandingBalance.toString()}`);
        doc.moveDown(2);

        // Table 1: Repayment Schedule
        doc.fontSize(14).text('Repayment Schedule', { underline: true });
        doc.moveDown(0.5);
        
        const scheduleHeaders = ['Inst #', 'Due Date', 'Principal', 'Interest', 'Due Amt', 'Status'];
        let y = doc.y;
        
        doc.fontSize(10);
        scheduleHeaders.forEach((header, i) => {
          doc.text(header, 50 + i * 85, y, { width: 85, align: 'left' });
        });
        doc.moveDown(0.5);
        
        loan.schedule.forEach((inst) => {
          if (doc.y > 700) { doc.addPage(); doc.y = 50; }
          y = doc.y;
          doc.text(inst.installmentNumber.toString(), 50, y, { width: 85, align: 'left' });
          doc.text(inst.dueDate.toISOString().split('T')[0], 50 + 85, y, { width: 85, align: 'left' });
          doc.text(inst.principalComponent.toString(), 50 + 85 * 2, y, { width: 85, align: 'left' });
          doc.text(inst.interestComponent.toString(), 50 + 85 * 3, y, { width: 85, align: 'left' });
          doc.text(inst.dueAmount.toString(), 50 + 85 * 4, y, { width: 85, align: 'left' });
          doc.text(inst.status, 50 + 85 * 5, y, { width: 85, align: 'left' });
          doc.moveDown(0.5);
        });

        doc.moveDown(2);

        // Table 2: Collections History
        if (doc.y > 650) { doc.addPage(); doc.y = 50; }
        doc.fontSize(14).text('Collections History', { underline: true });
        doc.moveDown(0.5);

        const collHeaders = ['Date', 'Amount', 'Status', 'Agent/Staff ID'];
        y = doc.y;
        
        doc.fontSize(10);
        collHeaders.forEach((header, i) => {
          doc.text(header, 50 + i * 110, y, { width: 110, align: 'left' });
        });
        doc.moveDown(0.5);

        loan.collections.forEach((coll) => {
          if (doc.y > 700) { doc.addPage(); doc.y = 50; }
          y = doc.y;
          doc.text(coll.collectionDate.toISOString().split('T')[0], 50, y, { width: 110, align: 'left' });
          doc.text(coll.amount.toString(), 50 + 110, y, { width: 110, align: 'left' });
          doc.text(coll.status, 50 + 110 * 2, y, { width: 110, align: 'left' });
          doc.text(coll.collectedById, 50 + 110 * 3, y, { width: 110, align: 'left' });
          doc.moveDown(0.5);
        });

        doc.end();
      });
    });
  }
}
