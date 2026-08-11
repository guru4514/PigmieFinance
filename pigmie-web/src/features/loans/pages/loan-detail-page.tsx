import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLoanDetails, useApproveLoan, useDisburseLoan, useLoanSchedule } from '../hooks/use-loans';
import { LoanStatusBadge } from '../components/loan-status-badge';
import { LoanScheduleTable } from '../components/loan-schedule-table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, FileText, Download, User, Play } from 'lucide-react';
import { RoleGate } from '@/shared/components/auth/role-gate';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';

type Tab = 'overview' | 'schedule' | 'collections' | 'documents';

export const LoanDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: loanResponse, isLoading: loading } = useLoanDetails(id || '');
  const loan = loanResponse?.data;
  
  const { data: scheduleResponse, isLoading: scheduleLoading } = useLoanSchedule(id || '');
  const schedule = scheduleResponse?.data || [];

  const approveLoan = useApproveLoan();
  const disburseLoan = useDisburseLoan();

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  if (loading) {
    return <div className="p-8 flex justify-center"><LoadingSpinner className="w-8 h-8 text-primary" /></div>;
  }

  if (!loan) {
    return <div className="p-8 text-center text-red-400">Loan not found</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link to="/app/loans">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 text-gray-400">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">Loan {loan.id.slice(0, 8)}</h1>
              <LoanStatusBadge status={loan.status} />
            </div>
            <p className="text-sm text-gray-400 mt-1">Borrower: {loan.customer?.fullName || loan.customerId}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <RoleGate allowedRoles={['ADMIN', 'MANAGER']}>
            {loan.status === 'PENDING' && (
              <Button 
                onClick={() => approveLoan.mutate(loan.id)}
                disabled={approveLoan.isPending}
                className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 gap-2"
              >
                {approveLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <CheckCircle className="h-4 w-4" />}
                Approve
              </Button>
            )}
            {loan.status === 'APPROVED' && (
              <Button 
                onClick={() => disburseLoan.mutate(loan.id)}
                disabled={disburseLoan.isPending}
                className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 gap-2"
              >
                {disburseLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <Play className="h-4 w-4" />}
                Disburse
              </Button>
            )}
            {loan.status === 'ACTIVE' && (
              <Button className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30 gap-2">
                <AlertTriangle className="h-4 w-4" />
                Mark Default
              </Button>
            )}
          </RoleGate>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-white/10 overflow-x-auto no-scrollbar">
        {(['overview', 'schedule', 'collections', 'documents'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-white/20'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 border-white/10 bg-black/40 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white text-lg">Loan Details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <p className="text-sm text-gray-500">Principal Amount</p>
                  <p className="text-xl font-semibold text-white">₹{loan.principalAmount?.toLocaleString() || loan.amount?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Remaining Balance</p>
                  <p className="text-xl font-semibold text-white">₹{loan.remainingBalance?.toLocaleString() || '0'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Interest Rate</p>
                  <p className="text-lg font-medium text-white">{loan.loanProduct?.interestRateAnnual}% p.a.</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tenure</p>
                  <p className="text-lg font-medium text-white">{loan.tenure} Installments</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Start Date</p>
                  <p className="text-base text-gray-200">{loan.startDate ? new Date(loan.startDate).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">End Date</p>
                  <p className="text-base text-gray-200">{loan.endDate ? new Date(loan.endDate).toLocaleDateString() : 'N/A'}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white text-lg">Next Payment</CardTitle>
              </CardHeader>
              <CardContent>
                {loan.nextPaymentDate ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-sm text-gray-400 mb-1">Due Date</p>
                      <p className="text-lg font-medium text-white mb-3">{new Date(loan.nextPaymentDate).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-400 mb-1">Amount</p>
                      <p className="text-2xl font-bold text-primary">₹{loan.nextPaymentAmount?.toLocaleString()}</p>
                    </div>
                    <RoleGate allowedRoles={['ADMIN', 'MANAGER', 'AGENT']}>
                      <Link to={`/app/collections/record/${loan.id}`}>
                        <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                          Record Payment
                        </Button>
                      </Link>
                    </RoleGate>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    No upcoming payments
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white">Repayment Schedule</h2>
            {scheduleLoading ? (
              <div className="flex justify-center p-8"><LoadingSpinner className="w-6 h-6 text-primary" /></div>
            ) : (
              <LoanScheduleTable payments={schedule} />
            )}
          </div>
        )}

        {activeTab === 'collections' && (
          <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white text-lg">Collection History</CardTitle>
              <CardDescription className="text-gray-400">Recent collections for this loan.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-500">
                <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No collection records yet.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'documents' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {['ID Proof', 'Address Proof', 'Loan Agreement', 'Promissory Note'].map((doc, idx) => (
              <Card key={idx} className="border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-primary transition-colors">{doc}</p>
                      <p className="text-xs text-gray-500">PDF Document</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white rounded-full">
                    <Download className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

