import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/shared/lib/api-client';
import { supabase } from '@/shared/lib/supabase';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Save, Building2, Bell, ShieldCheck, Loader2, KeyRound, Smartphone, LogOut } from 'lucide-react';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Switch } from '@/shared/components/ui/switch';
import { useAuth } from '@/shared/hooks/use-auth';
import { RoleGate } from '@/shared/components/auth/role-gate';

const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name is required'),
  contactEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

export function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'organization' | 'notifications' | 'security'>('organization');
  const queryClient = useQueryClient();
  
  const [notifyEmail, setNotifyEmail] = useState(() => localStorage.getItem('notify_email') !== 'false');
  const [notifyPush, setNotifyPush] = useState(() => localStorage.getItem('notify_push') !== 'false');
  const [notifyOverdue, setNotifyOverdue] = useState(() => localStorage.getItem('notify_overdue') !== 'false');
  const [notifyCollection, setNotifyCollection] = useState(() => localStorage.getItem('notify_collection') !== 'false');
  const [smsProvider, setSmsProvider] = useState(() => localStorage.getItem('sms_provider') || 'console');

  const handleNotifyToggle = (key: string, setter: (val: boolean) => void, val: boolean) => {
    setter(val);
    localStorage.setItem(key, String(val));
    toast.success('Preference saved locally');
  };

  const [tfaSetup, setTfaSetup] = useState<any>(null);
  const [tfaCode, setTfaCode] = useState('');
  
  const setup2Fa = useMutation({
    mutationFn: () => apiClient.post('/auth/2fa/setup').then(res => res.data),
    onSuccess: (data) => setTfaSetup(data),
    onError: () => toast.error('Failed to setup 2FA'),
  });

  const enable2Fa = useMutation({
    mutationFn: () => apiClient.post('/auth/2fa/enable', { code: tfaCode }).then(res => res.data),
    onSuccess: () => {
      toast.success('2FA enabled successfully');
      setTfaSetup(null);
    },
    onError: () => toast.error('Failed to enable 2FA'),
  });

  const handleResetPassword = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) {
        toast.error('No email found for current session');
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login',
      });
      if (error) throw error;
      toast.success('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reset email');
    }
  };
  
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your platform preferences and configuration.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-3">
          <nav className="flex flex-col space-y-1">
            <Button 
              variant={activeTab === 'organization' ? 'secondary' : 'ghost'} 
              className={`justify-start gap-2 ${activeTab !== 'organization' ? 'hover:bg-muted' : ''}`}
              onClick={() => setActiveTab('organization')}
            >
              <Building2 className="h-4 w-4" />
              Organization
            </Button>
            <Button 
              variant={activeTab === 'notifications' ? 'secondary' : 'ghost'} 
              className={`justify-start gap-2 ${activeTab !== 'notifications' ? 'hover:bg-muted' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              <Bell className="h-4 w-4" />
              Notifications
            </Button>
            <Button 
              variant={activeTab === 'security' ? 'secondary' : 'ghost'} 
              className={`justify-start gap-2 ${activeTab !== 'security' ? 'hover:bg-muted' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <ShieldCheck className="h-4 w-4" />
              Security
            </Button>
          </nav>
        </div>

        <div className="md:col-span-9 space-y-6">
          {activeTab === 'organization' && (
            <Card className="border-border bg-card backdrop-blur-xl">
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
                      <label className="text-sm font-medium text-foreground">Organization Name</label>
                      <Input 
                        {...register('name')}
                        className="bg-muted border-border" 
                      />
                      {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Support Email</label>
                      <Input 
                        {...register('contactEmail')}
                        type="email" 
                        className="bg-muted border-border" 
                      />
                      {errors.contactEmail && <p className="text-sm text-red-500">{errors.contactEmail.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Contact Number</label>
                      <Input 
                        {...register('contactPhone')}
                        type="tel" 
                        className="bg-muted border-border" 
                      />
                      {errors.contactPhone && <p className="text-sm text-red-500">{errors.contactPhone.message}</p>}
                    </div>
                    
                    <div className="pt-4 flex justify-end">
                      <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
                        <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
                          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save Changes
                        </Button>
                      </RoleGate>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card className="border-border bg-card backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Configure how you receive alerts and updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Email Notifications</h3>
                    <p className="text-xs text-muted-foreground">Receive system alerts via email.</p>
                  </div>
                  <Switch 
                    checked={notifyEmail} 
                    onCheckedChange={(val) => handleNotifyToggle('notify_email', setNotifyEmail, val)} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Push Notifications</h3>
                    <p className="text-xs text-muted-foreground">Receive alerts on your mobile device.</p>
                  </div>
                  <Switch 
                    checked={notifyPush} 
                    onCheckedChange={(val) => handleNotifyToggle('notify_push', setNotifyPush, val)} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Overdue Alerts</h3>
                    <p className="text-xs text-muted-foreground">Get notified when a loan payment is overdue.</p>
                  </div>
                  <Switch 
                    checked={notifyOverdue} 
                    onCheckedChange={(val) => handleNotifyToggle('notify_overdue', setNotifyOverdue, val)} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Collection Reminders</h3>
                    <p className="text-xs text-muted-foreground">Daily reminders for scheduled collections.</p>
                  </div>
                  <Switch 
                    checked={notifyCollection} 
                    onCheckedChange={(val) => handleNotifyToggle('notify_collection', setNotifyCollection, val)} 
                  />
                </div>
                
                <div className="pt-6 border-t border-border">
                  <h3 className="text-lg font-medium text-foreground mb-4">SMS Configuration</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">SMS Provider</label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                        value={smsProvider}
                        onChange={(e) => {
                           const val = e.target.value;
                           setSmsProvider(val);
                           localStorage.setItem('sms_provider', val);
                           toast.success('SMS Provider updated');
                        }}
                      >
                        <option value="console" className="bg-card">Console (Mock)</option>
                        <option value="msg91" className="bg-card">MSG91</option>
                        <option value="twilio" className="bg-card">Twilio</option>
                        <option value="textlocal" className="bg-card">TextLocal</option>
                      </select>
                      {smsProvider === 'console' && (
                        <p className="text-xs text-muted-foreground">Mock mode — SMS messages will be logged to the console instead of sent.</p>
                      )}
                    </div>
                    {smsProvider !== 'console' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">API Key</label>
                          <Input 
                            type="password"
                            placeholder="Enter API Key"
                            className="bg-muted border-border"
                            defaultValue={localStorage.getItem('sms_api_key') || ''}
                            onBlur={(e) => {
                              localStorage.setItem('sms_api_key', e.target.value);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Sender ID</label>
                          <Input 
                            type="text"
                            placeholder="e.g. PIGMIE"
                            className="bg-muted border-border"
                            defaultValue={localStorage.getItem('sms_sender_id') || ''}
                            onBlur={(e) => {
                              localStorage.setItem('sms_sender_id', e.target.value);
                            }}
                          />
                        </div>
                        <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
                          <Button onClick={() => toast.success('SMS Configuration saved successfully')} className="mt-2">
                            Save SMS Configuration
                          </Button>
                        </RoleGate>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card className="border-border bg-card backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>
                  Manage your organization's security preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-primary" /> Password
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Change your account password.</p>
                  </div>
                  <Button onClick={handleResetPassword} variant="outline" className="border-border hover:bg-muted">
                    Send Password Reset Email
                  </Button>
                </div>

                <div className="h-px bg-muted" />

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-primary" /> Two-Factor Authentication (2FA)
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Add an extra layer of security to your account.</p>
                  </div>
                  
                  {!tfaSetup ? (
                    <Button onClick={() => setup2Fa.mutate()} disabled={setup2Fa.isPending} className="bg-primary/20 text-primary hover:bg-primary/30">
                      {setup2Fa.isPending ? <LoadingSpinner className="w-4 h-4 mr-2" /> : null}
                      Setup 2FA
                    </Button>
                  ) : (
                    <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/50">
                      <p className="text-sm text-foreground/80">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the code below.</p>
                      <div className="flex justify-center bg-white p-2 rounded w-max">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tfaSetup.otpAuthUrl)}`} 
                          alt="2FA QR Code" 
                          className="w-32 h-32" 
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <p>Can't scan? Enter this secret manually:</p>
                        <code className="block mt-1 p-2 bg-muted rounded text-foreground font-mono text-sm break-all">{tfaSetup.secret}</code>
                      </div>
                      <div className="flex gap-2 max-w-sm">
                        <Input 
                          placeholder="Enter 6-digit code" 
                          value={tfaCode}
                          onChange={(e) => setTfaCode(e.target.value)}
                          className="bg-muted border-border"
                        />
                        <Button onClick={() => enable2Fa.mutate()} disabled={enable2Fa.isPending || tfaCode.length < 6}>
                          {enable2Fa.isPending ? <LoadingSpinner className="w-4 h-4 mr-2" /> : null}
                          Verify
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-muted" />

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                      <LogOut className="h-5 w-5 text-primary" /> Active Sessions
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Manage your active login sessions.</p>
                  </div>
                  <p className="text-sm text-muted-foreground italic">Session management coming soon.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
