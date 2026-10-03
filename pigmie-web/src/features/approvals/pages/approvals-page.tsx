import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { ApprovalCard } from '../components/approval-card';
import { useAuth } from '@/shared/hooks/use-auth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { useTranslation } from 'react-i18next';

export function ApprovalsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canReview = user?.userType === 'staff' && (user?.role === 'org_admin' || user?.role === 'branch_manager');

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', activeTab],
    queryFn: async () => {
      const res = await apiClient.get('/approvals', { params: { status: activeTab } });
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/approvals/${id}/approve`);
    },
    onSuccess: () => {
      toast.success('Action approved successfully');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to approve action');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      await apiClient.post(`/approvals/${id}/reject`, { reviewNote: note });
    },
    onSuccess: () => {
      toast.success('Action rejected successfully');
      setRejectingId(null);
      setReviewNote('');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to reject action');
    },
  });

  const handleApprove = (id: string) => {
    if (window.confirm('Are you sure you want to approve this action? It will execute immediately.')) {
      approveMutation.mutate(id);
    }
  };

  const handleReject = () => {
    if (!rejectingId) return;
    rejectMutation.mutate({ id: rejectingId, note: reviewNote });
  };

  const requests = data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground"> {t('approvals.title')} </h1>
        <p className="text-sm text-muted-foreground">Manage pending requests for sensitive actions</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="pending"> {t('approvals.pending')} </TabsTrigger>
          <TabsTrigger value="approved"> {t('approvals.approved')} </TabsTrigger>
          <TabsTrigger value="rejected"> {t('approvals.rejected')} </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground border rounded-lg border-dashed">
              No {activeTab} approvals found.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {requests.map((request: any) => (
                <ApprovalCard 
                  key={request.id} 
                  request={request}
                  canReview={canReview}
                  onApprove={handleApprove}
                  onReject={(id) => setRejectingId(id)}
                />
              ))}
            </div>
          )}
        </div>
      </Tabs>

      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Approval Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Note (Optional)</label>
              <Textarea 
                value={reviewNote} 
                onChange={(e) => setReviewNote(e.target.value)} 
                placeholder="Why is this request being rejected?" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
