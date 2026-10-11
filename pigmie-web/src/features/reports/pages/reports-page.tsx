import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Download } from 'lucide-react';
import { usePortfolioAtRisk, useCollectionEfficiency, useAgentPerformance, useExportReport } from '../hooks/use-reports';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/shared/components/ui/table';
import { useAuth } from '@/shared/hooks/use-auth';

const currency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const tabs = [{ id: 'par', label: 'Portfolio at Risk' }, { id: 'collections', label: 'Collection Efficiency' }, { id: 'agents', label: 'Agent Performance' }] as const;

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'par' | 'collections' | 'agents'>('par');
  const { user } = useAuth();
  const isAdmin = user?.userType === 'staff' && user.role === 'org_admin';
  const exportReport = useExportReport();
  const risk = usePortfolioAtRisk();
  const collections = useCollectionEfficiency();
  const agents = useAgentPerformance();
  const selected = activeTab === 'par' ? risk : activeTab === 'collections' ? collections : agents;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1><p className="text-muted-foreground mt-2">Monitor your portfolio and collection performance.</p></div>
        {isAdmin && <div className="flex gap-2">
          <Link to="/app/reports/branch-comparison"><Button variant="outline">Branch Comparison</Button></Link>
          <Button onClick={() => exportReport.mutate(activeTab)} disabled={exportReport.isPending} className="gap-2"><Download className="w-4 h-4" />{exportReport.isPending ? 'Exporting…' : 'Export CSV'}</Button>
        </div>}
      </div>
      <div className="flex flex-wrap border-b border-border">
        {tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{tab.label}</button>)}
      </div>
      <Card>
        <CardHeader><CardTitle>{tabs.find((tab) => tab.id === activeTab)?.label}</CardTitle></CardHeader>
        <CardContent>
          {selected.fetchStatus === 'paused' ? <p role="status">This report needs an internet connection. Reconnect to load current figures.</p> : selected.isPending ? <div className="p-12 flex justify-center"><LoadingSpinner /></div> : selected.isError ? <div role="alert" className="space-y-3"><p>Could not load this report.</p><Button variant="outline" onClick={() => { void selected.refetch(); }}>Retry</Button></div> : (
            <div className="rounded-md border overflow-hidden">
              {activeTab === 'par' && risk.data && <>
                <p className="p-4 text-sm text-muted-foreground">Share of the active outstanding portfolio with an unpaid installment more than the stated number of days overdue.</p>
                <Table><TableHeader><TableRow><TableHead>Days overdue</TableHead><TableHead>Portfolio at risk</TableHead></TableRow></TableHeader><TableBody>
                  {([['More than 1 day', risk.data.par_1], ['More than 30 days', risk.data.par_30], ['More than 90 days', risk.data.par_90]] as const).map(([label, value]) => <TableRow key={label}><TableCell>{label}</TableCell><TableCell>{(value * 100).toFixed(2)}%</TableCell></TableRow>)}
                </TableBody></Table>
              </>}
              {activeTab === 'collections' && <>
                <p className="p-4 text-sm text-muted-foreground">Scheduled amounts and payments against installments due on active loans, grouped by assigned agent.</p>
                <Table><TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Scheduled amount</TableHead><TableHead>Paid amount</TableHead><TableHead>Efficiency</TableHead></TableRow></TableHeader><TableBody>
                  {collections.data?.map((row) => <TableRow key={row.agentId}><TableCell>{row.agentName}</TableCell><TableCell>{currency(row.expected)}</TableCell><TableCell>{currency(row.actual)}</TableCell><TableCell>{row.efficiency.toFixed(2)}%</TableCell></TableRow>)}
                  {collections.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-8 text-muted-foreground">No collection data available.</TableCell></TableRow>}
                </TableBody></Table>
              </>}
              {activeTab === 'agents' && <Table><TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Collections recorded</TableHead><TableHead>Amount collected</TableHead><TableHead>Customers assigned</TableHead></TableRow></TableHeader><TableBody>
                {agents.data?.map((row) => <TableRow key={row.agentId}><TableCell>{row.agentName}</TableCell><TableCell>{row.totalCollections}</TableCell><TableCell>{currency(row.amountCollected)}</TableCell><TableCell>{row.customersAssigned}</TableCell></TableRow>)}
                {agents.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-8 text-muted-foreground">No agent performance data available.</TableCell></TableRow>}
              </TableBody></Table>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
