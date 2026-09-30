import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      this.logger.warn('SMTP not configured — emails will be logged only');
    }
  }

  async sendLoanApproved(to: string, loanCode: string, customerName: string) {
    await this.send(to, `Loan ${loanCode} Approved`,
      `Dear Team,\n\nThe loan application ${loanCode} for ${customerName} has been approved and is ready for disbursement.\n\nRegards,\nPigmieFinance`);
  }

  async sendLoanDisbursed(to: string, loanCode: string, amount: string, customerName: string) {
    await this.send(to, `Loan ${loanCode} Disbursed`,
      `Dear ${customerName},\n\nYour loan ${loanCode} of ₹${amount} has been disbursed. Your repayment schedule will begin as per the agreed terms.\n\nRegards,\nPigmieFinance`);
  }

  async sendPaymentConfirmation(to: string, amount: string, receiptNo: string, customerName: string) {
    await this.send(to, 'Payment Received — PigmieFinance',
      `Dear ${customerName},\n\nWe have received your payment of ₹${amount}.\nReceipt Number: ${receiptNo}\n\nThank you for your prompt payment.\n\nRegards,\nPigmieFinance`);
  }

  async sendOverdueReminder(to: string, customerName: string, amount: string, dueDate: string) {
    await this.send(to, 'Payment Overdue — PigmieFinance',
      `Dear ${customerName},\n\nThis is a reminder that your payment of ₹${amount} was due on ${dueDate}. Please make the payment at your earliest convenience to avoid late fees.\n\nRegards,\nPigmieFinance`);
  }

  async sendWelcome(to: string, orgName: string) {
    await this.send(to, `Welcome to PigmieFinance`,
      `Dear Admin,\n\nWelcome to PigmieFinance! Your organization "${orgName}" has been set up successfully.\n\nYou can now:\n- Add staff members\n- Create loan products\n- Onboard customers\n\nRegards,\nThe PigmieFinance Team`);
  }

  private async send(to: string, subject: string, text: string) {
    if (!this.transporter) {
      this.logger.log(`[EMAIL LOG] To: ${to} | Subject: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@pigmiefinance.com',
        to,
        subject,
        text,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${subject}`, error);
    }
  }
}
