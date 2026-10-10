import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Calendar, Download } from 'lucide-react';
import { format } from 'date-fns';

import { ReceiptModal, ReceiptCollection } from '../components/receipt-modal';

export function CollectionHistoryPage() {
  
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptCollection | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['collections', 'history', page, dateFrom, dateTo],
    queryFn: () => apiClient.get('/collections', { 
      params: { 
        page, 
        limit: 20,
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {})
      } 
    }).then(r => r.data),
  });

  const collections = data?.data || [];
  const meta = data?.meta || { totalPages: 1 };

  const handleDownloadReceipt = async (col: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await apiClient.get(`/collections/${col.id}/receipt`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `receipt-${col.receiptNumber || col.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download receipt', error);
      alert('Failed to download receipt');
    }
  };

  const openReceipt = (col: any) => {
    setSelectedReceipt({
      id: col.id,
      amount: col.amount,
      collectionDate: col.collectionDate || col.collectedAt || new Date().toISOString(),
      collectionMethod: col.collectionMethod || 'cash',
      customerName: col.customer?.fullName || 'Unknown',
      customerPhone: '',
      loanId: col.loanId,
      outstandingBalance: 0,
      receiptNumber: col.receiptNumber
    });
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl pb-24 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Collection History</h1>
          <p className="text-muted-foreground">View all past collections and receipts.</p>
        </div>
      </div>

      <Card className="glass border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">From Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="date" 
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="pl-9 bg-background/50"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">To Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="date" 
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="pl-9 bg-background/50"
                />
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
            >
              Clear Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading history...</TableCell>
                  </TableRow>
                ) : collections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No collections found.</TableCell>
                  </TableRow>
                ) : (
                  collections.map((col: any) => (
                    <TableRow key={col.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openReceipt(col)}>
                      <TableCell className="font-medium text-xs font-mono">{col.receiptNumber || '-'}</TableCell>
                      <TableCell>{col.collectionDate ? format(new Date(col.collectionDate), 'MMM dd, yyyy') : '-'}</TableCell>
                      <TableCell>{col.customer?.fullName || '-'}</TableCell>
                      <TableCell>{col.collectedBy?.fullName || '-'}</TableCell>
                      <TableCell className="capitalize">{col.collectionMethod}</TableCell>
                      <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">₹{col.amount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          col.status === 'recorded' || col.status === 'verified' ? 'border-emerald-500 text-emerald-500' :
                          col.status === 'reversed' ? 'border-rose-500 text-rose-500' : 'border-amber-500 text-amber-500'
                        }>
                          {col.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => handleDownloadReceipt(col, e)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {meta.totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t border-border">
              <Button 
                variant="outline" 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {meta.totalPages}
              </span>
              <Button 
                variant="outline" 
                disabled={page === meta.totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ReceiptModal 
        open={!!selectedReceipt} 
        onClose={() => setSelectedReceipt(null)} 
        collection={selectedReceipt} 
      />
    </div>
  );
}
