import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Search } from 'lucide-react';
import { apiClient as api } from '@/shared/lib/api-client';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.append('action', actionFilter);
      if (entityTypeFilter) params.append('entityType', entityTypeFilter);
      if (page > 1) params.append('page', page.toString());

      const response = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(response.data.data);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityTypeFilter, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  const formatJson = (val: any) => {
    if (!val) return '-';
    if (typeof val === 'object') {
      return (
        <pre className="text-xs max-w-xs overflow-auto bg-muted/50 p-2 rounded">
          {JSON.stringify(val, null, 2)}
        </pre>
      );
    }
    return String(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-indigo-400" />
          Audit Logs
        </h1>
      </div>

      <div className="glass p-4 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by Action..."
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted/50 border border-border rounded-lg text-foreground placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by Entity Type..."
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted/50 border border-border rounded-lg text-foreground placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Date</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity Type</th>
                <th className="px-4 py-3">Old Value</th>
                <th className="px-4 py-3 rounded-tr-lg">New Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3 text-foreground/80 whitespace-nowrap">
                      {new Date(log.createdAt || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-foreground/80">
                      {log.actorStaff?.fullName || 'System'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.entityType}
                    </td>
                    <td className="px-4 py-3">
                      {formatJson(log.oldValue)}
                    </td>
                    <td className="px-4 py-3">
                      {formatJson(log.newValue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="flex justify-between items-center px-4 py-3 bg-muted/50 border-t border-border">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm bg-muted border border-border rounded disabled:opacity-50 text-foreground/80"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <button 
            onClick={() => setPage(p => p + 1)}
            disabled={logs.length < 20}
            className="px-3 py-1 text-sm bg-muted border border-border rounded disabled:opacity-50 text-foreground/80"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
