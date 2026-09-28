import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog';
import { Textarea } from '@/shared/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { apiClient } from '@/shared/lib/api-client';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { MessageSquare } from 'lucide-react';

interface SmsDialogProps {
  customerName: string;
  customerPhone: string;
}

export const SmsDialog: React.FC<SmsDialogProps> = ({ customerName, customerPhone }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [template, setTemplate] = useState('custom');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const templates: Record<string, string> = {
    custom: '',
    collectionReminder: `Dear ${customerName}, your upcoming collection amount of ₹1000 is due on ${new Date().toLocaleDateString()}. Please ensure funds are available. - PigmieFinance`,
    collectionReceipt: `Dear ${customerName}, we have received your payment of ₹1000. Receipt No: RCPT-123. Thank you for choosing PigmieFinance.`,
    loanApproved: `Dear ${customerName}, your loan of ₹50000 has been approved. The amount will be disbursed shortly. - PigmieFinance`,
    paymentOverdue: `Dear ${customerName}, your payment of ₹1000 is overdue by 5 days. Please pay immediately to avoid penalties. - PigmieFinance`,
  };

  const handleTemplateChange = (val: string) => {
    setTemplate(val);
    setMessage(templates[val] || '');
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    try {
      setIsSending(true);
      await apiClient.notifications.sendSms({ phone: customerPhone, message });
      alert('SMS sent successfully!');
      setIsOpen(false);
      setMessage('');
      setTemplate('custom');
    } catch (error) {
      console.error('Failed to send SMS', error);
      alert('Failed to send SMS. Please check settings and try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border text-foreground/80 hover:bg-muted hover:text-foreground">
          <MessageSquare className="w-4 h-4 mr-2" />
          Send SMS
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Send SMS to {customerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Template</label>
            <Select value={template} onValueChange={handleTemplateChange}>
              <SelectTrigger className="bg-card border-border text-foreground">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="custom">Custom Message</SelectItem>
                <SelectItem value="collectionReminder">Collection Reminder</SelectItem>
                <SelectItem value="collectionReceipt">Collection Receipt</SelectItem>
                <SelectItem value="loanApproved">Loan Approved</SelectItem>
                <SelectItem value="paymentOverdue">Payment Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Message Preview</label>
            <Textarea
              className="min-h-[100px] bg-card border-border text-foreground"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          
          <Button 
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSend}
            disabled={isSending || !message.trim()}
          >
            {isSending ? <LoadingSpinner className="w-4 h-4 mr-2" /> : null}
            {isSending ? 'Sending...' : 'Send Message'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
