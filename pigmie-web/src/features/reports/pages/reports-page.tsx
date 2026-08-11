import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Download, AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { usePortfolioAtRisk, useCollectionEfficiency, useAgentPerformance, useExportReport } from '../hooks/use-reports';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/shared/components/ui/table';

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'par' | 'collections' | 'agents'>('par');
  
  const exportReport = useExportReport();
  
  const parQuery = usePortfolioAtRisk();
  const collectionsQuery = useCollectionEfficiency();
  const agentsQuery = useAgentPerformance();

  const handleExport = () => {
    exportReport.mutate(activeTab);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Monitor the health and efficiency of your micro-finance operations.
          </p>
        </div>
        <Button 
          onClick={handleExport} 
          disabled={exportReport.isPending}
          className="bg-primary hover:bg-primary/90 gap-2"
        >
          <Download className="w-4 h-4" />
          {exportReport.isPending ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('par')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'par' ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Portfolio At Risk
        </button>
        <button
          onClick={() => setActiveTab('collections')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'collections' ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Collection Efficiency
        </button>
        <button
          onClick={() => setActiveTab('agents')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'agents' ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <Users className="w-4 h-4" /> Agent Performance
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'par' && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Portfolio At Risk (PAR)</CardTitle>
            </CardHeader>
            <CardContent>
              {parQuery.isLoading ? (
                <div className="p-12 flex justify-center"><LoadingSpinner className="w-8 h-8 text-primary" /></div>
              ) : (
                <div className="rounded-md border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-white/5">
                      <TableRow className="border-white/10">
                        <TableHead>Loan ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Outstanding Balance</TableHead>
                        <TableHead>Days Overdue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parQuery.data?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center p-8 text-zinc-500">No overdue loans found.</TableCell>
                        </TableRow>
                      ) : (
                        parQuery.data?.map((item: any) => (
                          <TableRow key={item.loanId} className="border-white/10">
                            <TableCell className="font-medium text-white">{item.loanId.slice(0, 8)}</TableCell>
                            <TableCell>{item.customerName}</TableCell>
                            <TableCell>₹{item.principalAmount.toLocaleString()}</TableCell>
                            <TableCell className="text-rose-400 font-medium">₹{item.outstandingBalance.toLocaleString()}</TableCell>
                            <TableCell>{item.daysOverdue}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'collections' && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Collection Efficiency</CardTitle>
            </CardHeader>
            <CardContent>
              {collectionsQuery.isLoading ? (
                <div className="p-12 flex justify-center"><LoadingSpinner className="w-8 h-8 text-primary" /></div>
              ) : (
                <div className="rounded-md border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-white/5">
                      <TableRow className="border-white/10">
                        <TableHead>Date</TableHead>
                        <TableHead>Expected Collections</TableHead>
                        <TableHead>Actual Collections</TableHead>
                        <TableHead>Efficiency %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collectionsQuery.data?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center p-8 text-zinc-500">No collection data available.</TableCell>
                        </TableRow>
                      ) : (
                        collectionsQuery.data?.map((item: any, i: number) => (
                          <TableRow key={i} className="border-white/10">
                            <TableCell className="font-medium text-white">{item.date}</TableCell>
                            <TableCell>₹{item.expected.toLocaleString()}</TableCell>
                            <TableCell className="text-emerald-400">₹{item.actual.toLocaleString()}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${item.efficiency >= 90 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                {item.efficiency.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'agents' && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Agent Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {agentsQuery.isLoading ? (
                <div className="p-12 flex justify-center"><LoadingSpinner className="w-8 h-8 text-primary" /></div>
              ) : (
                <div className="rounded-md border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-white/5">
                      <TableRow className="border-white/10">
                        <TableHead>Agent Name</TableHead>
                        <TableHead>Total Collections</TableHead>
                        <TableHead>Amount Collected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentsQuery.data?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center p-8 text-zinc-500">No agent performance data available.</TableCell>
                        </TableRow>
                      ) : (
                        agentsQuery.data?.map((item: any) => (
                          <TableRow key={item.agentId} className="border-white/10">
                            <TableCell className="font-medium text-white">{item.agentName}</TableCell>
                            <TableCell>{item.totalCollections}</TableCell>
                            <TableCell className="text-indigo-400 font-medium">₹{item.amountCollected.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
