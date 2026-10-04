
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { useCreateLoanProduct } from '../hooks/use-loan-products';
import { useTranslation } from 'react-i18next';

const productSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  interestType: z.enum(['flat', 'reducing_balance']),
  interestRateAnnual: z.number().min(0, 'Interest rate must be positive'),
  collectionFrequency: z.enum(['daily', 'weekly', 'monthly']),
  minAmount: z.number().min(0),
  maxAmount: z.number().min(1),
  minTenure: z.number().min(1),
  maxTenure: z.number().min(1),
  processingFee: z.number().min(0).optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

export const NewLoanProductPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createProduct = useCreateLoanProduct();
  
  const { register, handleSubmit, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      interestType: 'flat',
      interestRateAnnual: 12,
      collectionFrequency: 'daily',
      minAmount: 1000,
      maxAmount: 50000,
      minTenure: 30,
      maxTenure: 100,
      processingFee: 1
    }
  });

  const onSubmit = async (data: ProductFormValues) => {
    try {
      await createProduct.mutateAsync(data);
      navigate('/app/loan-products');
    } catch (error) {
      console.error('Failed to create product:', error);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-4">
        <Link to="/app/loan-products">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight"> {t('loanProducts.createProduct')} </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure terms for a new loan offering.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="bg-card border-border backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">Product Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Product Name</label>
              <Input 
                {...register('name')} 
                className="bg-muted border-border text-foreground" 
                placeholder="e.g. Daily Personal Loan" 
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Interest Type</label>
                <select
                  {...register('interestType')}
                  className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="flat">Flat Rate</option>
                  <option value="reducing_balance">Reducing Balance</option>
                </select>
                {errors.interestType && <p className="text-sm text-destructive">{errors.interestType.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Interest Rate (Annual %)</label>
                <Input 
                  type="number"
                  step="0.1"
                  {...register('interestRateAnnual', { valueAsNumber: true })} 
                  className="bg-muted border-border text-foreground" 
                />
                {errors.interestRateAnnual && <p className="text-sm text-destructive">{errors.interestRateAnnual.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Collection Frequency</label>
                <select
                  {...register('collectionFrequency')}
                  className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                {errors.collectionFrequency && <p className="text-sm text-destructive">{errors.collectionFrequency.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Processing Fee (Flat ₹)</label>
                <Input 
                  type="number"
                  {...register('processingFee', { valueAsNumber: true })} 
                  className="bg-muted border-border text-foreground" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Min Amount (₹)</label>
                <Input 
                  type="number"
                  {...register('minAmount', { valueAsNumber: true })} 
                  className="bg-muted border-border text-foreground" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Max Amount (₹)</label>
                <Input 
                  type="number"
                  {...register('maxAmount', { valueAsNumber: true })} 
                  className="bg-muted border-border text-foreground" 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Min Tenure (Installments)</label>
                <Input 
                  type="number"
                  {...register('minTenure', { valueAsNumber: true })} 
                  className="bg-muted border-border text-foreground" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Max Tenure (Installments)</label>
                <Input 
                  type="number"
                  {...register('maxTenure', { valueAsNumber: true })} 
                  className="bg-muted border-border text-foreground" 
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3 border-t border-border/50 pt-6">
            <Link to="/app/loan-products">
              <Button type="button" variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={createProduct.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              {createProduct.isPending ? <LoadingSpinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              Save Product
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
