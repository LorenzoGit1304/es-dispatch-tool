import { SignOutButton, useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  AuditLogRow,
  DashboardData,
  OfferRow,
  UserLanguage,
  UserRole,
  UserRow,
  UserStatus,
} from "../types/api";
import { useSyncCurrentUser } from "../hooks/useSyncCurrentUser";

type LoadState = {
  loading: boolean;
  error: string | null;
  data: DashboardData | null;
};

const USER_ROLES: UserRole[] = ["ADMIN", "ES", "AS"];
const USER_STATUSES: UserStatus[] = ["AVAILABLE", "BUSY", "UNAVAILABLE"];
const USER_LANGUAGES: UserLanguage[] = ["English", "Spanish", "Both"];

export function DashboardPage() {
  const { getToken } = useAuth();
  const syncState = useSyncCurrentUser();
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: null,
    data: null,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeUserAction, setActiveUserAction] = useState<number | null>(null);
  const [activeOfferAction, setActiveOfferAction] = useState<number | null>(null);

  const loadDashboard = useCallback(async (role: UserRole) => {
    setState((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));

    try {
      const data = await api.getDashboardData(getToken, role);
      setState({ loading: false, error: null, data });
    } catch (error: unknown) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load dashboard data",
        data: null,
      });
    }
  }, [getToken]);

  useEffect(() => {
    if (syncState.loading || syncState.error || !syncState.user) {
      return;
    }

    loadDashboard(syncState.user.role);
  }, [loadDashboard, syncState.error, syncState.loading, syncState.user]);

  const onUserStatusChange = async (userId: number, status: UserStatus) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActiveUserAction(userId);
    try {
      await api.updateUserStatus(getToken, userId, status);
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to update user status");
    } finally {
      setActiveUserAction(null);
    }
  };

  const onUserRoleChange = async (userId: number, role: UserRole) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActiveUserAction(userId);
    try {
      await api.updateUserRole(getToken, userId, role);
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to update user role");
    } finally {
      setActiveUserAction(null);
    }
  };

  const onMyStatusChange = async (status: UserStatus) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActiveUserAction(syncState.user.id);
    try {
      await api.updateMyStatus(getToken, status);
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to update your status");
    } finally {
      setActiveUserAction(null);
    }
  };

  const onMyLanguageChange = async (language: UserLanguage) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActiveUserAction(syncState.user.id);
    try {
      await api.updateMyLanguage(getToken, language);
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to update your language");
    } finally {
      setActiveUserAction(null);
    }
  };

  const onOfferAction = async (offerId: number, action: "accept" | "reject") => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActiveOfferAction(offerId);
    try {
      if (action === "accept") {
        await api.acceptOffer(getToken, offerId);
      } else {
        await api.rejectOffer(getToken, offerId);
      }
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to process offer");
    } finally {
      setActiveOfferAction(null);
    }
  };

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

  const users = (state.data.users?.data ?? []) as UserRow[];
  const role = state.data.role;
  const currentEsProfile = role === "ES" ? users[0] ?? null : null;
  const auditLog = (state.data.auditLog?.data ?? []) as AuditLogRow[];
  const offers = (state.data.offers?.data ?? []) as OfferRow[];
  const statusCounts = users.reduce<Record<UserStatus, number>>(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    { AVAILABLE: 0, BUSY: 0, UNAVAILABLE: 0 }
  );

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
            <h2>{role === "AS" ? "My Requests" : "Enrollments"}</h2>
            <p className="metric">{state.data.enrollments.pagination.total}</p>
            <p className="subtle">Showing {state.data.enrollments.data.length} records</p>
          </article>
        )}
        {state.data.offers && (
          <article className="card">
            <h2>{role === "ES" ? "My Offers" : "Offers"}</h2>
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

      {role === "ADMIN" && (
        <>
          <section className="card">
            <h2>Maintenance Overview</h2>
            <div className="maintenance-grid">
              <div className="maintenance-stat">
                <span>Available ES Pool</span>
                <strong>{statusCounts.AVAILABLE}</strong>
              </div>
              <div className="maintenance-stat">
                <span>Busy ES Pool</span>
                <strong>{statusCounts.BUSY}</strong>
              </div>
              <div className="maintenance-stat">
                <span>Unavailable Users</span>
                <strong>{statusCounts.UNAVAILABLE}</strong>
              </div>
              <div className="maintenance-stat">
                <span>Recent Audit Events</span>
                <strong>{auditLog.length}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>User Management</h2>
            <p className="subtle">Update status and role assignments for dispatch operators.</p>
            {actionError && <p className="inline-error">{actionError}</p>}
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.name}</td>
                      <td>
                        {syncState.user?.role === "ADMIN" && user.id === syncState.user.id ? (
                          <span className="locked-role-pill" title="You cannot remove your own ADMIN role.">
                            ADMIN (locked)
                          </span>
                        ) : (
                        <select
                          value={user.role}
                          onChange={(event) => onUserRoleChange(user.id, event.target.value as UserRole)}
                          disabled={activeUserAction === user.id}
                        >
                          {USER_ROLES.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                        )}
                      </td>
                      <td>
                        <select
                          value={user.status}
                          onChange={(event) => onUserStatusChange(user.id, event.target.value as UserStatus)}
                          disabled={activeUserAction === user.id}
                        >
                          {USER_STATUSES.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td>{user.last_assigned_at ? new Date(user.last_assigned_at).toLocaleString() : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Audit Log (Recent)</h2>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                    <th>Actor Clerk ID</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                      <td>{entry.action}</td>
                      <td>{entry.entity_type}</td>
                      <td>{entry.entity_id ?? "-"}</td>
                      <td className="mono">{entry.actor_clerk_id ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {role !== "ADMIN" && state.data.enrollments && (
        <section className="card">
          <h2>{role === "AS" ? "My Enrollment Requests" : "Recent Enrollments"}</h2>
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

      {role !== "ADMIN" && state.data.offers && (
        <section className="card">
          <h2>{role === "ES" ? "My Offer Queue" : "Recent Offers"}</h2>
          <ul className="record-list">
            {offers.map((row) => (
              <li key={String(row.id)}>
                <span>#{String(row.id)}</span>
                <span>Enrollment {String(row.enrollment_id ?? "-")}</span>
                <span>{String(row.status ?? "-")}</span>
                {role === "ES" && row.status === "PENDING" && (
                  <span className="offer-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onOfferAction(row.id, "accept")}
                      disabled={activeOfferAction === row.id}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => onOfferAction(row.id, "reject")}
                      disabled={activeOfferAction === row.id}
                    >
                      Reject
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {role === "ES" && currentEsProfile && (
        <section className="card">
          <h2>My ES Controls</h2>
          <p className="subtle">Set your language coverage and availability before receiving requests.</p>
          {actionError && <p className="inline-error">{actionError}</p>}
          <div className="maintenance-grid">
            <label className="control-field">
              <span>Status</span>
              <select
                value={currentEsProfile.status}
                onChange={(event) => onMyStatusChange(event.target.value as UserStatus)}
                disabled={activeUserAction === syncState.user?.id}
              >
                {USER_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="control-field">
              <span>Language</span>
              <select
                value={currentEsProfile.language ?? "English"}
                onChange={(event) => onMyLanguageChange(event.target.value as UserLanguage)}
                disabled={activeUserAction === syncState.user?.id}
              >
                {USER_LANGUAGES.map((language) => (
                  <option key={language} value={language}>{language}</option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}
    </main>
  );
}
