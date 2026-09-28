import React from 'react';

interface Payment {
  id: string;
  dueDate: string;
  expectedAmount: number;
  principalAmount: number;
  interestAmount: number;
  status: 'pending' | 'paid' | 'overdue';
}

interface LoanScheduleTableProps {
  payments: Payment[];
}

export const LoanScheduleTable: React.FC<LoanScheduleTableProps> = ({ payments }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-muted backdrop-blur-md">
      <table className="w-full text-left text-sm text-foreground/80">
        <thead className="bg-muted text-xs uppercase text-muted-foreground border-b border-border">
          <tr>
            <th className="px-6 py-4 font-medium">Due Date</th>
            <th className="px-6 py-4 font-medium">Amount</th>
            <th className="px-6 py-4 font-medium">Principal</th>
            <th className="px-6 py-4 font-medium">Interest</th>
            <th className="px-6 py-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-muted transition-colors">
              <td className="px-6 py-4">{new Date(payment.dueDate).toLocaleDateString()}</td>
              <td className="px-6 py-4 font-medium">₹{((payment.expectedAmount) || 0).toLocaleString()}</td>
              <td className="px-6 py-4">₹{((payment.principalAmount) || 0).toLocaleString()}</td>
              <td className="px-6 py-4">₹{((payment.interestAmount) || 0).toLocaleString()}</td>
              <td className="px-6 py-4">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm ${
                  payment.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                  payment.status === 'overdue' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                  'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                }`}>
                  {payment.status.toUpperCase()}
                </span>
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                No payment schedule available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
