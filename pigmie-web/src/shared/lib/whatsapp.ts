export function openWhatsApp(phone: string, message: string) {
  // Clean phone number (remove spaces, dashes, add country code if missing)
  const cleaned = phone.replace(/[\s-]/g, '');
  const withCode = cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${withCode.replace('+', '')}?text=${encoded}`, '_blank');
}

export function generateReceiptMessage(data: {
  customerName: string;
  amount: number;
  date: string;
  loanId: string;
  outstandingBalance: number;
  organizationName?: string;
}) {
  return `🧾 *Payment Receipt*\n\n` +
    `Customer: ${data.customerName}\n` +
    `Amount: ₹${((data.amount) || 0).toLocaleString('en-IN')}\n` +
    `Date: ${data.date}\n` +
    `Loan ID: ${data.loanId}\n` +
    `Outstanding: ₹${((data.outstandingBalance) || 0).toLocaleString('en-IN')}\n\n` +
    `${data.organizationName ? `— ${data.organizationName}` : ''}`;
}

export function generateReminderMessage(data: {
  customerName: string;
  dueAmount: number;
  dueDate: string;
  daysOverdue: number;
  organizationName?: string;
}) {
  return `🔔 *Payment Reminder*\n\n` +
    `Dear ${data.customerName},\n\n` +
    `Your payment of ₹${((data.dueAmount) || 0).toLocaleString('en-IN')} was due on ${data.dueDate} ` +
    `(${data.daysOverdue} days overdue).\n\n` +
    `Please make the payment at your earliest convenience.\n\n` +
    `${data.organizationName ? `— ${data.organizationName}` : ''}`;
}
