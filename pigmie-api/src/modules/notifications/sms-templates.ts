export const smsTemplates = {
  collectionReminder: (customerName: string, amount: number, dueDate: string) =>
    `Dear ${customerName}, your upcoming collection amount of ${amount} is due on ${dueDate}. Please ensure funds are available. - PigmieFinance`,
    
  collectionReceipt: (customerName: string, amount: number, receiptNumber: string) =>
    `Dear ${customerName}, we have received your payment of ${amount}. Receipt No: ${receiptNumber}. Thank you for choosing PigmieFinance.`,
    
  loanApproved: (customerName: string, amount: number) =>
    `Dear ${customerName}, your loan of ${amount} has been approved. The amount will be disbursed shortly. - PigmieFinance`,
    
  paymentOverdue: (customerName: string, amount: number, daysOverdue: number) =>
    `Dear ${customerName}, your payment of ${amount} is overdue by ${daysOverdue} days. Please pay immediately to avoid penalties. - PigmieFinance`,
};
