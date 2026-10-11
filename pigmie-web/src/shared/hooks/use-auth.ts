import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { apiClient } from '../lib/api-client';
import { ResolvedUser } from '../types';
import { hasSecondFactor } from '../lib/mfa';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let eventReceived = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!active || eventReceived) return;
      setSession(data.session);
      setSessionLoading(false);
    }).catch(() => {
      if (active && !eventReceived) { setSession(null); setSessionLoading(false); }
    });
    
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      eventReceived = true;
      setSession(s);
      setSessionLoading(false);
    });
    
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const profileQuery = useQuery({
    queryKey: ['auth', 'me', session?.user.id],
    queryFn: () => apiClient.get('/auth/me', { expectedAuthUserId: session?.user.id }).then((r) => r.data),
    enabled: !!session,
    staleTime: 5 * 60_000,
    retry: false
  });

  return {
    session,
    isMfaVerified: hasSecondFactor(session?.access_token),
    user: session ? profileQuery.data as ResolvedUser | undefined : undefined,
    isLoading: sessionLoading || (!!session && profileQuery.isLoading),
    error: profileQuery.error,
  };
}
