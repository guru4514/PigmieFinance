import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/use-auth';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../shared/components/ui/card';

export function Verify2FAPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { challenge2FA } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const factorId = searchParams.get('factorId');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) {
      setError('No factor ID provided');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await challenge2FA(factorId, code);
      navigate('/app/dashboard');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-background p-4">
      <Card className="w-full max-w-md glass-card border-white/10">
        <CardHeader className="space-y-2 text-center pb-8">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Two-Factor Authentication</CardTitle>
          <CardDescription className="text-zinc-400">Enter the 6-digit code from your authenticator app</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-destructive/20 border border-destructive/50 text-destructive-foreground text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Verification Code</label>
              <Input 
                type="text" 
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={6}
                className="bg-black/50 border-white/10 text-center tracking-widest text-lg"
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white border-0" disabled={loading || !factorId}>
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
