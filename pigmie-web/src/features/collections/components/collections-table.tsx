import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { MoreHorizontal, Undo } from 'lucide-react';
import { useAuth } from '@/shared/hooks/use-auth';
import { CollectionReversalDialog } from './collection-reversal-dialog';

export interface Collection {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'collected' | 'REVERSED' | string;
  collectedAt?: string;
  createdAt?: string;
}

interface CollectionsTableProps {
  collections: Collection[];
}

export function CollectionsTable({ collections }: CollectionsTableProps) {
  const { user } = useAuth();
  const [reversalCollectionId, setReversalCollectionId] = useState<string | null>(null);

  const canReverse = user?.role === 'org_admin' || user?.role === 'branch_manager';

  const isCompleted = (status: string) => {
    return status.toLowerCase() === 'completed' || status.toLowerCase() === 'collected';
  };

  return (
    <>
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID / Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {collections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  No collections found.
                </TableCell>
              </TableRow>
            ) : (
              collections.map((collection) => (
                <TableRow key={collection.id}>
                  <TableCell>
                    <div className="font-medium">{collection.customerName}</div>
                    <div className="text-xs text-muted-foreground">{collection.id.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell>₹{collection.amount.toLocaleString()}</TableCell>
                  <TableCell>
                    {collection.collectedAt || collection.createdAt
                      ? new Date(collection.collectedAt || collection.createdAt!).toLocaleDateString()
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isCompleted(collection.status) ? 'default' : 'secondary'}
                      className={
                        isCompleted(collection.status)
                          ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'
                          : ''
                      }
                    >
                      {collection.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {canReverse && isCompleted(collection.status) && (
                          <DropdownMenuItem
                            onClick={() => setReversalCollectionId(collection.id)}
                            className="text-destructive focus:text-destructive cursor-pointer"
                          >
                            <Undo className="mr-2 h-4 w-4" />
                            Reverse Collection
                          </DropdownMenuItem>
                        )}
                        {!canReverse && isCompleted(collection.status) && (
                          <DropdownMenuItem disabled>
                            No actions available
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CollectionReversalDialog
        collectionId={reversalCollectionId || ''}
        open={!!reversalCollectionId}
        onOpenChange={(open) => !open && setReversalCollectionId(null)}
      />
    </>
  );
}
