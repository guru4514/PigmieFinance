import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { usePreClosureDetails, usePreCloseLoan } from '../hooks/use-loans';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { CheckCircle } from 'lucide-react';

interface PreCloseLoanDialogProps {
  loanId: string;
  trigger: React.ReactNode;
}

export const PreCloseLoanDialog: React.FC<PreCloseLoanDialogProps> = ({ loanId, trigger }) => {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = usePreClosureDetails(loanId, open);
  const preCloseLoan = usePreCloseLoan();

  const handleConfirm = () => {
    if (!data) return;
    preCloseLoan.mutate(
      { id: loanId, preClosureAmount: data.preClosureAmount },
      {
        onSuccess: () => {
          setOpen(false);
        }
      }
    );
  };

  return (
    <>
      <div onClick={() => setOpen(true)}>
        {trigger}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Pre-Close Loan</DialogTitle>
            <DialogDescription className="text-gray-400">
              Calculate and process an early loan payoff.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <LoadingSpinner className="w-8 h-8 text-primary" />
            </div>
          ) : !data ? (
            <div className="text-center py-6 text-red-400">Failed to load details</div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-gray-400">Outstanding Principal</span>
                <span className="font-medium">₹{((data.outstandingPrincipal) || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-gray-400">Accrued Interest</span>
                <span className="font-medium">₹{((data.accruedInterest) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-gray-400">Pre-closure Penalty ({data.penaltyRate}%)</span>
                <span className="font-medium text-yellow-400">₹{((data.preClosurePenalty) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-white/5 rounded-lg px-4 mt-2 border border-border">
                <span className="font-medium text-lg">Total Payoff Amount</span>
                <span className="font-bold text-xl text-primary">
                  ₹{((data.preClosureAmount) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-lg flex items-start gap-3 mt-4 border border-emerald-500/20">
                <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm mb-0.5">Early Closure Savings</p>
                  <p className="text-xs">
                    By closing this loan early, the borrower saves <strong className="text-emerald-300">₹{((data.amountSaved) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> on future scheduled interest payments.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-300 hover:text-foreground hover:bg-white/10">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={isLoading || preCloseLoan.isPending || !data}
              className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[140px]"
            >
              {preCloseLoan.isPending ? (
                <LoadingSpinner className="w-4 h-4 mr-2" />
              ) : null}
              Confirm Pre-Closure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
