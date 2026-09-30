import { useState, useMemo, useEffect } from 'react';
import { queueCollection, getPendingCount, processSyncQueue } from '@/shared/lib/offline-queue';
import { useCollectionsToday, useRecordCollection } from '../hooks/use-collections';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { MapPin, Phone, User, IndianRupee, ListX, MessageCircle, Check, Search, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { useAuth } from '@/shared/hooks/use-auth';
import { openWhatsApp, generateReminderMessage } from '@/shared/lib/whatsapp';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const PresetAmountChip = ({ amount, selected, onClick }: { amount: number, selected: boolean, onClick: () => void }) => (
  <Badge 
    variant="outline" 
    className={`cursor-pointer px-3 py-1.5 text-sm ${selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
    onClick={onClick}
  >
    ₹{amount}
  </Badge>
);

const CollectionCard = ({ item, isAccountant }: { item: any, isAccountant: boolean }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [customAmount, setCustomAmount] = useState<number | ''>(item.amountDue);
  const { mutate: recordCollection, isPending } = useRecordCollection(item.loanId || item.id);
  const isCollected = item.status === 'collected';

  const handleCollect = async () => {
    if (!customAmount || customAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const payload = {
      clientGeneratedId: crypto.randomUUID(),
      loanId: item.loanId || item.id,
      amount: Number(customAmount),
      collectionDate: new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      collectionMethod: 'cash'
    };

    if (!navigator.onLine) {
      await queueCollection(payload);
      toast.success('Saved offline — will sync when back online');
      setExpanded(false);
      return;
    }

    recordCollection(payload, {
      onSuccess: () => {
        toast.success(`Collected ₹${customAmount} from ${item.customerName}`);
        setExpanded(false);
      },
      onError: (err: any) => {
        console.error('Collection error:', err?.response?.data);
        const msg = Array.isArray(err?.response?.data?.message) 
          ? err.response.data.message.join(', ') 
          : err?.response?.data?.message || 'Failed to record collection';
        toast.error(msg);
      }
    });
  };

  const presetAmounts = [item.amountDue, 100, 200, 500, 1000].filter((v, i, a) => a.indexOf(v) === i && v > 0).sort((a, b) => a - b);

  return (
    <Card className={`glassmorphism transition-all overflow-hidden ${isCollected ? 'bg-card/20 opacity-75' : 'bg-card/40 hover:bg-card/60'}`}>
      <div className={`h-1 w-full ${isCollected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <CardContent className="p-4 sm:p-5">
        {/* Header Section */}
        <div 
          className={`flex justify-between items-start ${!isCollected && !isAccountant ? 'cursor-pointer' : ''}`} 
          onClick={() => !isCollected && !isAccountant && setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCollected ? 'bg-emerald-500/20 text-emerald-500' : 'bg-secondary text-secondary-foreground'}`}>
              {isCollected ? <Check className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-lg line-clamp-1">{item.customerName}</h3>
              <div className="flex items-center text-sm text-muted-foreground mt-0.5">
                <Phone className="w-3 h-3 mr-1" /> {item.phone}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold text-lg flex items-center justify-end">
              <IndianRupee className="w-4 h-4 mr-1" /> {item.amountDue}
            </div>
            {isCollected ? (
              <Badge className="mt-1 bg-emerald-500/20 text-emerald-500 border-none">{t('collection.collectedCaps')}</Badge>
            ) : (
              <div className="flex items-center justify-end mt-1 text-muted-foreground">
                <span className="text-xs mr-1">{t('collection.due')}</span>
                {!isAccountant && (expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
              </div>
            )}
          </div>
        </div>
        
        {/* Expanded Collection Action Section */}
        {expanded && !isCollected && !isAccountant && (
          <div className="mt-4 pt-4 border-t border-border/50 animate-in slide-in-from-top-2">
            <div className="mb-3">
              <p className="text-sm font-medium mb-2 text-muted-foreground">{t('collection.selectAmount')}</p>
              <div className="flex flex-wrap gap-2">
                {presetAmounts.map((amt) => (
                  <PresetAmountChip 
                    key={amt} 
                    amount={amt} 
                    selected={customAmount === amt}
                    onClick={() => setCustomAmount(amt)}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex items-end gap-3 mt-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block text-muted-foreground">{t('collection.customAmount')}</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <IndianRupee className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input 
                    type="number" 
                    value={customAmount} 
                    onChange={(e) => setCustomAmount(e.target.value ? Number(e.target.value) : '')}
                    className="pl-9 h-11 text-lg font-semibold bg-background/50"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <Button 
                className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-foreground font-semibold shadow-sm"
                onClick={(e) => { e.stopPropagation(); handleCollect(); }}
                disabled={isPending || !customAmount}
              >
                {isPending ? t('collection.saving') : t('collection.collect')}
              </Button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center text-sm text-muted-foreground max-w-[60%]">
            <MapPin className="w-4 h-4 mr-1 text-primary/70 shrink-0" />
            <span className="truncate">{item.location}</span>
          </div>
          
          {!isCollected && (
            <Button 
              size="sm" 
              variant="ghost"
              disabled={!item.phone}
              title={!item.phone ? 'No phone number available' : undefined}
              className="h-8 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={(e) => {
                e.stopPropagation();
                if (!item.phone) return;
                const msg = generateReminderMessage({
                  customerName: item.customerName,
                  dueAmount: item.amountDue,
                  dueDate: new Date().toLocaleDateString(),
                  daysOverdue: item.daysOverdue || 0,
                });
                openWhatsApp(item.phone, msg);
              }}
            >
              <MessageCircle className="w-4 h-4 mr-1.5" />
              {t('collection.whatsapp')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export function CollectionsTodayPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAccountant = user?.userType === 'staff' && user.role === 'accountant';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: collectionsResponse, isLoading } = useCollectionsToday(selectedDate);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPendingCount().then(setPendingCount);
  }, []);
  
  // The API returns an array directly, not a paginated { data: [] } object
  const collectionsRaw = Array.isArray(collectionsResponse) ? collectionsResponse : collectionsResponse?.data || [];
  
  const collections = useMemo(() => {
    return collectionsRaw.map((loan: any) => {
      const amountDue = loan.dueItems?.reduce((acc: number, item: any) => acc + Number(item.remaining), 0) || 0;
      const totalPaid = loan.dueItems?.reduce((acc: number, item: any) => acc + Number(item.paidAmount || 0), 0) || 0;
      return {
        id: loan.loanId,
        loanId: loan.loanId,
        customerName: loan.customer?.fullName,
        phone: loan.customer?.phone,
        location: loan.customer?.address || 'N/A',
        amountDue: Math.round(amountDue * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        status: amountDue <= 0 ? 'collected' : 'pending',
        daysOverdue: 0,
      };
    });
  }, [collectionsRaw]);

  const filteredCollections = useMemo(() => {
    if (!searchQuery) return collections;
    const lowerQuery = searchQuery.toLowerCase();
    return collections.filter((c: any) => 
      c.customerName?.toLowerCase().includes(lowerQuery) || 
      c.phone?.includes(lowerQuery)
    );
  }, [collections, searchQuery]);

  // Sort: pending first, collected at bottom
  const sortedCollections = useMemo(() => {
    return [...filteredCollections].sort((a, b) => {
      if (a.status === 'collected' && b.status !== 'collected') return 1;
      if (a.status !== 'collected' && b.status === 'collected') return -1;
      return 0;
    });
  }, [filteredCollections]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        {t('collection.loadingRoute')}
      </div>
    );
  }

  // "Visited" = customers where ANY payment made (partial counts), not just fully paid
  const collectedCount = collections.filter((c: any) => c.totalPaid > 0).length;
  const totalCount = collections.length;
  // "Due" = total remaining to collect (amountDue only, NOT + totalPaid)
  const totalDue = collections.reduce((sum: number, c: any) => sum + (c.amountDue || 0), 0);
  // "Collected" = totalPaid on these schedule items (matches what agents collected against these dues)
  const collectedAmount = collections.reduce((sum: number, c: any) => sum + (c.totalPaid || 0), 0);
  const remainingCount = totalCount - collectedCount;
  // Progress = collected / (due + collected) to show % of original target achieved
  const totalTarget = totalDue + collectedAmount;
  const progressPercent = totalTarget > 0 ? Math.round((collectedAmount / totalTarget) * 100) : 0;

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const dateLabel = isToday ? 'Today' : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="container mx-auto p-4 max-w-2xl pb-24">
      {/* Header and Summary */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center">
            {t('collection.title')}
          </h1>
          <div className="flex items-center relative max-w-xs">
            <Calendar className="absolute left-3 w-4 h-4 text-muted-foreground" />
            <Input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 h-10 w-full sm:w-[160px] bg-card/50"
            />
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-amber-600 dark:text-amber-400">
              {pendingCount} collection(s) pending sync
            </span>
            <Button size="sm" variant="outline" onClick={async () => {
              const synced = await processSyncQueue();
              setPendingCount(prev => prev - synced);
              toast.success(`Synced ${synced} collection(s)`);
            }}>Sync Now</Button>
          </div>
        )}

        {/* Stats Grid — Option C */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3 text-center">
              <IndianRupee className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.due')}</p>
              <p className="text-sm font-bold text-foreground">₹{Math.round(totalDue).toLocaleString('en-IN')}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3 text-center">
              <Check className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.collectedCaps')}</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{Math.round(collectedAmount).toLocaleString('en-IN')}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3 text-center">
              <User className="w-5 h-5 mx-auto mb-1 text-violet-500" />
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.visited')}</p>
              <p className="text-sm font-bold text-foreground">{collectedCount}/{totalCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3 text-center">
              <ListX className="w-5 h-5 mx-auto mb-1 text-amber-500" />
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.left')}</p>
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{remainingCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Progress Bar */}
        <div className="px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">{dateLabel}'s {t('collection.progress')}</span>
            <span className="text-xs font-semibold text-primary">{progressPercent}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div 
              className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            type="text" 
            placeholder={t('collection.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base rounded-full bg-card/50 backdrop-blur-sm border-border shadow-sm"
          />
        </div>
      </div>

      {/* Collections List */}
      {collections.length === 0 ? (
        <EmptyState
          icon={ListX}
          title={t('collection.noCollections')}
          description={t('collection.noCollectionsDesc')}
        />
      ) : sortedCollections.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card/20 rounded-lg border border-border">
          {t('collection.noCustomersFound', { query: searchQuery })}
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCollections.map((item: any) => (
            <CollectionCard key={item.id} item={item} isAccountant={isAccountant} />
          ))}
        </div>
      )}
    </div>
  );
}
