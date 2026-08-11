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

  return {
    session,
    user: profileQuery.data as ResolvedUser | undefined,
    isLoading: sessionLoading || (!!session && profileQuery.isLoading),
    error: profileQuery.error,
  };
}
