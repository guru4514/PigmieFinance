import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { toast } from 'sonner';

interface CollectionReversalDialogProps {
  collectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectionReversalDialog({
  collectionId,
  open,
  onOpenChange,
}: CollectionReversalDialogProps) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const reverseMutation = useMutation({
    mutationFn: async (data: { reason: string }) => {
      return apiClient.collections.reverseCollection(collectionId, data);
    },
    onSuccess: () => {
      toast.success('Collection reversed successfully');
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      onOpenChange(false);
      setReason('');
    },
    onError: (error: any) => {
      console.error('Failed to reverse collection', error);
      toast.error(error?.response?.data?.message || 'Failed to reverse collection');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.length < 10) {
      toast.error('Reason must be at least 10 characters long');
      return;
    }
    reverseMutation.mutate({ reason });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Reverse Collection</DialogTitle>
          <DialogDescription>
            Provide a reason for reversing this collection. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (min 10 characters)</Label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Entered wrong amount by mistake"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              required
              minLength={10}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={reverseMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={reverseMutation.isPending || reason.length < 10}>
              {reverseMutation.isPending && <LoadingSpinner className="mr-2 h-4 w-4" />}
              Confirm Reversal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
