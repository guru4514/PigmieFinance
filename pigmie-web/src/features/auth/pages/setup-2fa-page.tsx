import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/use-auth';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../shared/components/ui/card';

export function Setup2FAPage() {
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [qrCodeSvg, setQrCodeSvg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { enroll2FA, verify2FASetup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function setup() {
      try {
        setLoading(true);
        const data = await enroll2FA();
        if (data) {
          setFactorId(data.id);
          setQrCodeSvg(data.totp.qr_code);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to setup 2FA');
      } finally {
        setLoading(false);
      }
    }
    setup();
  }, []); // run once on mount

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await verify2FASetup(factorId, code);
      navigate('/app/dashboard');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-background p-4">
      <Card className="w-full max-w-md glass-card border-border">
        <CardHeader className="space-y-2 text-center pb-8">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">Setup 2FA</CardTitle>
          <CardDescription className="text-muted-foreground">Scan the QR code with your authenticator app</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-destructive/20 border border-destructive/50 text-destructive-foreground text-sm">
                {error}
              </div>
            )}
            
            <div className="flex justify-center mb-6">
              {qrCodeSvg ? (
                <div dangerouslySetInnerHTML={{ __html: qrCodeSvg }} className="bg-white p-2 rounded-md" />
              ) : (
                <div className="w-48 h-48 bg-muted animate-pulse rounded-md"></div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Verification Code</label>
              <Input 
                type="text" 
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={6}
                className="bg-muted border-border text-foreground text-center tracking-widest text-lg"
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-foreground border-0" disabled={loading || !factorId}>
              {loading ? 'Verifying...' : 'Verify and Complete'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
