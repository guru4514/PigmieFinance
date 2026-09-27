import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Button } from '@/shared/components/ui/button';
import { PiggyBank, ArrowRight, Building2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { apiClient } from '@/shared/lib/api-client';

import { GoogleIcon } from '@/shared/components/icons/google-icon';

export function SignupPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [currency, setCurrency] = useState('INR');

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/app/dashboard',
        },
      });
      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      await apiClient.post('/organizations', {
        organizationName: orgName,
        adminFullName: adminFullName,
        adminEmail: email,
        currency,
      });
      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to provision organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background dark:bg-[#0a0a0a] relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-[120px]" />
      
      <div className="w-full max-w-md z-10">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
            <PiggyBank className="text-primary-foreground w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight">Pigmie</span>
        </div>

        <Card className="glassmorphism bg-card/60 border-white/10 shadow-2xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-xl">
              {step === 1 && "Create your account"}
              {step === 2 && "Setup your organization"}
              {step === 3 && "You're all set!"}
            </CardTitle>
            <CardDescription>
              {step === 1 && "Enter your email below to create your account"}
              {step === 2 && "Tell us a bit about your MFI or collection agency"}
              {step === 3 && "Your organization has been provisioned"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <>
                <form onSubmit={handleStep1} className="space-y-4">
                  {errorMsg && <div className="text-red-500 text-sm font-medium">{errorMsg}</div>}
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input id="fullName" value={adminFullName} onChange={e => setAdminFullName(e.target.value)} placeholder="John Doe" required className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="m@example.com" required className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-background/50" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating account...' : 'Continue'}
                    {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </form>

                <div className="flex items-center my-4 gap-3">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="text-xs uppercase text-muted-foreground">or</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>

                <Button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full bg-white hover:bg-zinc-100 text-zinc-900 font-medium border-0 shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  <GoogleIcon className="w-5 h-5 shrink-0" />
                  Sign in with Google
                </Button>
              </>
            )}

            {step === 2 && (
              <form onSubmit={handleStep2} className="space-y-4">
                {errorMsg && <div className="text-red-500 text-sm font-medium">{errorMsg}</div>}
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="orgName" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Acme Finance Ltd" required className="pl-9 bg-background/50" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Base Currency</Label>
                  <select id="currency" value={currency} onChange={e => setCurrency(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="INR">INR (₹) - Indian Rupee</option>
                    <option value="USD">USD ($) - US Dollar</option>
                    <option value="KES">KES (KSh) - Kenyan Shilling</option>
                  </select>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Provisioning...' : 'Complete Setup'}
                </Button>
              </form>
            )}

            {step === 3 && (
              <div className="flex flex-col items-center justify-center py-6 space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-medium">Provisioning Complete</h3>
                <p className="text-center text-sm text-muted-foreground">
                  Your workspace is ready. You can now invite staff and start managing collections.
                </p>
                <Button className="w-full mt-4" onClick={() => window.location.href = '/app/dashboard'}>
                  Go to Dashboard
                </Button>
              </div>
            )}
          </CardContent>
          
          {step === 1 && (
            <CardFooter className="flex justify-center border-t border-border/50 pt-4">
              <div className="text-sm text-muted-foreground">
                Already have an account? <a href="/login" className="text-primary hover:underline">Log in</a>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
