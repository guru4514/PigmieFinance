import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { MessageCircle, Printer } from 'lucide-react';
import { openWhatsApp, generateReceiptMessage } from '@/shared/lib/whatsapp';

export interface ReceiptCollection {
  id: string;
  amount: number;
  collectionDate: string;
  collectionMethod: string;
  customerName: string;
  customerPhone?: string;
  loanId: string;
  outstandingBalance: number;
  receiptNumber?: string;
}

export interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  collection: ReceiptCollection | null;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function formatReceiptNumber(collection: ReceiptCollection): string {
  if (collection.receiptNumber) {
    return collection.receiptNumber;
  }
  const cleanId = collection.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
  return `COL-${cleanId || '00000'}`;
}

function formatLoanId(loanId: string): string {
  if (loanId.startsWith('LOAN-')) {
    return loanId;
  }
  const cleanId = loanId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
  return `LOAN-${cleanId || '00000'}`;
}

function formatCurrency(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

function formatMethod(method?: string): string {
  if (!method) return 'Cash';
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

export function ReceiptModal({ open, onClose, collection }: ReceiptModalProps) {
  if (!collection) {
    return null;
  }

  const receiptNumber = formatReceiptNumber(collection);
  const formattedLoanId = formatLoanId(collection.loanId);
  const formattedDate = formatDate(collection.collectionDate);
  const formattedMethod = formatMethod(collection.collectionMethod);
  const formattedAmount = formatCurrency(collection.amount);
  const formattedOutstanding = formatCurrency(collection.outstandingBalance);

  const handleWhatsAppShare = () => {
    const msg = generateReceiptMessage({
      customerName: collection.customerName,
      amount: collection.amount,
      date: formattedDate,
      loanId: formattedLoanId,
      outstandingBalance: collection.outstandingBalance,
      organizationName: 'PigmieFinance',
    });

    const phone = collection.customerPhone?.trim();
    if (phone) {
      openWhatsApp(phone, msg);
    } else {
      const encoded = encodeURIComponent(msg);
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            margin: 10mm;
            size: auto;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible !important;
          }
          #printable-receipt {
            position: fixed !important;
            left: 50% !important;
            top: 20px !important;
            transform: translateX(-50%) !important;
            width: 340px !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 20px !important;
            background: #ffffff !important;
            color: #000000 !important;
            border: 2px dashed #000000 !important;
            box-shadow: none !important;
          }
          #printable-receipt .receipt-text {
            color: #000000 !important;
          }
          #printable-receipt .receipt-muted {
            color: #333333 !important;
          }
          #printable-receipt .receipt-divider {
            color: #000000 !important;
          }
          #printable-receipt .receipt-amount {
            color: #000000 !important;
            font-weight: bold !important;
          }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-md bg-zinc-900/90 border-zinc-800 text-zinc-100 backdrop-blur-md p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>Payment Receipt</DialogTitle>
            <DialogDescription>Payment receipt details and options</DialogDescription>
          </DialogHeader>

          {/* Styled Paper Receipt */}
          <div
            id="printable-receipt"
            className="font-mono text-xs sm:text-sm bg-zinc-950/80 border-2 border-dashed border-zinc-700 rounded-lg p-5 sm:p-6 text-zinc-100 shadow-inner select-text"
          >
            <div className="text-center font-bold tracking-widest text-zinc-500 receipt-divider select-none">
              ============================
            </div>
            <div className="text-center py-1">
              <h3 className="font-bold text-sm sm:text-base tracking-widest text-white receipt-text uppercase">
                PAYMENT RECEIPT
              </h3>
            </div>
            <div className="text-center font-bold tracking-widest text-zinc-500 receipt-divider select-none">
              ============================
            </div>

            <div className="py-2 space-y-1">
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Date:</span>
                <span className="font-medium text-right text-white receipt-text">{formattedDate}</span>
              </div>
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Receipt #:</span>
                <span className="font-medium text-right text-white receipt-text">{receiptNumber}</span>
              </div>
            </div>

            <div className="text-center font-bold tracking-widest text-zinc-500 receipt-divider select-none">
              ----------------------------
            </div>

            <div className="py-2 space-y-1">
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Customer:</span>
                <span className="font-medium text-right text-white receipt-text truncate max-w-[200px]" title={collection.customerName}>
                  {collection.customerName}
                </span>
              </div>
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Phone:</span>
                <span className="font-medium text-right text-white receipt-text">{collection.customerPhone || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Loan ID:</span>
                <span className="font-medium text-right text-white receipt-text">{formattedLoanId}</span>
              </div>
            </div>

            <div className="text-center font-bold tracking-widest text-zinc-500 receipt-divider select-none">
              ----------------------------
            </div>

            <div className="py-2 space-y-1">
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Amount Paid:</span>
                <span className="font-bold text-right text-emerald-400 receipt-amount text-sm sm:text-base">
                  {formattedAmount}
                </span>
              </div>
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Method:</span>
                <span className="font-medium text-right text-white receipt-text">{formattedMethod}</span>
              </div>
            </div>

            <div className="text-center font-bold tracking-widest text-zinc-500 receipt-divider select-none">
              ----------------------------
            </div>

            <div className="py-2 space-y-1">
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-zinc-400 receipt-muted shrink-0">Outstanding:</span>
                <span className="font-semibold text-right text-white receipt-text">
                  {formattedOutstanding}
                </span>
              </div>
            </div>

            <div className="text-center font-bold tracking-widest text-zinc-500 receipt-divider select-none">
              ----------------------------
            </div>

            <div className="text-center py-2">
              <p className="font-semibold tracking-wider text-white receipt-text">Thank you!</p>
            </div>

            <div className="text-center font-bold tracking-widest text-zinc-500 receipt-divider select-none">
              ============================
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              onClick={handleWhatsAppShare}
              className="bg-[#25D366] hover:bg-[#20ba5a] text-white flex-1 gap-2 shadow-sm font-medium"
            >
              <MessageCircle className="h-4 w-4" />
              Share via WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              className="border-zinc-700 hover:bg-zinc-800 text-white gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-zinc-400 hover:text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
