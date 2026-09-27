import { format } from 'date-fns';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';

interface ApprovalRequest {
  id: string;
  actionType: string;
  status: string;
  reason: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  submittedBy?: { fullName: string };
  reviewedBy?: { fullName: string };
  reviewNote?: string;
}

interface ApprovalCardProps {
  request: ApprovalRequest;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  canReview?: boolean;
}

export function ApprovalCard({ request, onApprove, onReject, canReview }: ApprovalCardProps) {
  const getActionName = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">{getActionName(request.actionType)}</CardTitle>
          <Badge className={getStatusColor(request.status)} variant="outline">
            {request.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Entity Type:</span>
          <span className="font-medium capitalize">{request.entityType}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Submitted By:</span>
          <span className="font-medium">{request.submittedBy?.fullName || 'System'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date:</span>
          <span>{format(new Date(request.createdAt), 'PP p')}</span>
        </div>
        {request.reason && (
          <div>
            <span className="text-muted-foreground block mb-1">Reason:</span>
            <p className="bg-muted p-2 rounded-md text-xs">{request.reason}</p>
          </div>
        )}
        {request.status !== 'pending' && request.reviewedBy && (
          <div className="flex justify-between mt-2 pt-2 border-t">
            <span className="text-muted-foreground">Reviewed By:</span>
            <span>{request.reviewedBy.fullName}</span>
          </div>
        )}
        {request.status === 'rejected' && request.reviewNote && (
          <div>
            <span className="text-muted-foreground block mb-1">Rejection Note:</span>
            <p className="bg-red-50 p-2 rounded-md text-xs text-red-800">{request.reviewNote}</p>
          </div>
        )}
      </CardContent>
      {request.status === 'pending' && canReview && (
        <CardFooter className="flex gap-2 pt-0">
          <Button 
            className="w-full bg-green-600 hover:bg-green-700 text-white" 
            onClick={() => onApprove?.(request.id)}
          >
            Approve
          </Button>
          <Button 
            variant="destructive" 
            className="w-full"
            onClick={() => onReject?.(request.id)}
          >
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
