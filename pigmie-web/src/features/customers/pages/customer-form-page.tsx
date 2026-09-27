import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateCustomer, useCustomer, useUpdateCustomer } from '../hooks/use-customers';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { ArrowLeft, Save } from 'lucide-react';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { useNavigate, Link, useParams } from 'react-router-dom';

const customerSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().min(10, 'Valid phone number is required'),
  address: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export const CustomerFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const { data: customer, isLoading: isLoadingCustomer } = useCustomer(id as string);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      address: '',
    }
  });

  useEffect(() => {
    if (isEditMode && customer) {
      reset({
        fullName: customer.fullName,
        email: customer.email || '',
        phone: customer.phone,
        address: customer.address || '',
      });
    }
  }, [isEditMode, customer, reset]);

  const onSubmit = async (data: CustomerFormValues) => {
    try {
      const payload = {
        ...data,
        email: data.email || undefined,
        address: data.address || undefined
      };
      
      if (isEditMode) {
        await updateCustomer.mutateAsync({ id, data: payload });
        navigate(`/app/customers/${id}`);
      } else {
        await createCustomer.mutateAsync(payload);
        navigate('/app/customers');
      }
    } catch (error) {
      console.error('Failed to save customer:', error);
    }
  };

  const isPending = createCustomer.isPending || updateCustomer.isPending;

  if (isEditMode && isLoadingCustomer) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <LoadingSpinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to={isEditMode ? `/app/customers/${id}` : "/app/customers"}>
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{isEditMode ? 'Edit Customer' : 'Add New Customer'}</h1>
          <p className="text-muted-foreground mt-1 text-zinc-400">{isEditMode ? 'Update customer details.' : 'Enter customer details to register them in the system.'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-xl text-white">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Full Name</label>
              <Input 
                {...register('fullName')} 
                className="bg-zinc-800/50 border-zinc-700 text-white" 
                placeholder="John Doe" 
              />
              {errors.fullName && <p className="text-sm text-red-400">{errors.fullName.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Email Address (Optional)</label>
                <Input 
                  {...register('email')} 
                  type="email"
                  className="bg-zinc-800/50 border-zinc-700 text-white" 
                  placeholder="john.doe@example.com" 
                />
                {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Phone Number</label>
                <Input 
                  {...register('phone')} 
                  className="bg-zinc-800/50 border-zinc-700 text-white" 
                  placeholder="+91 9876543210" 
                />
                {errors.phone && <p className="text-sm text-red-400">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Address (Optional)</label>
              <Input 
                {...register('address')}
                className="bg-zinc-800/50 border-zinc-700 text-white" 
                placeholder="123 Main St, City"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3 border-t border-zinc-800/50 pt-6">
            <Link to={isEditMode ? `/app/customers/${id}` : "/app/customers"}>
              <Button type="button" variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              {isPending ? <LoadingSpinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {isEditMode ? 'Update Customer' : 'Save Customer'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
