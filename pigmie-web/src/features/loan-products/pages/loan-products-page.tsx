import React from 'react';
import { Link } from 'react-router-dom';
import { useLoanProducts } from '../hooks/use-loan-products';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Plus, Percent, Clock, DollarSign } from 'lucide-react';

export const LoanProductsPage = () => {
  const { data: productsResponse, isLoading } = useLoanProducts();
  const products = productsResponse?.data || [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[400px]">
        <LoadingSpinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Loan Products</h1>
          <p className="text-muted-foreground mt-1 text-zinc-400">Manage available loan products and terms.</p>
        </div>
        <Link to="/app/loan-products/new">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
            <Plus className="w-4 h-4" /> Create Product
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {products?.map((product) => (
          <Card key={product.id} className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm overflow-hidden hover:border-primary/50 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl text-white">{product.name}</CardTitle>
                <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className={product.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'bg-zinc-800 text-zinc-400'}>
                  {product.status}
                </Badge>
              </div>
              <p className="text-sm text-zinc-400 mt-2 min-h-[40px]">{product.description}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-zinc-400 gap-2">
                    <DollarSign className="w-4 h-4" /> Max Amount
                  </div>
                  <span className="font-medium text-white">${product.maxAmount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-zinc-400 gap-2">
                    <Percent className="w-4 h-4" /> Interest Rate
                  </div>
                  <span className="font-medium text-white">{product.interestRate}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-zinc-400 gap-2">
                    <Clock className="w-4 h-4" /> Duration
                  </div>
                  <span className="font-medium text-white">{product.durationMonths} months</span>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-800/50 flex gap-3">
                <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">Edit</Button>
                <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">Details</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
