import { supabase } from './supabase';

/** UI hint only. The API verifies the token signature and enforces assurance. */
export function hasSecondFactor(token?: string): boolean {
  if (!token) return false;
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return false;
    const payload: unknown = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload === 'object' && payload !== null && 'aal' in payload && payload.aal === 'aal2';
  } catch { return false; }
}

export async function requireSameAccount(authUserId: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== authUserId) throw new Error('Your account changed. Please restart verification');
}

export async function listAuthenticators(authUserId: string) {
  await requireSameAccount(authUserId);
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  if (!data) throw new Error('Could not load your authenticators');
  await requireSameAccount(authUserId);
  return data.totp;
}

export async function enrollAuthenticator(authUserId: string) {
  await requireSameAccount(authUserId);
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Pigmie ${crypto.randomUUID()}` });
  if (error) throw error;
  if (!data || data.type !== 'totp' || !data.totp.secret || !data.id) throw new Error('Authenticator enrollment was incomplete');
  await requireSameAccount(authUserId);
  return data;
}

export async function verifyAuthenticator(authUserId: string, factorId: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('Enter a six-digit authenticator code');
  await requireSameAccount(authUserId);
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
  await requireSameAccount(authUserId);
  if (!data || !hasSecondFactor(data.access_token)) throw new Error('Verification did not establish a second-factor session');
  return data;
}
