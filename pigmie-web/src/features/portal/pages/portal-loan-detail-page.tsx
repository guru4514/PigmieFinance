import { useParams, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePortalLoanDetails } from '../hooks/use-portal';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';

export function PortalLoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: loanRes, isLoading } = usePortalLoanDetails(id || '');

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <LoadingSpinner className="w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  const { loan, schedule, summary } = loanRes || { loan: null, schedule: [], summary: null };

  if (!loan) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        Loan not found.
      </div>
    );
  }

  const progressPercent = summary?.totalAmount > 0 
    ? Math.round((summary.totalPaid / summary.totalAmount) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/app/portal/dashboard">
          <Button variant="ghost" size="icon" className="hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{loan.loanProduct?.name || 'Loan Account'}</h1>
            <Badge variant="default" className={
              loan.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' :
              loan.status === 'closed' ? 'bg-zinc-500/20 text-muted-foreground border-zinc-500/50' :
              'bg-amber-500/20 text-amber-400 border-amber-500/50'
            }>
              {loan.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Loan ID: #{loan.id.slice(0, 8)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border bg-card backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-foreground">Loan Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Principal</p>
                  <p className="text-xl font-bold mt-1 text-foreground">₹{(loan.principalAmount || loan.amount).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Interest Rate</p>
                  <p className="text-xl font-bold mt-1 text-foreground">{loan.interestRate}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-xl font-bold mt-1 text-foreground">₹{((summary?.totalAmount) || 0).toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paid Amount</p>
                  <p className="text-xl font-bold mt-1 text-emerald-400">₹{((summary?.totalPaid) || 0).toLocaleString() || 0}</p>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-foreground">Repayment Progress</span>
                  <span className="text-sm font-medium text-emerald-400">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className={`h-full bg-emerald-500 rounded-full`} style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-foreground">Repayment Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {schedule.length === 0 ? (
                  <div className="text-center p-4 text-muted-foreground">No schedule generated yet.</div>
                ) : (
                  schedule.map((installment: any) => (
                    <div key={installment.id} className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
                      <div className="flex items-center gap-4">
                        {installment.status === 'paid' ? (
                          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                        ) : installment.status === 'overdue' ? (
                          <AlertCircle className="h-6 w-6 text-rose-500" />
                        ) : (
                          <AlertCircle className="h-6 w-6 text-amber-500" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">Installment {installment.installmentNumber}</p>
                          <p className="text-sm text-muted-foreground">{new Date(installment.dueDate).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">₹{((installment.amount) || 0).toLocaleString()}</p>
                        <Badge variant="outline" className={
                          installment.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          installment.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                          'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }>
                          {installment.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border bg-card backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-foreground">Next Payment Due</CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.nextInstallment ? (
                <div className="text-center py-4">
                  <p className="text-4xl font-bold text-amber-400">₹{((summary.nextInstallment.amount) || 0).toLocaleString()}</p>
                  <p className="text-muted-foreground mt-2">Due on {new Date(summary.nextInstallment.dueDate).toLocaleDateString()}</p>
                  <Button className="w-full mt-6 bg-indigo-500 hover:bg-indigo-600 text-foreground font-medium">
                    Pay Now via UPI
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <p className="text-lg font-medium text-foreground">All Caught Up!</p>
                  <p className="text-sm text-muted-foreground mt-1">No pending installments.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
