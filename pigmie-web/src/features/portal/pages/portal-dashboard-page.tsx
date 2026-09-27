import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Wallet, CreditCard, Activity, FileText, Download } from 'lucide-react';
import { usePortalDashboard } from '../hooks/use-portal';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Button } from '@/shared/components/ui/button';
import { Link } from 'react-router-dom';
import { apiClient } from '@/shared/lib/api-client';

export function PortalDashboardPage() {
  const { data: dashboard, isLoading } = usePortalDashboard();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPassbook = async () => {
    try {
      setIsDownloading(true);
      const blob = await apiClient.portal.downloadPassbook();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `my-passbook.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download passbook', error);
      alert('Failed to download passbook. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <LoadingSpinner className="w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  const { customer, loans, stats } = dashboard || { customer: null, loans: [], stats: {} };

  const STATS = [
    {
      title: 'Active Loans',
      value: stats?.totalActiveLoans || 0,
      icon: CreditCard,
      color: 'text-blue-500',
    },
    {
      title: 'Total Disbursed',
      value: `₹${(stats?.totalDisbursed || 0).toLocaleString()}`,
      icon: Wallet,
      color: 'text-purple-500',
    },
    {
      title: 'Total Outstanding',
      value: `₹${(stats?.totalOutstanding || 0).toLocaleString()}`,
      icon: Activity,
      color: 'text-rose-500',
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer Portal</h1>
          <p className="text-muted-foreground mt-2">
            Welcome back, {customer?.fullName || 'User'}! Here's an overview of your accounts.
          </p>
        </div>
        <Button 
          variant="outline" 
          className="border-white/10 bg-white/5 hover:bg-white/10"
          onClick={handleDownloadPassbook}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <LoadingSpinner className="w-4 h-4 mr-2" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Download My Passbook
        </Button>
      </div>


      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {STATS.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="border-white/10 bg-black/40 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full bg-white/5 ${stat.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6">
        <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Your Active Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loans.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You have no active loans at the moment.</p>
                </div>
              ) : (
                loans.map((loan: any) => (
                  <div key={loan.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex flex-col">
                      <span className="font-medium text-white">{loan.loanProduct?.name || 'Loan'}</span>
                      <span className="text-xs text-muted-foreground">ID: {loan.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex flex-col items-end mr-4">
                      <span className="font-semibold text-rose-400">
                        ₹{loan.remainingBalance.toLocaleString()} Left
                      </span>
                      <span className="text-xs text-zinc-400">of ₹{loan.amount.toLocaleString()}</span>
                    </div>
                    <Link to={`/app/portal/loans/${loan.id}`}>
                      <button className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md text-sm font-medium transition-colors">
                        View Details
                      </button>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
