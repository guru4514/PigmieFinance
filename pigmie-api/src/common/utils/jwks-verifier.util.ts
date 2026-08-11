import 'dotenv/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!_jwks) {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }
    _jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return _jwks;
}

export async function verifySupabaseToken(token: string) {
  const { payload } = await jwtVerify(token, getJWKS(), {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    audience: 'authenticated',
  });
  return payload;
}
