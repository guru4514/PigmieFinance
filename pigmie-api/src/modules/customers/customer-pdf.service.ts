import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class CustomerPdfService {
  constructor(private readonly prisma: TenantPrismaService) {}

  async generatePassbook(customerId: string, orgId: string): Promise<Buffer> {
    return this.prisma.run(orgId, async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId, organizationId: orgId },
        include: {
          organization: true,
          loans: {
            include: {
              collections: {
                orderBy: { collectionDate: 'asc' },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (buffer) => buffers.push(buffer));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).text(customer.organization.name, { align: 'center' });
        doc.fontSize(14).text('Customer Passbook', { align: 'center' });
        doc.moveDown();

        // Customer Info
        doc.fontSize(12).text(`Customer Name: ${customer.fullName}`);
        doc.text(`Phone: ${customer.phone}`);
        if (customer.address) {
          doc.text(`Address: ${customer.address}`);
        }
        doc.moveDown(2);

        // Loans and Collections
        if (customer.loans.length === 0) {
          doc.text('No loans found for this customer.');
        } else {
          customer.loans.forEach((loan, index) => {
            if (doc.y > 650) { doc.addPage(); doc.y = 50; }
            doc.fontSize(14).text(`Loan: ${loan.loanCode}`, { underline: true });
            doc.fontSize(10).text(`Status: ${loan.status} | Principal: ${loan.principalAmount.toString()} | Total Payable: ${loan.totalPayable.toString()} | Balance: ${loan.outstandingBalance.toString()}`);
            doc.moveDown(0.5);

            if (loan.collections.length === 0) {
              doc.text('No collections recorded for this loan yet.', { align: 'left' });
              doc.moveDown();
            } else {
              const collHeaders = ['Date', 'Method', 'Amount Paid', 'Status'];
              let y = doc.y;
              
              doc.fontSize(10).font('Helvetica-Bold');
              collHeaders.forEach((header, i) => {
                doc.text(header, 50 + i * 110, y, { width: 110, align: 'left' });
              });
              doc.moveDown(0.5);

              doc.font('Helvetica');
              let runningBalance = Number(loan.totalPayable);

              loan.collections.forEach((coll) => {
                if (doc.y > 700) { doc.addPage(); doc.y = 50; }
                y = doc.y;
                doc.text(coll.collectionDate.toISOString().split('T')[0], 50, y, { width: 110, align: 'left' });
                doc.text(coll.collectionMethod, 50 + 110, y, { width: 110, align: 'left' });
                doc.text(coll.amount.toString(), 50 + 110 * 2, y, { width: 110, align: 'left' });
                doc.text(coll.status, 50 + 110 * 3, y, { width: 110, align: 'left' });
                doc.moveDown(0.5);
              });
              doc.moveDown();
            }
          });
        }

        doc.end();
      });
    });
  }
}
