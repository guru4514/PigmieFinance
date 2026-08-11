import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { MapPin, Camera, AlertCircle } from 'lucide-react';

const collectionSchema = z.object({
  amount: z.number().positive('Amount must be greater than zero'),
  collectionMethod: z.enum(['cash', 'cheque', 'other']),
  notes: z.string().optional(),
});

type RecordCollectionInput = z.infer<typeof collectionSchema>;

import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '@/shared/lib/api-client';
import { toast } from 'sonner';

// Mocking these for now until Phase 2 (Offline mode)
const queueCollection = async (data: any) => { console.log('Queued offline', data); };
const tryGetGeolocation = async () => ({ latitude: 0, longitude: 0 });
const useOnlineStatus = () => ({ isOnline: navigator.onLine });

export function RecordCollectionPage() {
  const { loanId } = useParams<{ loanId: string }>();
  const navigate = useNavigate();
  
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<RecordCollectionInput>({
    resolver: zodResolver(collectionSchema),
    defaultValues: { amount: 0, collectionMethod: 'cash' },
  });
  
  const { isOnline } = useOnlineStatus();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const onSubmit = handleSubmit(async (data) => {
    if (!loanId) return;
    setStatus('idle');
    const collection = {
      loanId,
      amount: data.amount,
      collectionMethod: data.collectionMethod,
      notes: data.notes,
      ...(await tryGetGeolocation()),
    };
    
    if (isOnline) {
      try { 
        await apiClient.post('/collections', collection); 
        setStatus('success');
        toast.success('Collection recorded successfully');
        setTimeout(() => navigate(`/app/loans/${loanId}`), 1500);
      }
      catch (error: any) { 
        toast.error(error?.response?.data?.message || 'Failed to record collection');
        setStatus('error');
      } 
    } else {
      await queueCollection(collection);
      setStatus('success');
      toast.success('Collection queued for offline sync');
      setTimeout(() => navigate(`/app/loans/${loanId}`), 1500);
    }
  });

  return (
    <div className="container mx-auto p-4 max-w-md">
      <Card className="glassmorphism bg-card/50 backdrop-blur-md border-white/10 dark:text-white">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center justify-between">
            Record Collection
            {!isOnline && (
              <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded-full flex items-center gap-1">
                <AlertCircle size={14} /> Offline Mode
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input 
                id="amount" 
                type="number" 
                step="0.01"
                {...register('amount', { valueAsNumber: true })} 
                className="text-lg bg-background/50 border-white/10 focus:border-primary/50"
              />
              {errors.amount && (
                <p className="text-destructive text-sm">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="collectionMethod">Method</Label>
              <Select 
                defaultValue="cash" 
                onValueChange={(val: any) => setValue('collectionMethod', val)}
              >
                <SelectTrigger className="bg-background/50 border-white/10">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.collectionMethod && (
                <p className="text-destructive text-sm">{errors.collectionMethod.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input 
                id="notes" 
                {...register('notes')} 
                placeholder="Any additional details..."
                className="bg-background/50 border-white/10"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1 bg-background/30 border-white/10 hover:bg-white/10">
                <Camera className="w-4 h-4 mr-2" />
                Photo
              </Button>
              <Button type="button" variant="outline" className="flex-1 bg-background/30 border-white/10 hover:bg-white/10">
                <MapPin className="w-4 h-4 mr-2" />
                Location
              </Button>
            </div>

            <Button type="submit" className="w-full font-semibold" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Record Collection'}
            </Button>

            {status === 'success' && (
              <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-md text-sm text-center">
                Collection recorded successfully. {isOnline ? '' : 'Will sync when online.'}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
