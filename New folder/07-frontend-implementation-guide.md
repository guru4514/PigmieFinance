# 07 — Frontend Implementation Guide

## 1. Recap

React 18 + TypeScript, built with Vite, deployed to Cloudflare Pages. Tailwind CSS + shadcn/ui for components. TanStack Query for server state, Zustand for the small amount of genuine client-only state. One codebase serves three experiences — staff/admin, field agent (PWA, offline-first), and customer portal — gated by role-based routing, not three separate apps (`02-architecture-and-tech-stack.md §5`).

## 2. Auth Wiring

The frontend talks to Supabase Auth directly for login/signup/session refresh, and to the Pigmie API for everything else. A thin hook bridges the two:

```tsx
// shared/hooks/useAuth.ts
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get('/auth/me').then((r) => r.data),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  return {
    session,
    user: profileQuery.data as ResolvedUser | undefined,
    isLoading: sessionLoading || (!!session && profileQuery.isLoading),
  };
}
```

Every API call attaches the current Supabase access token automatically, so no call site has to think about auth:

```tsx
// shared/lib/apiClient.ts
export const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_URL });

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) config.headers.Authorization = `Bearer ${data.session.access_token}`;
  return config;
});
```

**Sign-up flow, concretely:** `supabase.auth.signUp({ email, password })` → on success, `POST /organizations` with the org details → the returned profile is what `useAuth()` resolves from that point forward. A user who has signed up with Supabase but hasn't yet called `POST /organizations` sees an "unprovisioned" state and is routed to an onboarding screen, not the dashboard.

## 3. Routing & Role Gating

```tsx
function ProtectedRoute({ allowedRoles, children }: { allowedRoles?: StaffRole[]; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.userType === 'unprovisioned') return <Navigate to="/onboarding" replace />;
  if (allowedRoles && (user.userType !== 'staff' || !allowedRoles.includes(user.role))) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <>{children}</>;
}
```

Route tree (abridged — full tree in `app/routes/`):

```
/signup, /login                          — public
/onboarding                              — authenticated, unprovisioned only (calls POST /organizations)
/2fa-challenge                           — authenticated, staff with 2FA enabled, pre-full-session

/app/dashboard                           — any staff
/app/customers, /app/customers/:id       — agent+
/app/loans, /app/loans/:id, /app/loans/new — agent+ (approve/disburse actions further gated inline by role)
/app/collections/today                   — agent+  (the field "today's route" view)
/app/reports                             — branch_manager+
/app/staff, /app/branches, /app/loan-products, /app/settings — org_admin
/app/audit-log                           — org_admin, accountant (read-only)

/portal/dashboard, /portal/loans/:id     — customer
```

`RoleGate` (a smaller inline sibling of `ProtectedRoute`, same logic, used to hide/show buttons rather than block a whole route) covers cases like the "Write off" button only rendering for `org_admin` on a page every staff role can otherwise view.

## 4. State Management

