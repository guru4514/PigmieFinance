import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateCustomer, useCustomer, useUpdateCustomer } from '../hooks/use-customers';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { ArrowLeft, Save, User, Shield, Users } from 'lucide-react';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const customerSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian phone number'),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  idProofType: z.enum(['aadhaar', 'pan', 'voter_id', 'passport', 'driving_license', 'other']).optional(),
  idProofNumber: z.string().optional(),
  guarantorName: z.string().optional(),
  guarantorPhone: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export const CustomerFormPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const { data: customer, isLoading: isLoadingCustomer } = useCustomer(id as string);

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      address: '',
      dateOfBirth: '',
      gender: '',
      idProofType: undefined,
      idProofNumber: '',
      guarantorName: '',
      guarantorPhone: '',
    }
  });

  useEffect(() => {
    if (isEditMode && customer) {
      reset({
        fullName: customer.fullName,
        email: customer.email || '',
        phone: customer.phone,
        address: customer.address || '',
        dateOfBirth: customer.dateOfBirth ? customer.dateOfBirth.split('T')[0] : '',
        gender: customer.gender || '',
        idProofType: customer.idProofType || undefined,
        idProofNumber: customer.idProofNumber || '',
        guarantorName: customer.guarantorName || '',
        guarantorPhone: customer.guarantorPhone || '',
      });
    }
  }, [isEditMode, customer, reset]);

  const onSubmit = async (data: CustomerFormValues) => {
    try {
      const payload = {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email || undefined,
        address: data.address || undefined,
        dateOfBirth: data.dateOfBirth || undefined,
        gender: data.gender || undefined,
        idProofType: data.idProofType || undefined,
        idProofNumber: data.idProofNumber || undefined,
        guarantorName: data.guarantorName || undefined,
        guarantorPhone: data.guarantorPhone || undefined,
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
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{isEditMode ? 'Edit Customer' : 'Add New Customer'}</h1>
          <p className="text-muted-foreground mt-1">{isEditMode ? 'Update customer details.' : 'Enter customer details to register them in the system.'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Information */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center gap-2 pb-4">
            <User className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl text-foreground">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Full Name *</label>
              <Input 
                {...register('fullName')} 
                className="bg-muted border-border text-foreground" 
                placeholder="e.g. Raju Kumar" 
              />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Phone Number *</label>
                <Input 
                  {...register('phone')} 
                  className="bg-muted border-border text-foreground" 
                  placeholder="+91 9876543210" 
                />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Email Address (Optional)</label>
                <Input 
                  {...register('email')} 
                  type="email"
                  className="bg-muted border-border text-foreground" 
                  placeholder="john.doe@example.com" 
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Date of Birth</label>
                <Input 
                  {...register('dateOfBirth')} 
                  type="date"
                  className="bg-muted border-border text-foreground" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Gender</label>
                <Select 
                  value={watch('gender') || ''} 
                  onValueChange={(val) => setValue('gender', val)}
                >
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80"> {t('branches.address')} </label>
              <Input 
                {...register('address')}
                className="bg-muted border-border text-foreground" 
                placeholder="123 Main St, City"
              />
            </div>
          </CardContent>
        </Card>

        {/* KYC / ID Proof */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center gap-2 pb-4">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl text-foreground">Identity Verification (KYC)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">ID Proof Type</label>
                <Select 
                  value={watch('idProofType') || ''} 
                  onValueChange={(val: any) => setValue('idProofType', val)}
                >
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                    <SelectItem value="pan">PAN Card</SelectItem>
                    <SelectItem value="voter_id">Voter ID</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="driving_license">Driving License</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">ID Proof Number</label>
                <Input 
                  {...register('idProofNumber')} 
                  className="bg-muted border-border text-foreground" 
                  placeholder="e.g. XXXX XXXX 1234" 
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Guarantor Information */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center gap-2 pb-4">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl text-foreground">Guarantor Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Guarantor Name</label>
                <Input 
                  {...register('guarantorName')} 
                  className="bg-muted border-border text-foreground" 
                  placeholder="Guarantor's full name" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Guarantor Phone</label>
                <Input 
                  {...register('guarantorPhone')} 
                  className="bg-muted border-border text-foreground" 
                  placeholder="+91 9876543210" 
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link to={isEditMode ? `/app/customers/${id}` : "/app/customers"}>
            <Button type="button" variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
            {isPending ? <LoadingSpinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isEditMode ? 'Update Customer' : 'Save Customer'}
          </Button>
        </div>
      </form>
    </div>
  );
};
