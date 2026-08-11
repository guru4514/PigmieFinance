import React from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';
import { MoreHorizontal, ArrowRight, ListX } from 'lucide-react';
import { EmptyState } from '@/shared/components/ui/empty-state';

export function DueTodayTable({ data = [] }: { data?: any[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Due Today</h3>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          View all <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
      
      <div className="rounded-md border border-white/10 overflow-hidden bg-card/30 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-card/50">
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8">
                  <EmptyState icon={ListX} title="No dues today" description="There are no collections due today." />
                </TableCell>
              </TableRow>
            ) : (
            data.map((item) => (
              <TableRow key={item.id} className="border-white/5 hover:bg-white/5 transition-colors">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 bg-primary/20 text-primary border border-primary/20">
                      <AvatarFallback className="text-xs">
                        {item.customer.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span>{item.customer}</span>
                      <span className="text-xs text-muted-foreground">{item.loanId}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>₹{item.amount}</TableCell>
                <TableCell>
                  <div className="text-sm">{item.agent}</div>
                  <div className="text-xs text-muted-foreground">{item.time}</div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={
                      item.status === 'collected' ? 'border-emerald-500/50 text-emerald-500 bg-emerald-500/10' :
                      item.status === 'overdue' ? 'border-red-500/50 text-red-500 bg-red-500/10' :
                      'border-amber-500/50 text-amber-500 bg-amber-500/10'
                    }
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10 text-muted-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
