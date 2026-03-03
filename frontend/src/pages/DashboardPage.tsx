import { SignOutButton, useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { playNotificationSound } from "../lib/soundNotifications";
import type {
  AuditLogRow,
  DashboardData,
  EnrollmentRow,
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
const AS_TIMESLOTS = [
  "9:00 AM - 11:00 AM",
  "10:00 AM - 12:00 PM",
  "11:00 AM - 1:00 PM",
  "12:00 PM - 2:00 PM",
  "1:00 PM - 3:00 PM",
  "2:00 PM - 4:00 PM",
  "3:00 PM - 5:00 PM",
  "4:00 PM - 6:00 PM",
  "5:00 PM - 7:00 PM",
] as const;

const formatTimeslot = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const getAsGuidance = (row: EnrollmentRow): string => {
  const assignedEs = row.assigned_es_name ?? (row.assigned_es_id ? `ES #${row.assigned_es_id}` : null);
  const offeredEs = row.current_offer_es_name ?? (row.current_offer_es_id ? `ES #${row.current_offer_es_id}` : null);
  const attempts = row.offer_attempt_count ?? 0;
  const pendingOffers = row.pending_offer_count ?? 0;

  if (row.status === "ASSIGNED" && assignedEs && row.es_current_enrollment_id && row.es_current_enrollment_id !== row.id) {
    return `${assignedEs} is currently working enrollment #${row.es_current_enrollment_id} (${row.es_current_premise_id ?? "another premise"}). Your request is queued.`;
  }
  if (row.status === "ASSIGNED" && assignedEs) {
    return `${assignedEs} accepted the request. Transfer the customer now.`;
  }
  if (row.status === "WAITING" && row.current_offer_status === "REJECTED" && pendingOffers === 0) {
    return "All ES rejected this request. Please schedule the customer for another day.";
  }
  if (row.status === "WAITING" && offeredEs && attempts > 1) {
    return `Request reassigned to ${offeredEs}. Please wait for confirmation.`;
  }
  if (row.status === "WAITING" && offeredEs) {
    return `Request sent to ${offeredEs}. Please wait for confirmation.`;
  }
  if (row.status === "COMPLETED") {
    return "Completed by ES.";
  }

  return "-";
};

const getEsWorkStatus = (row: EnrollmentRow): string => {
  if (row.status === "COMPLETED") {
    return "Completed";
  }

  if (row.status === "ASSIGNED") {
    if (row.es_current_enrollment_id === row.id) {
      return "ES is currently working this enrollment";
    }
    if (row.es_current_enrollment_id) {
      return `ES is busy on enrollment #${row.es_current_enrollment_id}`;
    }
    return "Assigned, pending ES start";
  }

  if (row.status === "WAITING" && (row.pending_offer_count ?? 0) > 0) {
    return "Waiting for ES response";
  }

  if (row.status === "WAITING" && row.current_offer_status === "REJECTED" && (row.pending_offer_count ?? 0) === 0) {
    return "No ES currently available";
  }

  return "-";
};

const getEsWorkStatusBadgeClass = (row: EnrollmentRow): string => {
  if (row.status === "COMPLETED") return "status-badge complete";
  if (row.status === "ASSIGNED" && row.es_current_enrollment_id === row.id) return "status-badge active";
  if (row.status === "ASSIGNED" && row.es_current_enrollment_id) return "status-badge queued";
  if (row.status === "ASSIGNED") return "status-badge pending";
  if (row.status === "WAITING" && (row.pending_offer_count ?? 0) > 0) return "status-badge waiting";
  if (row.status === "WAITING" && row.current_offer_status === "REJECTED" && (row.pending_offer_count ?? 0) === 0) {
    return "status-badge blocked";
  }
  return "status-badge";
};

const getEsDisplay = (row: EnrollmentRow): string => {
  if (row.assigned_es_name) {
    return row.assigned_es_name;
  }
  if (row.assigned_es_id) {
    return `ES #${row.assigned_es_id}`;
  }
  if (row.current_offer_es_name) {
    return row.current_offer_es_name;
  }
  if (row.current_offer_es_id) {
    return `ES #${row.current_offer_es_id}`;
  }
  return "-";
};

export function DashboardPage() {
  const { getToken } = useAuth();
  const syncState = useSyncCurrentUser();
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: null,
    data: null,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [activeUserAction, setActiveUserAction] = useState<number | null>(null);
  const [activeOfferAction, setActiveOfferAction] = useState<number | null>(null);
  const [activeEnrollmentAction, setActiveEnrollmentAction] = useState<number | null>(null);
  const [activeStartAction, setActiveStartAction] = useState<number | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem("dispatch_sound_enabled") !== "false";
  });
  const [requestForm, setRequestForm] = useState({
    premiseId: "",
    timeslot: "",
  });
  const previousAsEnrollmentsRef = useRef<EnrollmentRow[] | null>(null);
  const previousEsOffersRef = useRef<OfferRow[] | null>(null);

  const loadDashboard = useCallback(async (role: UserRole, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setState((previous) => ({
        ...previous,
        loading: true,
        error: null,
      }));
    } else {
      setState((previous) => ({
        ...previous,
        error: null,
      }));
    }

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

  useEffect(() => {
    if (syncState.loading || syncState.error || !syncState.user) {
      return;
    }

    if (syncState.user.role !== "AS" && syncState.user.role !== "ES") {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadDashboard(syncState.user!.role, { silent: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadDashboard, syncState.error, syncState.loading, syncState.user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("dispatch_sound_enabled", soundEnabled ? "true" : "false");
  }, [soundEnabled]);

  useEffect(() => {
    if (!soundEnabled || !state.data || state.data.role !== "ES") {
      return;
    }

    const currentOffers = (state.data.offers?.data ?? []) as OfferRow[];
    if (!previousEsOffersRef.current) {
      previousEsOffersRef.current = currentOffers;
      return;
    }

    const previousPendingIds = new Set(
      previousEsOffersRef.current.filter((offer) => offer.status === "PENDING").map((offer) => offer.id)
    );
    const hasNewPendingOffer = currentOffers.some(
      (offer) => offer.status === "PENDING" && !previousPendingIds.has(offer.id)
    );

    previousEsOffersRef.current = currentOffers;

    if (!hasNewPendingOffer) {
      return;
    }

    playNotificationSound("es_new_offer").catch(() => {});
    setActionSuccess("New enrollment request received. Please review your offer queue.");
  }, [soundEnabled, state.data]);

  useEffect(() => {
    if (!soundEnabled || !state.data || state.data.role !== "AS") {
      return;
    }

    const currentEnrollments = (state.data.enrollments?.data ?? []) as EnrollmentRow[];
    if (!previousAsEnrollmentsRef.current) {
      previousAsEnrollmentsRef.current = currentEnrollments;
      return;
    }

    const previousById = new Map(previousAsEnrollmentsRef.current.map((row) => [row.id, row]));
    previousAsEnrollmentsRef.current = currentEnrollments;

    for (const row of currentEnrollments) {
      const previousRow = previousById.get(row.id);
      if (!previousRow) {
        continue;
      }

      if (previousRow.status === "WAITING" && row.status === "ASSIGNED") {
        playNotificationSound("as_offer_accepted").catch(() => {});
        setActionSuccess(getAsGuidance(row));
        return;
      }

      const offerReassigned =
        row.status === "WAITING" &&
        previousRow.current_offer_es_id !== row.current_offer_es_id &&
        (row.offer_attempt_count ?? 0) > (previousRow.offer_attempt_count ?? 0);
      if (offerReassigned) {
        playNotificationSound("as_offer_reassigned").catch(() => {});
        setActionSuccess(getAsGuidance(row));
        return;
      }

      const allRejectedNow =
        row.status === "WAITING" &&
        (previousRow.pending_offer_count ?? 0) > 0 &&
        (row.pending_offer_count ?? 0) === 0 &&
        row.current_offer_status === "REJECTED";
      if (allRejectedNow) {
        playNotificationSound("as_all_rejected").catch(() => {});
        setActionSuccess(getAsGuidance(row));
        return;
      }

      if (previousRow.status === "ASSIGNED" && row.status === "COMPLETED") {
        playNotificationSound("as_completed").catch(() => {});
        setActionSuccess(getAsGuidance(row));
        return;
      }
    }
  }, [soundEnabled, state.data]);

  const onUserStatusChange = async (userId: number, status: UserStatus) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
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
    setActionSuccess(null);
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
    setActionSuccess(null);
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
    setActionSuccess(null);
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
    setActionSuccess(null);
    setActiveOfferAction(offerId);
    try {
      if (action === "accept") {
        await api.acceptOffer(getToken, offerId);
        setActionSuccess("Offer accepted.");
      } else {
        await api.rejectOffer(getToken, offerId);
        setActionSuccess("Offer rejected and reassigned.");
      }
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to process offer");
    } finally {
      setActiveOfferAction(null);
    }
  };

  const onCreateTransferRequest = async () => {
    if (!syncState.user) {
      return;
    }

    const premiseId = requestForm.premiseId.trim();
    const selectedTimeslot = requestForm.timeslot.trim();
    if (!premiseId || !selectedTimeslot) {
      setActionError("Premise ID and timeslot are required.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsSubmittingRequest(true);
    try {
      await api.createTransferRequest(getToken, {
        premise_id: premiseId,
        timeslot: selectedTimeslot,
      });
      setRequestForm({ premiseId: "", timeslot: "" });
      setActionSuccess("Transfer request created.");
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to create transfer request");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const onCompleteEnrollment = async (enrollmentId: number) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setActiveEnrollmentAction(enrollmentId);
    try {
      await api.completeEnrollment(getToken, enrollmentId);
      setActionSuccess("Enrollment marked as completed.");
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to complete enrollment");
    } finally {
      setActiveEnrollmentAction(null);
    }
  };

  const onStartEnrollmentWork = async (enrollmentId: number) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setActiveStartAction(enrollmentId);
    try {
      await api.startEnrollmentWork(getToken, enrollmentId);
      setActionSuccess(`You are now marked as working enrollment #${enrollmentId}.`);
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to mark current enrollment");
    } finally {
      setActiveStartAction(null);
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
  const enrollments = (state.data.enrollments?.data ?? []) as EnrollmentRow[];
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
        <div className="top-bar-actions">
          <button
            className="btn-secondary"
            type="button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
          >
            Sound: {soundEnabled ? "On" : "Off"}
          </button>
          <SignOutButton>
            <button className="btn-secondary" type="button">Sign out</button>
          </SignOutButton>
        </div>
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

      {actionSuccess && <p className="inline-success">{actionSuccess}</p>}
      {actionError && <p className="inline-error">{actionError}</p>}

      {role === "AS" && (
        <section className="card">
          <h2>Create Transfer Request</h2>
          <p className="subtle">Submit a premise and appointment slot to dispatch to available ES users.</p>
          <div className="request-form">
            <label className="control-field">
              <span>Premise ID</span>
              <input
                type="text"
                value={requestForm.premiseId}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, premiseId: event.target.value }))}
                placeholder="TEST-PREMISE-001"
              />
            </label>
            <label className="control-field">
              <span>Timeslot</span>
              <select
                value={requestForm.timeslot}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, timeslot: event.target.value }))}
              >
                <option value="">Select a slot</option>
                {AS_TIMESLOTS.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={onCreateTransferRequest}
              disabled={isSubmittingRequest}
            >
              {isSubmittingRequest ? "Submitting..." : "Create Request"}
            </button>
          </div>
        </section>
      )}

      {role === "AS" && state.data.enrollments && (
        <section className="card">
          <h2>My Enrollment Requests</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Premise</th>
                  <th>Timeslot</th>
                  <th>Status</th>
                  <th>Assigned / Offered ES</th>
                  <th>ES Work Status</th>
                  <th>Guidance</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.premise_id}</td>
                    <td>{formatTimeslot(row.timeslot)}</td>
                    <td>{row.status}</td>
                    <td>{getEsDisplay(row)}</td>
                    <td>
                      <span className={getEsWorkStatusBadgeClass(row)}>{getEsWorkStatus(row)}</span>
                    </td>
                    <td className="prompt-note">{getAsGuidance(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {role === "ES" && state.data.enrollments && (
        <section className="card">
          <h2>My Assigned Enrollments</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Premise</th>
                  <th>Timeslot</th>
                  <th>Status</th>
                  <th>Requested By</th>
                  <th>Current Work</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.premise_id}</td>
                    <td>{formatTimeslot(row.timeslot)}</td>
                    <td>{row.status}</td>
                    <td>{row.requested_by_name ?? row.requested_by}</td>
                    <td>
                      {row.es_current_enrollment_id === row.id ? (
                        <span className="locked-role-pill">Currently Working</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onStartEnrollmentWork(row.id)}
                          disabled={row.status !== "ASSIGNED" || activeStartAction === row.id}
                        >
                          Set Current
                        </button>
                      )}
                    </td>
                    <td>
                      {row.status === "ASSIGNED" ? (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => onCompleteEnrollment(row.id)}
                          disabled={activeEnrollmentAction === row.id}
                        >
                          Mark Completed
                        </button>
                      ) : (
                        <span className="subtle">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
