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
  }  private buildHtml(title: string, bodyContent: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #e5e5e5; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #6366f1; }
    .title { font-size: 20px; font-weight: 600; color: #1a1a1a; margin: 16px 0 8px; }
    .body { color: #4a4a4a; line-height: 1.6; font-size: 15px; }
    .highlight { background: #f0f0ff; border-left: 4px solid #6366f1; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .amount { font-size: 28px; font-weight: 700; color: #059669; }
    .footer { text-align: center; padding-top: 24px; margin-top: 24px; border-top: 1px solid #e5e5e5; color: #9ca3af; font-size: 12px; }
    .btn { display: inline-block; padding: 10px 24px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">PigmieFinance</div>
      </div>
      <div class="title">${title}</div>
      <div class="body">
        ${bodyContent}
      </div>
      <div class="footer">
        <p>This is an automated message from PigmieFinance.</p>
        <p>Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  async sendLoanApproved(to: string, loanCode: string, customerName: string) {
    const html = this.buildHtml('Loan Approved', `
      <p>The loan application has been approved and is ready for disbursement.</p>
      <div class="highlight">
        <strong>Loan Code:</strong> ${loanCode}<br>
        <strong>Customer:</strong> ${customerName}
      </div>
      <p>Please proceed with the disbursement process at your earliest convenience.</p>
    `);
    await this.send(to, `Loan ${loanCode} Approved`, html);
  }

  async sendLoanDisbursed(to: string, loanCode: string, amount: string, customerName: string) {
    const html = this.buildHtml('Loan Disbursed', `
      <p>Dear ${customerName},</p>
      <p>Your loan has been successfully disbursed.</p>
      <div class="highlight">
        <strong>Loan Code:</strong> ${loanCode}<br>
        <strong>Amount:</strong> <span class="amount">₹${amount}</span>
      </div>
      <p>Your repayment schedule will begin as per the agreed terms. You can view your schedule in the customer portal.</p>
    `);
    await this.send(to, `Loan ${loanCode} Disbursed`, html);
  }

  async sendPaymentConfirmation(to: string, amount: string, receiptNo: string, customerName: string) {
    const html = this.buildHtml('Payment Received', `
      <p>Dear ${customerName},</p>
      <p>We have received your payment. Thank you!</p>
      <div class="highlight">
        <strong>Amount:</strong> <span class="amount">₹${amount}</span><br>
        <strong>Receipt:</strong> ${receiptNo}
      </div>
      <p>Thank you for your prompt payment.</p>
    `);
    await this.send(to, 'Payment Received — PigmieFinance', html);
  }

  async sendOverdueReminder(to: string, customerName: string, amount: string, dueDate: string) {
    const html = this.buildHtml('Payment Overdue', `
      <p>Dear ${customerName},</p>
      <p>This is a reminder that your payment is overdue.</p>
      <div class="highlight" style="border-left-color: #ef4444;">
        <strong>Amount Due:</strong> <span class="amount" style="color: #ef4444;">₹${amount}</span><br>
        <strong>Due Date:</strong> ${dueDate}
      </div>
      <p>Please make the payment at your earliest convenience to avoid additional late fees.</p>
    `);
    await this.send(to, 'Payment Overdue — PigmieFinance', html);
  }

  async sendWelcome(to: string, orgName: string) {
    const html = this.buildHtml('Welcome to PigmieFinance', `
      <p>Welcome! Your organization <strong>"${orgName}"</strong> has been set up successfully.</p>
      <p>You can now:</p>
      <ul>
        <li>Add staff members</li>
        <li>Create loan products</li>
        <li>Onboard customers</li>
        <li>Start managing collections</li>
      </ul>
      <p style="text-align: center; margin-top: 24px;">
        <a href="#" class="btn">Go to Dashboard</a>
      </p>
    `);
    await this.send(to, 'Welcome to PigmieFinance', html);
  }

  private async send(to: string, subject: string, htmlContent: string) {
    const textContent = htmlContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!this.transporter) {
      this.logger.log(`[EMAIL LOG] To: ${to} | Subject: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@pigmiefinance.com',
        to,
        subject,
        html: htmlContent,
        text: textContent,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${subject}`, error);
    }
  }
}
