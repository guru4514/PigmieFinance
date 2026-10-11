import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/use-auth';
import { supabase } from '@/shared/lib/supabase';
import { enrollAuthenticator, listAuthenticators, verifyAuthenticator } from '@/shared/lib/mfa';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/components/ui/card';
import { LoadingScreen } from '@/shared/components/ui/loading-spinner';

type Enrollment = Awaited<ReturnType<typeof enrollAuthenticator>>;
type Factors = Awaited<ReturnType<typeof listAuthenticators>>;
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not verify your authenticator';

export function AuthenticatorPage() {
  const { session, user, isLoading, isMfaVerified, error } = useAuth();
  const queryClient = useQueryClient();
  if (isLoading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (error || !user) return <div className="p-8 space-y-4"><p>Unable to load your account. Please retry.</p><Button onClick={() => { void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }); }}>Retry</Button><Button variant="outline" onClick={() => { void supabase.auth.signOut(); }}>Sign out</Button></div>;
  if (user.userType === 'unprovisioned') return <Navigate to="/login?error=not_provisioned" replace />;
  const destination = user.userType === 'customer' ? '/portal/dashboard' : '/app/dashboard';
  if (isMfaVerified) return <Navigate to={destination} replace />;
  return <AuthenticatorForm key={session.user.id} authUserId={session.user.id} />;
}

function AuthenticatorForm({ authUserId }: { authUserId: string }) {
  const [factors, setFactors] = useState<Factors>([]);
  const [factorId, setFactorId] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setLoaded(false);
    listAuthenticators(authUserId).then((data) => {
      if (cancelled) return;
      setFactors(data); setFactorId(data[0]?.id ?? ''); setLoaded(true);
    }).catch((failure: unknown) => {
      if (!cancelled) setError(message(failure));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUserId, revision]);

  const startEnrollment = async () => {
    if (busy.current || !loaded) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const data = await enrollAuthenticator(authUserId);
      if (active.current) { setEnrollment(data); setFactorId(data.id); setCode(''); }
    } catch (failure: unknown) { if (active.current) setError(message(failure)); }
    finally { busy.current = false; if (active.current) setLoading(false); }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || !factorId) return;
    busy.current = true; setLoading(true); setError('');
    try {
      await verifyAuthenticator(authUserId, factorId, code);
      // The auth-state event updates the shared session; the parent redirects only on aal2.
    } catch (failure: unknown) { if (active.current) setError(message(failure)); }
    finally { busy.current = false; if (active.current) setLoading(false); }
  };
  const qr = enrollment?.totp.qr_code;
  const qrSrc = qr?.startsWith('data:image/svg+xml;utf-8,')
    ? `data:image/svg+xml;utf-8,${encodeURIComponent(qr.slice('data:image/svg+xml;utf-8,'.length))}` : undefined;
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Verify your authenticator</CardTitle><CardDescription>Staff access requires an authenticator code. An older setup completed in Settings must be enrolled again here.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        {!loaded && <Button disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? 'Checking account…' : 'Retry'}</Button>}
        {loaded && !factorId && <div className="space-y-3"><p className="text-sm text-muted-foreground">Set up an authenticator app, then enter its six-digit code.</p><Button disabled={loading} onClick={() => { void startEnrollment(); }}>{loading ? 'Preparing…' : 'Set up authenticator'}</Button></div>}
        {enrollment && <div className="space-y-3">
          <p className="text-sm">Scan this code with your authenticator app.</p>
          {qrSrc && <img src={qrSrc} alt="Authenticator enrollment QR code" className="w-48 h-48 bg-white p-2 rounded" />}
          <p className="text-xs text-muted-foreground">Or enter this key manually:</p><code className="block break-all p-2 bg-muted rounded">{enrollment.totp.secret}</code>
        </div>}
        {loaded && factorId && <form onSubmit={(event) => { void verify(event); }} className="space-y-4">
          {factors.length > 1 && <label className="block text-sm">Authenticator<select className="block w-full bg-background border rounded p-2" value={factorId} disabled={loading} onChange={(event) => { setFactorId(event.target.value); setCode(''); }}>{factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendly_name || 'Authenticator'}</option>)}</select></label>}
          <label className="block text-sm">Six-digit code<Input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={loading} required /></label>
          <Button type="submit" disabled={loading || !/^\d{6}$/.test(code)}>{loading ? 'Verifying…' : 'Verify and continue'}</Button>
        </form>}
        <p className="text-xs text-muted-foreground">If you have lost access to your authenticator, contact your organization administrator for account recovery.</p>
        <Button variant="outline" disabled={loading || busy.current} onClick={() => { void supabase.auth.signOut(); }}>Sign out</Button>
      </CardContent>
    </Card>
  </div>;
}
