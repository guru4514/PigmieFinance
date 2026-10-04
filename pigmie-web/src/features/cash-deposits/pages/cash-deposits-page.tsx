import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Wallet, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/shared/hooks/use-auth';
import { useTranslation } from 'react-i18next';

interface CashDeposit {
  id: string;
  agentId: string;
  agentName?: string;
  amount: number;
  status: 'pending' | 'verified' | 'discrepancy';
  depositedAt: string;
  verifiedAt?: string;
  notes?: string;
}

interface ReconciliationSummary {
  totalPending: number;
  totalVerifiedToday: number;
}

const depositSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  notes: z.string().optional(),
});

type DepositFormValues = z.infer<typeof depositSchema>;

export function CashDepositsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userRole = user?.userType === 'staff' ? user.role : null;
  const isAdmin = userRole === 'org_admin' || userRole === 'branch_manager' || userRole === 'accountant';
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<DepositFormValues>({
    resolver: zodResolver(depositSchema),
  });

  const { data: deposits = [], isLoading } = useQuery<CashDeposit[]>({
    queryKey: ['cash-deposits'],
    queryFn: async () => {
      const res = await apiClient.get('/cash-deposits');
      return res.data;
    },
  });

  const { data: summary } = useQuery<ReconciliationSummary>({
    queryKey: ['cash-deposits-reconciliation'],
    queryFn: async () => {
      const res = await apiClient.get('/cash-deposits/reconciliation');
      return res.data;
    },
    enabled: isAdmin,
  });

  const recordMutation = useMutation({
    mutationFn: (data: DepositFormValues) => apiClient.post('/cash-deposits', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-deposits'] });
      toast.success('Deposit recorded successfully');
      setIsDialogOpen(false);
      reset();
    },
    onError: () => toast.error('Failed to record deposit'),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/cash-deposits/${id}/verify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['cash-deposits-reconciliation'] });
      toast.success('Deposit verified successfully');
    },
    onError: () => toast.error('Failed to verify deposit'),
  });

  const onSubmit = (data: DepositFormValues) => {
    recordMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground"> {t('deposits.title')} </h1>
          <p className="text-muted-foreground">Manage and verify daily cash handovers</p>
        </div>
        {!isAdmin && (
          <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
            <Wallet className="w-4 h-4" />
            Record Deposit
          </Button>
        )}
      </div>

      {isAdmin && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Pending Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{((summary.totalPending) || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="glass border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Verified Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">₹{((summary.totalVerifiedToday) || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="glass border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>{t('nav.date')}</TableHead>
                {isAdmin && <TableHead>Agent</TableHead>}
                <TableHead> {t('deposits.amount')} </TableHead>
                <TableHead>{t('branches.status')}</TableHead>
                <TableHead className="text-right">{t('loans.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    Loading deposits...
                  </TableCell>
                </TableRow>
              ) : deposits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    No deposits found.
                  </TableCell>
                </TableRow>
              ) : (
                deposits.map((deposit) => (
                  <TableRow key={deposit.id} className="border-border hover:bg-muted">
                    <TableCell>{format(new Date(deposit.depositedAt), 'MMM dd, yyyy HH:mm')}</TableCell>
                    {isAdmin && <TableCell>{deposit.agentName || 'Unknown Agent'}</TableCell>}
                    <TableCell className="font-medium">₹{((deposit.amount) || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={
                          deposit.status === 'verified' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
                          deposit.status === 'discrepancy' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 
                          'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        }
                      >
                        {deposit.status.charAt(0).toUpperCase() + deposit.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin && deposit.status === 'pending' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => verifyMutation.mutate(deposit.id)}
                          disabled={verifyMutation.isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Verify
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="glass border-border">
          <DialogHeader>
            <DialogTitle>Record Cash Deposit</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium"> {t('deposits.amount')} </label>
              <Input
                type="number"
                {...register('amount', { valueAsNumber: true })}
                placeholder="Enter amount"
                className="bg-muted/50 border-border"
              />
              {errors.amount && <p className="text-sm text-rose-500">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input
                {...register('notes')}
                placeholder="Any additional notes..."
                className="bg-muted/50 border-border"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={recordMutation.isPending}>
                Record Deposit
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
