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
    if (syncState.loading || syncState.error) {
      return;
    }

    let isCancelled = false;

    api.getDashboardData(getToken)
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
  }, [getToken, syncState.error, syncState.loading]);

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
        <article className="card">
          <h2>Users</h2>
          <p className="metric">{state.data.users.pagination.total}</p>
          <p className="subtle">Showing {state.data.users.data.length} records</p>
        </article>
        <article className="card">
          <h2>Enrollments</h2>
          <p className="metric">{state.data.enrollments.pagination.total}</p>
          <p className="subtle">Showing {state.data.enrollments.data.length} records</p>
        </article>
        <article className="card">
          <h2>Offers</h2>
          <p className="metric">{state.data.offers.pagination.total}</p>
          <p className="subtle">Showing {state.data.offers.data.length} records</p>
        </article>
      </section>

      <section className="card">
        <h2>Recent Enrollments</h2>
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
    </main>
  );
}
