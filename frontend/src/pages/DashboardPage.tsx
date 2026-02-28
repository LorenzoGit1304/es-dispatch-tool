import { SignOutButton, useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { DashboardData } from "../types/api";
import { useSyncCurrentUser } from "../hooks/useSyncCurrentUser";

type LoadState = {
  loading: boolean;
  error: string | null;
  data: DashboardData | null;
};

export function DashboardPage() {
  const { getToken } = useAuth();
  const syncState = useSyncCurrentUser();
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    if (syncState.loading || syncState.error || !syncState.user) {
      return;
    }

    let isCancelled = false;

    api.getDashboardData(getToken, syncState.user.role)
      .then((data) => {
        if (!isCancelled) {
          setState({ loading: false, error: null, data });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load dashboard data",
            data: null,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [getToken, syncState.error, syncState.loading, syncState.user]);

  if (syncState.loading) {
    return <p className="status-message">Syncing your user profile...</p>;
  }

  if (syncState.error) {
    return <p className="status-message error">{syncState.error}</p>;
  }

  if (state.loading) {
    return <p className="status-message">Loading dashboard...</p>;
  }

  if (state.error || !state.data) {
    return <p className="status-message error">{state.error ?? "No dashboard data available."}</p>;
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">ES Dispatch</p>
          <h1>Operations Dashboard</h1>
          <p className="subtle">
            Signed in as <strong>{syncState.user?.name}</strong> ({syncState.user?.role})
          </p>
        </div>
        <SignOutButton>
          <button className="btn-secondary" type="button">Sign out</button>
        </SignOutButton>
      </header>

      <section className="grid">
        {state.data.users && (
          <article className="card">
            <h2>Users</h2>
            <p className="metric">{state.data.users.pagination.total}</p>
            <p className="subtle">Showing {state.data.users.data.length} records</p>
          </article>
        )}
        {state.data.enrollments && (
          <article className="card">
            <h2>{state.data.role === "AS" ? "My Requests" : "Enrollments"}</h2>
            <p className="metric">{state.data.enrollments.pagination.total}</p>
            <p className="subtle">Showing {state.data.enrollments.data.length} records</p>
          </article>
        )}
        {state.data.offers && (
          <article className="card">
            <h2>{state.data.role === "ES" ? "My Offers" : "Offers"}</h2>
            <p className="metric">{state.data.offers.pagination.total}</p>
            <p className="subtle">Showing {state.data.offers.data.length} records</p>
          </article>
        )}
        {state.data.auditLog && (
          <article className="card">
            <h2>Audit Events</h2>
            <p className="metric">{state.data.auditLog.pagination.total}</p>
            <p className="subtle">Showing {state.data.auditLog.data.length} records</p>
          </article>
        )}
      </section>

      {state.data.enrollments && (
        <section className="card">
          <h2>{state.data.role === "AS" ? "My Enrollment Requests" : "Recent Enrollments"}</h2>
          <ul className="record-list">
            {state.data.enrollments.data.map((row) => (
              <li key={String(row.id)}>
                <span>#{String(row.id)}</span>
                <span>{String(row.premise_id ?? "-")}</span>
                <span>{String(row.status ?? "-")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.data.offers && (
        <section className="card">
          <h2>{state.data.role === "ES" ? "My Offer Queue" : "Recent Offers"}</h2>
          <ul className="record-list">
            {state.data.offers.data.map((row) => (
              <li key={String(row.id)}>
                <span>#{String(row.id)}</span>
                <span>Enrollment {String(row.enrollment_id ?? "-")}</span>
                <span>{String(row.status ?? "-")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
