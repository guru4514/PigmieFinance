import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { useCustomers } from "../../customers/hooks/use-customers";
import { useLoanProducts } from '../../loan-products/hooks/use-loan-products';
import { useCreateLoan } from '../hooks/use-loans';

const loanSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  loanProductId: z.string().min(1, 'Loan Product is required'),
  principalAmount: z.number().min(1, 'Amount must be greater than 0'),
  tenure: z.number().min(1, 'Tenure must be at least 1'),
  notes: z.string().optional(),
});

type LoanFormValues = z.infer<typeof loanSchema>;

export const NewLoanPage: React.FC = () => {
  const navigate = useNavigate();
  const createLoan = useCreateLoan();
  
  const { data: customersRes } = useCustomers();
  const { data: productsRes } = useLoanProducts();
  
  const customers = customersRes?.data || [];
  const products = productsRes?.data || [];

  const { register, handleSubmit, formState: { errors } } = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      customerId: '',
      loanProductId: '',
      principalAmount: 0,
      tenure: 0,
      notes: ''
    }
  });

  const onSubmit = async (data: LoanFormValues) => {
    try {
      await createLoan.mutateAsync(data);
      navigate('/app/loans');
    } catch (error) {
      console.error('Failed to create loan:', error);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-4">
        <Link to="/app/loans">
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Create New Loan</h1>
          <p className="text-sm text-zinc-400 mt-1">Issue a new loan to a registered customer.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl text-white">Loan Details</CardTitle>
            <CardDescription className="text-zinc-400">
              Select a customer and a loan product to determine the terms.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Customer</label>
              <select
                {...register('customerId')}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a customer...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.phone})</option>
                ))}
              </select>
              {errors.customerId && <p className="text-sm text-red-400">{errors.customerId.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Loan Product</label>
              <select
                {...register('loanProductId')}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.interestRateAnnual}% {p.interestType})</option>
                ))}
              </select>
              {errors.loanProductId && <p className="text-sm text-red-400">{errors.loanProductId.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Principal Amount (₹)</label>
                <Input
                  type="number"
                  {...register('principalAmount', { valueAsNumber: true })}
                  className="bg-zinc-800/50 border-zinc-700 text-white"
                  placeholder="10000"
                />
                {errors.principalAmount && <p className="text-sm text-red-400">{errors.principalAmount.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Tenure (Number of Installments)</label>
                <Input
                  type="number"
                  {...register('tenure', { valueAsNumber: true })}
                  className="bg-zinc-800/50 border-zinc-700 text-white"
                  placeholder="100"
                />
                {errors.tenure && <p className="text-sm text-red-400">{errors.tenure.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Notes (Optional)</label>
              <Input
                {...register('notes')}
                className="bg-zinc-800/50 border-zinc-700 text-white"
                placeholder="Any special notes..."
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3 border-t border-zinc-800/50 pt-6">
            <Link to="/app/loans">
              <Button type="button" variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={createLoan.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              {createLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              Create Loan
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
