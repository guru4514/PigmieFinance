import React from 'react';
import { LoanStatus } from '../hooks/use-loans';

interface LoanStatusBadgeProps {
  status: LoanStatus;
}

export const LoanStatusBadge: React.FC<LoanStatusBadgeProps> = ({ status }) => {
  const statusStyles: Record<LoanStatus, string> = {
    pending_approval: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    approved: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    closed: 'bg-gray-500/10 text-muted-foreground border-gray-500/20',
    defaulted: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    written_off: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm ${statusStyles[status]}`}>
      {status}
    </span>
  );
};
