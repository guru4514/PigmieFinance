import { useSyncExternalStore } from "react";

export const loanId = "00000000-0000-4000-8000-000000000007";
const orgId = "00000000-0000-4000-8000-000000000002";
let state = { account: 1, online: false, collected: 0, reject: false, mfaVerified: false, signedIn: true };
const factors = new Map<number, string>();
const fakeToken = () => `synthetic.${btoa(JSON.stringify({ sub: identity().authId, aal: state.mfaVerified ? 'aal2' : 'aal1' }))}.synthetic`;
const listeners = new Set<() => void>();
const recorded = new Map<string, Record<string, unknown>>();
export function change(values: Partial<typeof state>) {
  state = { ...state, ...values };
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event(state.online ? "online" : "offline"));
}
export function current() {
  return state;
}
function identity() {
  return {
    authId:
      state.account === 1
        ? "00000000-0000-4000-8000-000000000001"
        : "00000000-0000-4000-8000-000000000004",
    staffId:
      state.account === 1
        ? "00000000-0000-4000-8000-000000000003"
        : "00000000-0000-4000-8000-000000000005",
  };
}
const users = [1, 2].map((account) => ({
  userType: "staff",
  id:
    account === 1
      ? "00000000-0000-4000-8000-000000000003"
      : "00000000-0000-4000-8000-000000000005",
  organizationId: orgId,
  fullName: `Sample agent ${account}`,
  role: "agent",
  branchId: null,
  twoFactorEnabled: false,
}));
function user() {
  return users[state.account - 1];
}
export function useAuth() {
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, current);
  return {
    session: state.signedIn ? { user: { id: identity().authId }, access_token: fakeToken() } : null,
    user: user(),
    isLoading: false,
    isMfaVerified: state.mfaVerified,
    error: null,
  };
}
export const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: state.signedIn ? { user: { id: identity().authId }, access_token: fakeToken() } : null },
      error: null,
    }),
    signOut: async () => { change({ signedIn: false, mfaVerified: false }); return { error: null }; },
    mfa: {
      listFactors: async () => ({ data: { totp: factors.has(state.account) ? [{ id: factors.get(state.account), status: 'verified', factor_type: 'totp', friendly_name: 'Synthetic authenticator' }] : [] }, error: null }),
      enroll: async () => {
        const id = crypto.randomUUID();
        return { data: { type: 'totp', id, totp: { secret: 'SYNTHETIC-NOT-A-REAL-SECRET', qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/><text x="20" y="100">Synthetic QR</text></svg>' } }, error: null };
      },
      challengeAndVerify: async ({ factorId, code }: { factorId: string; code: string }) => {
        if (code !== '123456') return { data: null, error: new Error('Synthetic invalid authenticator code') };
        factors.set(state.account, factorId); change({ mfaVerified: true });
        return { data: { access_token: fakeToken() }, error: null };
      },
    },
  },
  storage: {
    from: () => ({
      upload: async (path: string) => ({ data: { path }, error: null }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://synthetic.invalid/${path}` },
      }),
    }),
  },
};
function check(expected?: string) {
  if (expected && expected !== identity().authId)
    throw new Error("Account changed");
}
export const apiClient = {
  get: async (url: string, config?: { expectedAuthUserId?: string }) => {
    check(config?.expectedAuthUserId);
    if (url === "/auth/me") return { data: user() };
    if (url.startsWith('/reports/')) {
      if (state.reject) throw new Error('Synthetic report failure');
      if (url.startsWith('/reports/portfolio-at-risk')) return { data: { par_1: 0.25, par_30: 0.1, par_90: 0 } };
      if (url.startsWith('/reports/collection-efficiency')) return { data: { data: [{ staff_id: 'sample-agent', agent_name: 'Synthetic Agent', total_due: 100.5, total_collected: 75.25, efficiency_percent: 74.88 }] } };
      if (url.startsWith('/reports/agent-performance')) return { data: { data: [{ staff_id: 'sample-agent', agent_name: 'Synthetic Agent', collections_made: 3, total_collected: 200.25, customers_assigned: 2 }] } };
      throw new Error('Unsupported synthetic report route');
    }
    return {
      data: [
        {
          loanId,
          loanCode: "LN-SAMPLE",
          customer: {
            fullName: "Synthetic borrower",
            phone: "0000000000",
            address: "Sample address",
          },
          todayExpected: 500 - state.collected,
          totalRemaining: 500 - state.collected,
          overdueAmount: 0,
          collectedToday: state.collected,
          visitedToday: state.collected > 0,
        },
      ],
    };
  },
  post: async (
    _url: string,
    payload: Record<string, unknown>,
    config?: { expectedAuthUserId?: string },
  ) => {
    check(config?.expectedAuthUserId);
    if (!state.online) throw new Error("Synthetic offline mode");
    if (state.reject)
      throw new Error("Synthetic server rejection; record retained");
    const id = String(payload.clientGeneratedId);
    const existing = recorded.get(id);
    if (existing)
      return { data: { status: "duplicate", collection: existing } };
    const collection = {
      ...payload,
      id: crypto.randomUUID(),
      organizationId: orgId,
      collectedById: identity().staffId,
      receiptNumber: "RCP-SYNTHETIC",
    };
    recorded.set(id, collection);
    change({ collected: state.collected + Number(payload.amount) });
    return { data: { status: "created", collection } };
  },
};
