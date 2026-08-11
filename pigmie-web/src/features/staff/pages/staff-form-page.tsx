import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCreateStaff, StaffRole } from '../hooks/use-staff';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

const staffSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  role: z.enum(['admin', 'manager', 'agent']),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

type StaffFormValues = z.infer<typeof staffSchema>;

export function StaffFormPage() {
  const navigate = useNavigate();
  const createStaff = useCreateStaff();

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      status: 'active',
    }
  });

  const onSubmit = async (data: StaffFormValues) => {
    try {
      await createStaff.mutateAsync(data);
      navigate('/app/staff');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/app/staff">
          <Button variant="ghost" size="icon" className="hover:bg-white/10">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Add Staff Member</h1>
          <p className="text-sm text-zinc-400">Provision a new user for your organization.</p>
        </div>
      </div>

      <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>Staff Details</CardTitle>
          <CardDescription>Enter the staff member's information and assign a role.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  {...register('name')} 
                  className="bg-white/5 border-white/10" 
                  placeholder="e.g. Jane Doe"
                />
                {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input 
                  id="email" 
                  type="email"
                  {...register('email')} 
                  className="bg-white/5 border-white/10" 
                  placeholder="e.g. jane@pigmie.com"
                />
                {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select onValueChange={(val: any) => setValue('role', val)}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator (Full Access)</SelectItem>
                    <SelectItem value="manager">Branch Manager (Approve Loans)</SelectItem>
                    <SelectItem value="agent">Field Agent (Record Collections)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.role && <p className="text-xs text-red-400">{errors.role.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="status">Initial Status</Label>
                <Select defaultValue="active" onValueChange={(val: any) => setValue('status', val)}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
              <Link to="/app/staff">
                <Button type="button" variant="ghost">Cancel</Button>
              </Link>
              <Button type="submit" disabled={createStaff.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                <UserPlus className="w-4 h-4" />
                {createStaff.isPending ? 'Adding...' : 'Add Staff Member'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
