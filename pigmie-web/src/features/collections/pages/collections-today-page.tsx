import React from 'react';
import { useCollectionsToday } from '../hooks/use-collections';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { MapPin, Phone, User, IndianRupee, ListX } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/ui/empty-state';

export function CollectionsTodayPage() {
  const { data: collectionsResponse, isLoading } = useCollectionsToday();
  const collections = collectionsResponse?.data || [];

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading route...</div>;
  }

  if (collections.length === 0) {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-6">Today's Route</h1>
        <EmptyState
          icon={ListX}
          title="No collections today"
          description="You don't have any collections assigned for today."
        />
      </div>
    );
  }

  const collectedCount = collections.filter((c: any) => c.status === 'collected').length;
  const totalCount = collections.length;
  const progressPercent = totalCount > 0 ? Math.round((collectedCount / totalCount) * 100) : 0;

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Today's Route</h1>
          <p className="text-muted-foreground mt-1">
            {collectedCount} of {totalCount} collected
          </p>
        </div>
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
          {progressPercent}%
        </div>
      </div>

      <div className="space-y-4">
        {collections.map((item: any) => (
          <Card key={item.id} className="glassmorphism bg-card/40 border-white/10 overflow-hidden hover:bg-card/60 transition-colors">
            <div className={`h-1 w-full ${item.status === 'collected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                    <User className="w-5 h-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{item.customerName}</h3>
                    <div className="flex items-center text-sm text-muted-foreground mt-1">
                      <Phone className="w-3 h-3 mr-1" /> {item.phone}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg flex items-center justify-end">
                    <IndianRupee className="w-4 h-4 mr-1" /> {item.amountDue}
                  </div>
                  <Badge 
                    variant={item.status === 'collected' ? 'default' : 'secondary'} 
                    className={`mt-1 ${item.status === 'collected' ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30' : ''}`}
                  >
                    {item.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mr-1 text-primary/70" />
                  {item.location}
                </div>
                
                {item.status !== 'collected' && (
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    Record
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
