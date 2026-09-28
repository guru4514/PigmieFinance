import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLoanDetails, useApproveLoan, useDisburseLoan, useLoanSchedule, useMarkDefaultLoan } from '../hooks/use-loans';
import { useDocuments, useUploadDocument, useDownloadDocument } from '@/features/documents/hooks/use-documents';
import { LoanStatusBadge } from '../components/loan-status-badge';
import { LoanScheduleTable } from '../components/loan-schedule-table';
import { RestructureLoanDialog } from '../components/restructure-loan-dialog';
import { PreCloseLoanDialog } from '../components/pre-close-loan-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { ArrowLeft, CheckCircle, AlertTriangle, FileText, Download, User, Play, RefreshCw, MessageCircle, Receipt, Upload } from 'lucide-react';
import { RoleGate } from '@/shared/components/auth/role-gate';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { apiClient } from '@/shared/lib/api-client';
import { toast } from 'sonner';
import { openWhatsApp, generateReceiptMessage } from '@/shared/lib/whatsapp';
import { ReceiptModal, ReceiptCollection } from '@/features/collections/components/receipt-modal';

type Tab = 'overview' | 'schedule' | 'collections' | 'documents';

export const LoanDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: loanResponse, isLoading: loading } = useLoanDetails(id || '');
  const loan = loanResponse?.data;
  
  const { data: scheduleResponse, isLoading: scheduleLoading } = useLoanSchedule(id || '');
  const schedule = scheduleResponse?.data || [];

  const approveLoan = useApproveLoan();
  const disburseLoan = useDisburseLoan();
  const markDefaultLoan = useMarkDefaultLoan();
  
  const { data: documentsResponse, isLoading: documentsLoading } = useDocuments('loan', id || '');
  const documents = documentsResponse || [];
  const uploadDocument = useUploadDocument('loan', id || '');
  const downloadDocument = useDownloadDocument();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptCollection | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  const handleDownloadStatement = async () => {
    if (!loan) return;
    try {
      setDownloadingStatement(true);
      const blob = await apiClient.loans.downloadLoanStatement(loan.id);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loan-statement-${loan.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Statement downloaded successfully');
    } catch (error) {
      console.error('Failed to download statement', error);
      toast.error('Failed to download statement');
    } finally {
      setDownloadingStatement(false);
    }
  };

  const handleShareReceipt = () => {
    if (!loan) return;
    const phone = loan.customer?.phone || loan.customer?.phoneNumber;
    if (!phone) return;
    // Fallback to loan info if collections data isn't available
    const msg = generateReceiptMessage({
      customerName: loan.customer?.fullName || loan.customerId,
      amount: loan.nextPaymentAmount || 0,
      date: new Date().toLocaleDateString(),
      loanId: loan.id,
      outstandingBalance: loan.remainingBalance || 0,
    });
    openWhatsApp(phone, msg);
  };

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

        <div className="flex gap-2 flex-wrap">
          <RoleGate allowedRoles={['org_admin', 'branch_manager', 'accountant', 'agent']}>
            <Button
              onClick={() => {
                const latestCol = loan.collections?.[0];
                setSelectedReceipt({
                  id: latestCol?.id || loan.id,
                  amount: latestCol ? Number(latestCol.amount) : (loan.nextPaymentAmount || loan.principalAmount || 0),
                  collectionDate: latestCol?.collectionDate || latestCol?.collectedAt || new Date().toISOString(),
                  collectionMethod: latestCol?.collectionMethod || 'cash',
                  customerName: loan.customer?.fullName || loan.customerId,
                  customerPhone: loan.customer?.phone || loan.customer?.phoneNumber,
                  loanId: loan.id,
                  outstandingBalance: Number(loan.remainingBalance || 0),
                  receiptNumber: latestCol?.receiptNumber || undefined,
                });
                setReceiptModalOpen(true);
              }}
              className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 gap-2"
            >
              <Receipt className="h-4 w-4" />
              View Receipt
            </Button>
            <Button
              onClick={handleShareReceipt}
              disabled={!loan.customer?.phone && !loan.customer?.phoneNumber}
              title={(!loan.customer?.phone && !loan.customer?.phoneNumber) ? 'No phone number available' : undefined}
              className="bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 border border-[#25D366]/30 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageCircle className="h-4 w-4" />
              Share Receipt
            </Button>
            <Button
              onClick={handleDownloadStatement}
              disabled={downloadingStatement}
              className="bg-zinc-800/50 text-white hover:bg-zinc-800 border border-zinc-700 gap-2"
            >
              {downloadingStatement ? <LoadingSpinner className="w-4 h-4" /> : <Download className="h-4 w-4" />}
              Statement
            </Button>
          </RoleGate>
          <RoleGate allowedRoles={['org_admin', 'branch_manager']}>
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
              <>
                <PreCloseLoanDialog
                  loanId={loan.id}
                  trigger={
                    <Button className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Pre-Close
                    </Button>
                  }
                />
                <RestructureLoanDialog 
                  loan={loan} 
                  trigger={
                    <Button className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Restructure
                    </Button>
                  } 
                />
                <Button 
                  onClick={() => {
                    if (window.confirm('Are you sure you want to mark this loan as defaulted?')) {
                      markDefaultLoan.mutate(loan.id);
                    }
                  }}
                  disabled={markDefaultLoan.isPending}
                  className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30 gap-2"
                >
                  {markDefaultLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <AlertTriangle className="h-4 w-4" />}
                  Mark Default
                </Button>
              </>
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
                    <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white text-lg">Collection History</CardTitle>
                <CardDescription className="text-gray-400">Recent collections for this loan.</CardDescription>
              </div>
              <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
                <Link to={`/app/collections/record/${loan.id}`}>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    Record Payment
                  </Button>
                </Link>
              </RoleGate>
            </CardHeader>
            <CardContent>
              {loan.collections && loan.collections.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-xs text-gray-400 uppercase">
                      <tr>
                        <th className="pb-3 font-medium">Receipt #</th>
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium">Method</th>
                        <th className="pb-3 font-medium">Amount</th>
                        <th className="pb-3 font-medium">Collected By</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loan.collections.map((col: any) => (
                        <tr key={col.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 font-mono text-xs text-gray-300">
                            {col.receiptNumber || `COL-${col.id.replace(/-/g, '').slice(0, 5).toUpperCase()}`}
                          </td>
                          <td className="py-3 text-gray-300">
                            {col.collectionDate || col.collectedAt
                              ? new Date(col.collectionDate || col.collectedAt!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                              : 'N/A'}
                          </td>
                          <td className="py-3 text-gray-300 capitalize">
                            {col.collectionMethod || 'Cash'}
                          </td>
                          <td className="py-3 font-semibold text-emerald-400">
                            ₹{Number(col.amount).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 text-gray-400 text-xs">
                            {col.collectedBy?.fullName || 'Staff'}
                          </td>
                          <td className="py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              col.status === 'reversed'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {(col.status || 'recorded').toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedReceipt({
                                  id: col.id,
                                  amount: Number(col.amount),
                                  collectionDate: col.collectionDate || col.collectedAt || new Date().toISOString(),
                                  collectionMethod: col.collectionMethod || 'cash',
                                  customerName: loan.customer?.fullName || loan.customerId,
                                  customerPhone: loan.customer?.phone || loan.customer?.phoneNumber,
                                  loanId: loan.id,
                                  outstandingBalance: Number(loan.remainingBalance || 0),
                                  receiptNumber: col.receiptNumber || undefined,
                                });
                                setReceiptModalOpen(true);
                              }}
                              className="h-8 border-white/10 hover:bg-white/10 text-white gap-1.5"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              View Receipt
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No collection records yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-white">Loan Documents</h2>
              <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      uploadDocument.mutate({ file, documentType: 'other' });
                      e.target.value = ''; // Reset input
                    }
                  }}
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadDocument.isPending}
                  className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 gap-2"
                >
                  {uploadDocument.isPending ? <LoadingSpinner className="w-4 h-4" /> : <Upload className="h-4 w-4" />}
                  Upload Document
                </Button>
              </RoleGate>
            </div>
            {documentsLoading ? (
              <div className="flex justify-center p-8"><LoadingSpinner className="w-6 h-6 text-primary" /></div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-white/10 rounded-xl">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No documents uploaded yet.</p>
                <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
                  <Button 
                    variant="link" 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary mt-2"
                  >
                    Upload your first document
                  </Button>
                </RoleGate>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map((doc: any) => (
                  <Card key={doc.id} className="border-white/10 bg-white/5 hover:bg-white/10 transition-colors group">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{doc.originalName || doc.documentType}</p>
                          <p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => downloadDocument.mutate(doc.id)}
                        disabled={downloadDocument.isPending}
                        className="text-gray-400 hover:text-white rounded-full shrink-0"
                      >
                        {downloadDocument.isPending ? <LoadingSpinner className="w-4 h-4" /> : <Download className="h-4 w-4" />}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ReceiptModal
        open={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        collection={selectedReceipt}
      />
    </div>
  );
};

