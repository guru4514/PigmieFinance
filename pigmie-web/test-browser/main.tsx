import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useSyncExternalStore } from "react";
import { RecordCollectionPage } from "../src/features/collections/pages/record-collection-page";
import { CollectionsTodayPage } from "../src/features/collections/pages/collections-today-page";
import { change, current, loanId, useAuth } from "./mocks";
import { AuthenticatorPage } from '../src/features/auth/components/authenticator-page';
import { ProtectedRoute } from '../src/shared/components/auth/protected-route';
import { ReportsPage } from '../src/features/reports/pages/reports-page';
import "../src/index.css";
import "../src/shared/lib/i18n";

Object.defineProperty(navigator, "onLine", {
  configurable: true,
  get: () => current().online,
});
// Never request the user's real location during this synthetic-data check.
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: (_success: unknown, fail: () => void) => fail(),
  },
});
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
export function Harness() {
  const { user } = useAuth();
  useSyncExternalStore((listener) => {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  }, current);
  const state = current();
  return (
    <>
      <div className="p-4 space-y-3 border-b">
        <p>
          Synthetic collection check · {user.fullName} ·{" "}
          {state.online ? "Online" : "Offline"}
        </p>
        <div className="flex gap-4 flex-wrap">
          <button onClick={() => change({ online: !state.online })}>
            Go {state.online ? "offline" : "online"}
          </button>
          <button
            onClick={() => change({ account: state.account === 1 ? 2 : 1, mfaVerified: false, signedIn: true })}
          >
            Switch sample account
          </button>
          <button onClick={() => change({ reject: !state.reject })}>
            {state.reject ? "Allow" : "Reject"} sample server requests
          </button>
          <Link to={`/app/collections/record/${loanId}`}>Record form</Link>
          <Link to="/app/collections/today">Today’s Collections</Link>
          <Link to="/test/protected">Check protected staff access</Link>
          <Link to="/test/reports">Check sample reports</Link>
          <button onClick={() => { void queryClient.invalidateQueries({ queryKey: ['reports'] }); }}>Refresh sample reports</button>
          <button onClick={() => change({ mfaVerified: false, signedIn: true })}>Reset sample verification</button>
        </div>
      </div>
      <Routes>
        <Route path="/test/reports" element={<ReportsPage />} />
        <Route path="/verify-2fa" element={<AuthenticatorPage />} />
        <Route path="/setup-2fa" element={<AuthenticatorPage />} />
        <Route path="/test/protected" element={<ProtectedRoute><p className="p-4">Protected sample staff view</p></ProtectedRoute>} />
        <Route path="/app/dashboard" element={<ProtectedRoute><p className="p-4">Protected sample staff view</p></ProtectedRoute>} />
        <Route path="/login" element={<p className="p-4">Sample account is signed out</p>} />
        <Route
          path="/app/collections/record/:loanId"
          element={<RecordCollectionPage />}
        />
        <Route
          path="/app/collections/today"
          element={<CollectionsTodayPage />}
        />
        <Route
          path="/app/loans/:loanId"
          element={
            <p className="p-4">
              Returned to loan details after durable save. Open Today’s
              Collections to inspect the pending entry.
            </p>
          }
        />
      </Routes>
      <Toaster />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[`/app/collections/record/${loanId}`]}>
      <Harness />
    </MemoryRouter>
  </QueryClientProvider>,
);
