import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { apiClient } from '../lib/api-client';
import { ResolvedUser } from '../types';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setSessionLoading(false);
    });
    
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get('/auth/me').then((r) => r.data),
    enabled: !!session,
    staleTime: 5 * 60_000,
    retry: false
  });

  const enroll2FA = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
    });
    if (error) throw error;
    return data;
  };

  const verify2FASetup = async (factorId: string, code: string) => {
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) throw error;
    return data;
  };

  const challenge2FA = async (factorId: string, code: string) => {
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) throw error;
    return data;
  };

  return {
    session,
    user: profileQuery.data as ResolvedUser | undefined,
    isLoading: sessionLoading || (!!session && profileQuery.isLoading),
    error: profileQuery.error,
    enroll2FA,
    verify2FASetup,
    challenge2FA,
  };
}
