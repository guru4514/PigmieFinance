import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLoanProducts, useUpdateLoanProduct } from '../hooks/use-loan-products';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Plus, Percent, Clock, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';

const ProductCard = ({ product }: { product: any }) => {
  const [showEdit, setShowEdit] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  const updateProduct = useUpdateLoanProduct();
  const [editForm, setEditForm] = useState({
    name: product.name,
    status: product.status,
  });

  const handleUpdate = () => {
    updateProduct.mutate({ id: product.id, data: editForm });
    setShowEdit(false);
  };

  return (
    <>
      <Card className="bg-card border-border backdrop-blur-sm overflow-hidden hover:border-primary/50 transition-colors">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-start">
            <CardTitle className="text-xl text-foreground">{product.name}</CardTitle>
            <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className={product.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'bg-muted text-muted-foreground'}>
              {product.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">{product.description}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center text-muted-foreground gap-2">
                <DollarSign className="w-4 h-4" /> Max Amount
              </div>
              <span className="font-medium text-foreground">${(product.maxAmount || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center text-muted-foreground gap-2">
                <Percent className="w-4 h-4" /> Interest Rate
              </div>
              <span className="font-medium text-foreground">{product.interestRate || product.interestRateAnnual || 0}%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center text-muted-foreground gap-2">
                <Clock className="w-4 h-4" /> Duration
              </div>
              <span className="font-medium text-foreground">{product.durationMonths || product.maxTenure || 0} months</span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-border/50 flex gap-3">
            <Button onClick={() => setShowEdit(true)} variant="outline" className="w-full border-border text-foreground/80 hover:bg-muted hover:text-foreground">Edit</Button>
            <Button onClick={() => setShowDetails(true)} variant="outline" className="w-full border-border text-foreground/80 hover:bg-muted hover:text-foreground">Details</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Edit Loan Product</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Name</label>
              <Input 
                value={editForm.name} 
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Status</label>
              <select 
                value={editForm.status} 
                onChange={e => setEditForm({ ...editForm, status: e.target.value as any })}
                className="w-full p-2 bg-card border border-border text-foreground rounded-md"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateProduct.isPending} className="bg-primary text-primary-foreground">
              {updateProduct.isPending ? <LoadingSpinner className="w-4 h-4" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Product Details</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {Object.entries(product).map(([key, value]) => (
              <div key={key} className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                <span className="text-foreground font-medium">{String(value)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Loan Products</h1>
          <p className="text-muted-foreground mt-1 text-muted-foreground">Manage available loan products and terms.</p>
        </div>
        <Link to="/app/loan-products/new">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
            <Plus className="w-4 h-4" /> Create Product
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {products?.map((product: any) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
};

