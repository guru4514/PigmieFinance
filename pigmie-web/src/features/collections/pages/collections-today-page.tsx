import React, { useState, useMemo } from 'react';
import { processSyncQueue, type CollectionInput } from '@/shared/lib/offline-queue';
import { usePendingCollections } from '@/shared/hooks/use-pending-collections';
import { readCollectionPhoto } from '@/shared/lib/collection-photo';
import { useQueryClient } from '@tanstack/react-query';
import { useCollectionsToday, useRecordCollection } from '../hooks/use-collections';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { MapPin, Phone, User, IndianRupee, ListX, MessageCircle, Check, Search, Calendar, ChevronDown, ChevronUp, Camera } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { useAuth } from '@/shared/hooks/use-auth';
import { openWhatsApp, generateReminderMessage } from '@/shared/lib/whatsapp';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ReceiptModal, ReceiptCollection } from '@/features/collections/components/receipt-modal';

const PresetAmountChip = ({ amount, selected, onClick }: { amount: number, selected: boolean, onClick: () => void }) => (
  <Badge 
    variant="outline" 
    className={`cursor-pointer px-3 py-1.5 text-sm ${selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
    onClick={onClick}
  >
    ₹{amount}
  </Badge>
);

const CollectionCard = ({ item, isAccountant, pendingAmount, queueUnavailable }: { item: any, isAccountant: boolean, pendingAmount: number, queueUnavailable: boolean }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [customAmount, setCustomAmount] = useState<number | ''>(item.amountDue);
  const { mutateAsync: recordCollection, isPending } = useRecordCollection(item.loanId || item.id);
  const isCollected = item.status === 'collected';
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const submitting = React.useRef(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptCollection | null>(null);

  const handleCollect = async () => {
    if (submitting.current || pendingAmount > 0 || queueUnavailable) return;
    if (!customAmount || customAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    submitting.current = true;
    setIsUploading(true);
    try {
      const payload: CollectionInput = {
        clientGeneratedId: crypto.randomUUID(),
        loanId: item.loanId || item.id,
        amount: Number(customAmount),
        collectionDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        collectedAt: new Date().toISOString(),
        collectionMethod: 'cash',
        ...(photoFile ? { offlinePhotoBase64: await readCollectionPhoto(photoFile) } : {}),
      };
      if (navigator.geolocation) {
        const location = await new Promise<GeolocationPosition | null>(resolve => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 5000, enableHighAccuracy: false });
        });
        if (location) {
          payload.latitude = location.coords.latitude;
          payload.longitude = location.coords.longitude;
        } else toast.warning('Location unavailable. Saving without GPS coordinates.');
      }
      const result = await recordCollection(payload);
      setExpanded(false);
      if (result.status === 'pending') {
        toast.info('Saved on this device. Pending sync — do not record this payment again.');
        return;
      }
      const recorded = result.acknowledgement.collection;
      toast.success(`Collected ₹${recorded.amount} from ${item.customerName}`);
      setReceiptData({
        id: recorded.id,
        receiptNumber: recorded.receiptNumber ?? undefined,
        amount: recorded.amount,
        collectionDate: recorded.collectionDate,
        collectionMethod: recorded.collectionMethod,
        customerName: item.customerName,
        customerPhone: item.phone,
        loanId: recorded.loanId,
      });
      setShowReceipt(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not save the collection. Please retry.');
    } finally {
      submitting.current = false;
      setIsUploading(false);
    }
  };
  const presetAmounts = [item.amountDue, 100, 200, 500, 1000].filter((v, i, a) => a.indexOf(v) === i && v > 0).sort((a, b) => a - b);

  return (
    <Card className={`glassmorphism transition-all overflow-hidden ${isCollected ? 'bg-card/20 opacity-75' : 'bg-card/40 hover:bg-card/60'}`}>
      <div className={`h-1 w-full ${isCollected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <CardContent className="p-4 sm:p-5">
        {pendingAmount > 0 && <p role="status" className="mb-3 text-sm text-amber-600 dark:text-amber-400">₹{pendingAmount} saved on this device, pending sync. Do not collect this payment again.</p>}
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
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPhotoFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setPhotoPreview(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <Button 
                variant="outline"
                className={`h-11 w-11 p-0 shrink-0 ${photoPreview ? 'border-primary text-primary bg-primary/10' : ''}`}
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                <Camera className="w-5 h-5" />
              </Button>
              <Button 
                className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-foreground font-semibold shadow-sm"
                onClick={(e) => { e.stopPropagation(); handleCollect(); }}
                disabled={isPending || isUploading || !customAmount || pendingAmount > 0 || queueUnavailable}
              >
                {isPending || isUploading ? t('collection.saving') : t('collection.collect')}
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
      <ReceiptModal 
        open={showReceipt} 
        onClose={() => setShowReceipt(false)} 
        collection={receiptData} 
      />
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
  const { owner, pendingCollections, legacyCount, queueError, queueLoading } = usePendingCollections();
  const pendingCount = pendingCollections.length;
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();
  
  // The API returns an array directly, not a paginated { data: [] } object
  const collectionsRaw = useMemo(() => Array.isArray(collectionsResponse) ? collectionsResponse : collectionsResponse?.data || [], [collectionsResponse]);
  
  const collections = useMemo(() => {
    return collectionsRaw.map((loan: any) => {
      return {
        id: loan.loanId,
        loanId: loan.loanId,
        customerName: loan.customer?.fullName,
        phone: loan.customer?.phone,
        location: loan.customer?.address || 'N/A',
        // Today's expected installment only
        todayExpected: loan.todayExpected || 0,
        // Overdue from past days
        overdueAmount: loan.overdueAmount || 0,
        // Total remaining (today + overdue) — shown on the card
        amountDue: loan.totalRemaining || 0,
        // Amount actually collected TODAY
        collectedToday: loan.collectedToday || 0,
        // Whether agent visited (collected anything) today
        visitedToday: loan.visitedToday || false,
        // Mark as collected if nothing remaining for today
        status: (loan.totalRemaining || 0) <= 0 ? 'collected' : 'pending',
        daysOverdue: loan.overdueAmount > 0 ? 1 : 0,
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

  // Stats — all based on TODAY's data only
  const totalCount = collections.length;
  // "Due" = today's expected installments only (not overdue from past)
  const totalDueToday = collections.reduce((sum: number, c: any) => sum + (c.todayExpected || 0), 0);
  // "Collected" = amount actually collected today
  const collectedAmount = collections.reduce((sum: number, c: any) => sum + (c.collectedToday || 0), 0);
  // "Visited" = customers where agent collected today
  const visitedCount = collections.filter((c: any) => c.visitedToday).length;
  // "Left" = customers NOT visited today
  const leftCount = totalCount - visitedCount;
  // Progress = collected today / today's expected
  const progressPercent = totalDueToday > 0 ? Math.round((collectedAmount / totalDueToday) * 100) : 0;

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
            <Button size="sm" variant="outline" disabled={isSyncing || !owner} onClick={async () => {
              if (!owner) return;
              setIsSyncing(true);
              try {
                const result = await processSyncQueue(owner);
                if (result.synced > 0) {
                  await queryClient.invalidateQueries({ queryKey: ['collections'] });
                  await queryClient.invalidateQueries({ queryKey: ['loans'] });
                  await queryClient.invalidateQueries({ queryKey: ['reports'] });
                  toast.success(`Synced ${result.synced} collection(s)`);
                } else toast.info('No collections synced. Saved entries remain on this device; check the messages below.');
              } catch (error: unknown) {
                toast.error(error instanceof Error ? error.message : 'Sync failed. Your saved collections remain on this device.');
              } finally { setIsSyncing(false); }
            }}>Sync Now</Button>
          </div>
        )}
        {queueError && <p role="alert" className="text-sm text-destructive">{queueError}</p>}
        {legacyCount > 0 && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">Older saved collections need account verification before they can sync. Contact your administrator and do not clear this device’s browser data.</p>}
        {pendingCollections.filter(entry => entry.lastError).map(entry => (
          <p key={entry.clientGeneratedId} role="alert" className="text-sm text-amber-600 dark:text-amber-400">Saved collection {entry.clientGeneratedId.slice(0, 8)}: {entry.lastError}</p>
        ))}

        {/* Stats Grid — Option C */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3 text-center">
              <IndianRupee className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.due')}</p>
              <p className="text-sm font-bold text-foreground">₹{Math.round(totalDueToday).toLocaleString('en-IN')}</p>
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
              <p className="text-sm font-bold text-foreground">{visitedCount}/{totalCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3 text-center">
              <ListX className="w-5 h-5 mx-auto mb-1 text-amber-500" />
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.left')}</p>
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{leftCount}</p>
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
            <CollectionCard key={item.id} item={item} isAccountant={isAccountant} pendingAmount={pendingCollections.filter(entry => entry.loanId === item.loanId).reduce((sum, entry) => sum + entry.amount, 0)} queueUnavailable={!!queueError || queueLoading} />
          ))}
        </div>
      )}
    </div>
  );
}