**Server state — TanStack Query, exclusively.** Every piece of data that ultimately comes from the API (customers, loans, collections, reports) is a query or mutation, never copied into local component state or a global store. This eliminates an entire category of stale-data bugs (e.g., a loan's balance updating after a collection is recorded, but a dashboard card elsewhere still showing the old number) — invalidating the right query key after a mutation is the one thing to get right, rather than manually threading updated values through props or a store.

```tsx
function useLoan(loanId: string) {
  return useQuery({ queryKey: ['loans', loanId], queryFn: () => apiClient.get(`/loans/${loanId}`).then(r => r.data) });
}

function useRecordCollection(loanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordCollectionInput) => apiClient.post('/collections', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans', loanId] });
      queryClient.invalidateQueries({ queryKey: ['collections', 'due-today'] });
    },
  });
}
```

**Client-only state — Zustand, sparingly.** Sidebar open/closed, active filters not yet submitted, and — the one substantial use — offline sync queue status (§8). If it doesn't come from the API and doesn't need to survive a refresh, it's local `useState`; if it's shared across distant components but still doesn't come from the API, it's Zustand. Server data never lives in Zustand.

## 5. Design System Approach

Tailwind's utility classes plus shadcn/ui's copy-in components (not an npm dependency — the components live in `shared/components/ui/` and are edited directly, so there's no version to be behind or a design system to fight). A small `tailwind.config.ts` token set (a handful of brand colors, one type scale, consistent spacing) is defined once and referenced everywhere, specifically to avoid the "every screen invents its own shade of blue" drift that happens when tokens aren't centralized early. Status colors are used consistently and meaningfully across the whole app — `overdue`/`defaulted` in the same warm red everywhere, `paid`/`active` in the same green — since this is a records app where a staff member scanning a list quickly for problems is a real, frequent use case, not an edge case.

## 6. Screen Inventory

**Staff / Admin App**
| Screen | Roles | Notes |
|---|---|---|
| Sign up / Onboarding | public → unprovisioned | Creates the Supabase user, then the organization |
| Login, 2FA challenge | public / partial session | |
| Dashboard | any staff | KPI cards (§`04-api-specification.md §11`), today's due list, recent activity |
| Customers list / detail / create-edit | agent+ | Detail view tabs: Profile, Loans, Documents |
| Loan Products list / create-edit | org_admin | |
| Loans list / detail / new application | agent+ | Detail view tabs: Overview, Schedule, Collections, Documents; approve/disburse/close/write-off/restructure actions inline, each role-gated individually |
| Today's Collection Route | agent+ | The field view — due list for the agent, tap-through to Record Collection |
| Record Collection | agent+ | Amount, method, geo-tag, optional photo — works offline (§8) |
| Cash Deposits list / create / verify | agent+ (create), branch_manager+ (verify) | |
| Reports | branch_manager+ | Dashboard summary, overdue, PAR, collection efficiency, agent performance, CSV export |
| Staff, Branches | org_admin | |
| Settings | org_admin | Org profile, currency/timezone, 2FA management |
| Audit Log | org_admin, accountant (read-only) | Filterable by entity type/date/actor |

**Customer Portal**
| Screen | Notes |
|---|---|
| Login | Supabase auth, same mechanism as staff |
| Dashboard | List of the customer's own loans with status |
| Loan detail | Schedule, payment history, outstanding balance |
| Statement | PDF download |
| Notifications | Read/unread list |

## 7. Forms & Validation

React Hook Form + Zod, with the Zod schema shared conceptually (not literally imported, since frontend and backend are separate repos) with the backend's `class-validator` DTOs — both express the same rules, checked independently on each side. Client-side validation is a UX convenience (fail fast, helpful inline errors); it is never the security boundary, which is always the backend (`06-security-architecture.md §6`).

```tsx
const collectionSchema = z.object({
  amount: z.number().positive('Amount must be greater than zero'),
  collectionMethod: z.enum(['cash', 'cheque', 'other']),
  notes: z.string().optional(),
});

function RecordCollectionForm({ loanId, dueAmount }: { loanId: string; dueAmount: number }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(collectionSchema),
    defaultValues: { amount: dueAmount, collectionMethod: 'cash' as const },
  });
  const { isOnline } = useOnlineStatus();

  const onSubmit = handleSubmit(async (data) => {
    const collection = {
      clientGeneratedId: crypto.randomUUID(),
      loanId,
      ...data,
      collectionDate: todayISODate(),
      collectedAt: new Date().toISOString(),
      ...(await tryGetGeolocation()),
    };
    if (isOnline) {
      try { await apiClient.post('/collections', collection); }
      catch { await queueCollection(collection); } // request failed mid-flight — queue rather than lose it
    } else {
      await queueCollection(collection);
    }
  });

  return <form onSubmit={onSubmit}>{/* fields, wired to register() */}</form>;
}
```

## 8. Offline-First Agent Collection Flow

This is the single most important piece of frontend engineering in the app — agents collect in the field, where connectivity is unreliable, and a collection form that fails to submit without a network is a non-starter for the core use case.

**Local queue (IndexedDB, via `idb`):**

```tsx
// shared/offline/collectionQueue.ts
const dbPromise = openDB('pigmie-offline', 1, {
  upgrade(db) { db.createObjectStore('pending-collections', { keyPath: 'clientGeneratedId' }); },
});

export async function queueCollection(collection: PendingCollection) {
  const db = await dbPromise;
  await db.put('pending-collections', { ...collection, queuedAt: Date.now() });
  await requestBackgroundSync();
}

export async function getPendingCollections() {
  return (await dbPromise).getAll('pending-collections');
}

export async function clearSyncedCollections(ids: string[]) {
  const db = await dbPromise;
  const tx = db.transaction('pending-collections', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}
```

**Sync, triggered three ways** (not just one, deliberately — the Background Sync API is not reliably available on iOS Safari, which a meaningful share of agents will be using):

```tsx
// 1. Background Sync API, where supported
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-collections') event.waitUntil(syncPendingCollections());
});

// 2. Browser 'online' event
window.addEventListener('online', syncPendingCollections);

// 3. On every app foreground/mount — the fallback that makes iOS Safari fine too
useEffect(() => { syncPendingCollections(); }, []);

async function syncPendingCollections() {
  const pending = await getPendingCollections();
  if (pending.length === 0) return;
  const { data } = await apiClient.post('/collections/sync', { collections: pending });
  const succeeded = data.results.filter((r: any) => r.status !== 'error').map((r: any) => r.clientGeneratedId);
  await clearSyncedCollections(succeeded);
  useOfflineQueueStore.getState().setPendingCount((await getPendingCollections()).length);
  // items that errored (e.g. "loan is not active") stay queued and visible,
  // not silently retried forever — surfaced to the agent to resolve manually
}
```

`clientGeneratedId`, generated with `crypto.randomUUID()` at the moment of collection (not at sync time), is what makes this whole flow safe to retry — see `03-database-schema.md §4.8` and `04-api-specification.md §9` for the idempotent-upsert behavior on the backend side.

**UI contract:** the agent always sees an explicit, honest sync-status indicator (`Zustand` store, `useOfflineQueueStore`) — "3 pending, will sync automatically" — rather than a spinner that implies real-time confirmation the app can't actually guarantee. A collection recorded offline shows in the agent's own local list immediately (optimistic), tagged visually as "pending sync" until the server confirms it.

**Geolocation and photo** are captured at record time regardless of connectivity (`navigator.geolocation`, device camera via a file input with `capture="environment"`), stored in the same IndexedDB queue entry, and uploaded as part of the sync — the photo itself queues as a Blob in IndexedDB alongside the metadata, uploaded to Supabase Storage only once connectivity returns and a signed upload URL can be fetched.

**PWA manifest and service worker** are configured via `vite-plugin-pwa` in `injectManifest` mode (not `generateSW`), specifically because the custom `sync` event listener above needs to live in a service worker file this project controls directly rather than one that's fully generated.

## 9. Accessibility & Internationalization

- Every interactive element reachable by keyboard; form errors announced via `aria-live`; color is never the only signal for status (an icon or label accompanies every status color).
- `react-i18next` from the start, even though English/Hindi-only ships in Phase 1 — retrofitting i18n after strings are scattered through components is far more expensive than starting with `t('collections.recordButton')` instead of a literal string on day one. Regional-language support (`01-product-overview-and-scope.md §7`) is then a translation-file exercise, not a refactor.

## 10. What's Deliberately Not Built Yet

No native mobile shell — the PWA covers the offline/field-agent need without one. If a native app is wanted later (app-store presence, deeper OS integration), it's an additive project against the same backend API, not a rebuild — nothing in this frontend architecture blocks that path, since the API doesn't know or care what kind of client is calling it.
