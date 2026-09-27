import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/shared/lib/api-client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Save, Building2, Bell, ShieldCheck, Loader2 } from 'lucide-react';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';

const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name is required'),
  contactEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'organization' | 'notifications' | 'security'>('organization');
  const queryClient = useQueryClient();
  
  const { data: orgData, isLoading } = useQuery({
    queryKey: ['organization', 'me'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/me');
      return res.data;
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      contactEmail: '',
      contactPhone: '',
    },
  });

  useEffect(() => {
    if (orgData) {
      reset({
        name: orgData.name || '',
        contactEmail: orgData.contactEmail || '',
        contactPhone: orgData.contactPhone || '',
      });
    }
  }, [orgData, reset]);

  const updateMutation = useMutation({
    mutationFn: async (data: OrganizationFormValues) => {
      const res = await apiClient.patch('/organizations/me', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Organization settings updated successfully');
      queryClient.invalidateQueries({ queryKey: ['organization', 'me'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update organization');
    },
  });

  const onSubmit = (data: OrganizationFormValues) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your platform preferences and configuration.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-3">
          <nav className="flex flex-col space-y-1">
            <Button 
              variant={activeTab === 'organization' ? 'secondary' : 'ghost'} 
              className={`justify-start gap-2 ${activeTab !== 'organization' ? 'hover:bg-white/5' : ''}`}
              onClick={() => setActiveTab('organization')}
            >
              <Building2 className="h-4 w-4" />
              Organization
            </Button>
            <Button 
              variant={activeTab === 'notifications' ? 'secondary' : 'ghost'} 
              className={`justify-start gap-2 ${activeTab !== 'notifications' ? 'hover:bg-white/5' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              <Bell className="h-4 w-4" />
              Notifications
            </Button>
            <Button 
              variant={activeTab === 'security' ? 'secondary' : 'ghost'} 
              className={`justify-start gap-2 ${activeTab !== 'security' ? 'hover:bg-white/5' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <ShieldCheck className="h-4 w-4" />
              Security
            </Button>
          </nav>
        </div>

        <div className="md:col-span-9 space-y-6">
          {activeTab === 'organization' && (
            <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Organization Profile</CardTitle>
                <CardDescription>
                  Update your company details and basic information.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center p-8">
                    <LoadingSpinner className="w-8 h-8 text-primary" />
                  </div>
                ) : (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-200">Organization Name</label>
                      <Input 
                        {...register('name')}
                        className="bg-white/5 border-white/10" 
                      />
                      {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-200">Support Email</label>
                      <Input 
                        {...register('contactEmail')}
                        type="email" 
                        className="bg-white/5 border-white/10" 
                      />
                      {errors.contactEmail && <p className="text-sm text-red-500">{errors.contactEmail.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-200">Contact Number</label>
                      <Input 
                        {...register('contactPhone')}
                        type="tel" 
                        className="bg-white/5 border-white/10" 
                      />
                      {errors.contactPhone && <p className="text-sm text-red-500">{errors.contactPhone.message}</p>}
                    </div>
                    
                    <div className="pt-4 flex justify-end">
                      <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Changes
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Configure how you receive alerts and updates.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400">Notification settings are coming soon.</p>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>
                  Manage your organization's security preferences.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400">Security settings are coming soon.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
