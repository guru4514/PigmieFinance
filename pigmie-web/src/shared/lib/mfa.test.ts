import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSecondFactor, listAuthenticators, enrollAuthenticator, verifyAuthenticator } from './mfa';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({ supabase: { auth: { getSession: vi.fn(), mfa: { listFactors: vi.fn(), enroll: vi.fn(), challengeAndVerify: vi.fn() } } } }));
const token = (payload: unknown) => `synthetic.${btoa(JSON.stringify(payload))}.synthetic`;
const getSession = vi.mocked(supabase.auth.getSession);
const session = (id = 'account-a') => ({ data: { session: { user: { id } } }, error: null });
beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue(session() as Awaited<ReturnType<typeof getSession>>);
});
describe('Authenticator session handling', () => {
  it('treats missing, malformed and unknown assurance as unverified', () => {
    for (const value of [undefined, '', 'invalid', token({ aal: 'aal1' }), token({ aal: 'unknown' }), token(null)]) expect(hasSecondFactor(value)).toBe(false);
    expect(hasSecondFactor(token({ aal: 'aal2' }))).toBe(true);
  });
  it('uses the current account for factor lookup and returns its verified authenticators', async () => {
    const factors = [{ id: 'factor', factor_type: 'totp' as const, status: 'verified' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
    vi.mocked(supabase.auth.mfa.listFactors).mockResolvedValue({ data: { all: factors, totp: factors, phone: [], webauthn: [] }, error: null } as Awaited<ReturnType<typeof supabase.auth.mfa.listFactors>>);
    expect(await listAuthenticators('account-a')).toEqual(factors);
    expect(getSession).toHaveBeenCalledTimes(2);
  });
  it('does not ask for factors after the account changed', async () => {
    getSession.mockResolvedValue(session('account-b') as Awaited<ReturnType<typeof getSession>>);
    await expect(listAuthenticators('account-a')).rejects.toThrow('account changed');
    expect(supabase.auth.mfa.listFactors).not.toHaveBeenCalled();
  });
  it('discards an enrollment response from an account that changed while it was loading', async () => {
    getSession.mockResolvedValueOnce(session() as Awaited<ReturnType<typeof getSession>>).mockResolvedValueOnce(session('account-b') as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(supabase.auth.mfa.enroll).mockResolvedValue({ data: { type: 'totp', id: 'factor', totp: { secret: 'SYNTHETIC', qr_code: 'data:image/svg+xml;utf-8,<svg/>', uri: 'otpauth://synthetic' } }, error: null });
    await expect(enrollAuthenticator('account-a')).rejects.toThrow('account changed');
  });
  it('does not verify a malformed code', async () => {
    await expect(verifyAuthenticator('account-a', 'factor', '12345x')).rejects.toThrow('six-digit');
    expect(supabase.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it('requires the provider result to establish second-factor assurance', async () => {
    vi.mocked(supabase.auth.mfa.challengeAndVerify).mockResolvedValue({ data: { access_token: token({ aal: 'aal1' }) }, error: null } as Awaited<ReturnType<typeof supabase.auth.mfa.challengeAndVerify>>);
    await expect(verifyAuthenticator('account-a', 'factor', '123456')).rejects.toThrow('second-factor');
  });
  it('accepts a verified provider session for the same account', async () => {
    const data = { access_token: token({ aal: 'aal2' }) };
    vi.mocked(supabase.auth.mfa.challengeAndVerify).mockResolvedValue({ data, error: null } as Awaited<ReturnType<typeof supabase.auth.mfa.challengeAndVerify>>);
    expect(await verifyAuthenticator('account-a', 'factor', '123456')).toEqual(data);
    expect(supabase.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor', code: '123456' });
  });
  it('propagates provider failures rather than granting a verified state', async () => {
    vi.mocked(supabase.auth.mfa.listFactors).mockRejectedValue(new Error('synthetic provider failure'));
    await expect(listAuthenticators('account-a')).rejects.toThrow('provider failure');
    expect(hasSecondFactor(undefined)).toBe(false);
  });
});
