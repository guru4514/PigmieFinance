import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { useRestructureLoan, Loan, useLoanSchedule } from '../hooks/use-loans';
import { RefreshCw } from 'lucide-react';

const restructureSchema = z.object({
  fromInstallmentNumber: z.number().min(1, 'Select an installment'),
  newTenure: z.number().min(1, 'Tenure must be at least 1'),
  reason: z.string().optional(),
});

type RestructureFormValues = z.infer<typeof restructureSchema>;

interface RestructureLoanDialogProps {
  loan: Loan;
  trigger?: React.ReactNode;
}

export const RestructureLoanDialog: React.FC<RestructureLoanDialogProps> = ({ loan, trigger }) => {
  const [open, setOpen] = useState(false);
  const restructureLoan = useRestructureLoan();
  const { data: scheduleResponse, isLoading: scheduleLoading } = useLoanSchedule(loan.id);
  const schedule = scheduleResponse?.data || [];
  
  const pendingInstallments = schedule.filter((s: any) => s.status === 'PENDING' || s.status === 'PARTIAL');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RestructureFormValues>({
    resolver: zodResolver(restructureSchema),
    defaultValues: {
      fromInstallmentNumber: 0,
      newTenure: 1,
      reason: ''
    }
  });

  const onSubmit = async (data: RestructureFormValues) => {
    try {
      await restructureLoan.mutateAsync({ id: loan.id, data });
      setOpen(false);
      reset();
    } catch (error) {
      console.error('Failed to restructure loan:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Restructure
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle>Restructure Loan</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Change the remaining tenure of this loan starting from a specific pending installment.
          </DialogDescription>
        </DialogHeader>
        
        {scheduleLoading ? (
          <div className="flex justify-center p-8"><LoadingSpinner className="w-6 h-6 text-primary" /></div>
        ) : pendingInstallments.length === 0 ? (
          <div className="p-4 text-center text-zinc-400">
            No pending installments available to restructure.
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Start from Installment</label>
              <select
                {...register('fromInstallmentNumber', { valueAsNumber: true })}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value={0}>Select installment...</option>
                {pendingInstallments.map((inst: any) => (
                  <option key={inst.id} value={inst.installmentNumber}>
                    #{inst.installmentNumber} (Due: {new Date(inst.dueDate).toLocaleDateString()})
                  </option>
                ))}
              </select>
              {errors.fromInstallmentNumber && <p className="text-sm text-red-400">{errors.fromInstallmentNumber.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">New Remaining Tenure</label>
              <Input
                type="number"
                {...register('newTenure', { valueAsNumber: true })}
                className="bg-zinc-800/50 border-zinc-700 text-white"
                placeholder="e.g. 10"
              />
              {errors.newTenure && <p className="text-sm text-red-400">{errors.newTenure.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Reason (Optional)</label>
              <textarea
                {...register('reason')}
                className="flex min-h-[80px] w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Why is this loan being restructured?"
              />
              {errors.reason && <p className="text-sm text-red-400">{errors.reason.message}</p>}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white hover:bg-zinc-800">
                Cancel
              </Button>
              <Button type="submit" disabled={restructureLoan.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                {restructureLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                Restructure
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
