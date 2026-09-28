import { useState, useEffect } from 'react';
import { supabase } from '../../../shared/lib/supabase';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../shared/components/ui/card';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { GoogleIcon } from '@/shared/components/icons/google-icon';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'not_provisioned') {
      setError('Your account has not been provisioned yet. Please ask your organization admin to add you as a staff member first.');
      // Sign out the unprovisioned Supabase session so they can try again
      supabase.auth.signOut();
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Fire-and-forget login event to record in audit log
      apiClient.post('/auth/login-event').catch((err) => {
        console.error('Failed to record login audit event:', err);
      });

      const verifiedFactors = data.user?.factors?.filter((f) => f.status === 'verified') || [];
      if (verifiedFactors.length > 0) {
        navigate(`/verify-2fa?factorId=${verifiedFactors[0].id}`);
      } else {
        navigate('/app/dashboard');
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/app/dashboard',
        },
      });
      
      if (error) {
        setError(error.message);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-background p-4">
      <Card className="w-full max-w-md glass-card border-border">
        <CardHeader className="space-y-2 text-center pb-8">
          <div className="mx-auto w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-4">
            <div className="w-6 h-6 bg-gradient-to-tr from-indigo-500 to-emerald-500 rounded-md"></div>
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">Welcome back</CardTitle>
          <CardDescription className="text-muted-foreground">Sign in to your Pigmie account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-destructive/20 border border-destructive/50 text-destructive-foreground text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Email address</label>
              <Input 
                type="email" 
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground/80">Password</label>
                <a href="#" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Forgot password?</a>
              </div>
              <Input 
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-muted border-border"
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-foreground border-0" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <div className="flex items-center my-4 gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs uppercase text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border" />
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
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border pt-6 text-sm text-muted-foreground">
          Don't have an account? 
          <Link to="/signup" className="text-indigo-400 hover:text-indigo-300 ml-1 font-medium transition-colors">Sign up</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
