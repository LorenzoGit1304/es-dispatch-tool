import { SignOutButton, useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, api } from "../lib/api";
import { playNotificationSound, setNotificationVolume } from "../lib/soundNotifications";
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

type ToastItem = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
} | null;

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

const getAgeMinutes = (createdAt: string): number => {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
};

const getAdminRiskState = (
  row: EnrollmentRow
): { label: string; className: string; guidance: string; severity: number } | null => {
  const ageMinutes = getAgeMinutes(row.created_at);

  if (row.status === "WAITING" && row.current_offer_status === "REJECTED" && (row.pending_offer_count ?? 0) === 0) {
    return {
      label: "Uncovered",
      className: "status-badge blocked",
      guidance: "No pending offers remain. Re-offer to an assignable ES or schedule for another day.",
      severity: 4,
    };
  }

  if (row.status === "ASSIGNED" && row.assigned_es_id && !row.es_current_enrollment_id && ageMinutes >= 10) {
    return {
      label: "Needs Start",
      className: "status-badge queued",
      guidance: "An ES accepted this enrollment but has not marked it as current work yet.",
      severity: 3,
    };
  }

  if (
    row.status === "ASSIGNED" &&
    row.es_current_enrollment_id &&
    row.es_current_enrollment_id !== row.id &&
    ageMinutes >= 20
  ) {
    return {
      label: "Queued Behind Work",
      className: "status-badge waiting",
      guidance: `Assigned ES is still working enrollment #${row.es_current_enrollment_id}. Monitor for delay or re-balance if needed.`,
      severity: 2,
    };
  }

  if (row.status === "WAITING" && ageMinutes >= 15) {
    return {
      label: "Aging Queue",
      className: ageMinutes >= 30 ? "status-badge blocked" : "status-badge queued",
      guidance: "This request has been waiting longer than expected. Review its offer path.",
      severity: ageMinutes >= 30 ? 3 : 2,
    };
  }

  return null;
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
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const syncState = useSyncCurrentUser();
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: null,
    data: null,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activeUserAction, setActiveUserAction] = useState<number | null>(null);
  const [activeOfferAction, setActiveOfferAction] = useState<number | null>(null);
  const [activeEnrollmentAction, setActiveEnrollmentAction] = useState<number | null>(null);
  const [activeStartAction, setActiveStartAction] = useState<number | null>(null);
  const [activeReofferAction, setActiveReofferAction] = useState<number | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [soundVolume, setSoundVolume] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 85;
    }
    const stored = Number(window.localStorage.getItem("dispatch_sound_volume"));
    return Number.isFinite(stored) ? Math.max(0, Math.min(100, stored)) : 85;
  });
  const [requestForm, setRequestForm] = useState({
    premiseId: "",
    timeslot: "",
    language: "English" as UserLanguage,
  });
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const previousAsEnrollmentsRef = useRef<EnrollmentRow[] | null>(null);
  const previousEsOffersRef = useRef<OfferRow[] | null>(null);
  const [adminEnrollmentSearch, setAdminEnrollmentSearch] = useState("");
  const [adminEnrollmentStatusFilter, setAdminEnrollmentStatusFilter] = useState<
    "ALL" | "WAITING" | "ASSIGNED" | "COMPLETED"
  >("ALL");
  const [adminUserRoleFilter, setAdminUserRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [adminUserStatusFilter, setAdminUserStatusFilter] = useState<"ALL" | UserStatus>("ALL");
  const [adminUserLanguageFilter, setAdminUserLanguageFilter] = useState<"ALL" | UserLanguage>("ALL");
  const [asStatusFilter, setAsStatusFilter] = useState<"ALL" | "WAITING" | "ASSIGNED" | "COMPLETED">("ALL");
  const [asPremiseSearch, setAsPremiseSearch] = useState("");
  const [esOfferFilter, setEsOfferFilter] = useState<"ALL" | "PENDING">("ALL");
  const [esAssignmentFilter, setEsAssignmentFilter] = useState<"ALL" | "ACTIVE">("ALL");
  const [esPremiseSearch, setEsPremiseSearch] = useState("");
  const [reofferTargetByEnrollment, setReofferTargetByEnrollment] = useState<Record<number, string>>({});

  const handleActionError = (error: unknown, fallbackMessage: string) => {
    const message = error instanceof Error ? error.message : fallbackMessage;
    setActionError(message);
    pushToast("error", message);

    if (error instanceof ApiRequestError && (error.status === 401 || error.code === "UNAUTHORIZED")) {
      setSessionWarning("Your session expired or became invalid. Please sign in again.");
    }
  };

  const pushToast = useCallback((tone: ToastItem["tone"], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  }, []);

  const copyText = useCallback(async (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || String(value).trim().length === 0) {
      pushToast("error", `No ${label} to copy.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(String(value));
      pushToast("success", `${label} copied.`);
    } catch {
      pushToast("error", `Could not copy ${label}.`);
    }
  }, [pushToast]);

  const openConfirm = (title: string, message: string, onConfirm: () => Promise<void>) => {
    setConfirmState({ title, message, onConfirm });
  };

  const showBrowserNotification = (title: string, body: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    const notification = new Notification(title, {
      body,
      tag: "es-dispatch-new-offer",
    });

    window.setTimeout(() => {
      notification.close();
    }, 8000);
  };

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
      if (error instanceof ApiRequestError && (error.status === 401 || error.code === "UNAUTHORIZED")) {
        setSessionWarning("Your session expired or became invalid. Please sign in again.");
      }
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
    if (!isLoaded) {
      return;
    }
    if (!isSignedIn) {
      setSessionWarning("Session invalidated in the background. Please sign in again.");
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (syncState.loading || syncState.error || syncState.user?.role !== "ES") {
      return;
    }

    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [syncState.error, syncState.loading, syncState.user]);

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
    window.localStorage.setItem("dispatch_sound_volume", String(soundVolume));
    setNotificationVolume(soundVolume / 100);
  }, [soundVolume]);

  useEffect(() => {
    if (soundVolume <= 0 || !state.data || state.data.role !== "ES") {
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
    pushToast("info", "New enrollment request received. Please review your offer queue.");
    const newestPendingOffer = currentOffers.find(
      (offer) => offer.status === "PENDING" && !previousPendingIds.has(offer.id)
    );
    if (newestPendingOffer) {
      showBrowserNotification(
        "New ES Enrollment Request",
        `Offer #${newestPendingOffer.id} for enrollment #${newestPendingOffer.enrollment_id} is waiting for your response.`
      );
    }
  }, [pushToast, soundVolume, state.data]);

  useEffect(() => {
    if (soundVolume <= 0 || !state.data || state.data.role !== "AS") {
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
        pushToast("info", getAsGuidance(row));
        return;
      }

      const offerReassigned =
        row.status === "WAITING" &&
        previousRow.current_offer_es_id !== row.current_offer_es_id &&
        (row.offer_attempt_count ?? 0) > (previousRow.offer_attempt_count ?? 0);
      if (offerReassigned) {
        playNotificationSound("as_offer_reassigned").catch(() => {});
        pushToast("info", getAsGuidance(row));
        return;
      }

      const allRejectedNow =
        row.status === "WAITING" &&
        (previousRow.pending_offer_count ?? 0) > 0 &&
        (row.pending_offer_count ?? 0) === 0 &&
        row.current_offer_status === "REJECTED";
      if (allRejectedNow) {
        playNotificationSound("as_all_rejected").catch(() => {});
        pushToast("info", getAsGuidance(row));
        return;
      }

      if (previousRow.status === "ASSIGNED" && row.status === "COMPLETED") {
        playNotificationSound("as_completed").catch(() => {});
        pushToast("info", getAsGuidance(row));
        return;
      }
    }
  }, [pushToast, soundVolume, state.data]);

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
      handleActionError(error, "Failed to update user status");
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
      handleActionError(error, "Failed to update user role");
    } finally {
      setActiveUserAction(null);
    }
  };

  const requestUserRoleChange = (userId: number, role: UserRole) => {
    openConfirm(
      "Confirm Role Change",
      `Are you sure you want to change this user's role to ${role}?`,
      () => onUserRoleChange(userId, role)
    );
  };

  const requestUserStatusRecovery = (userId: number, name: string, status: UserStatus) => {
    openConfirm(
      "Confirm Status Recovery",
      `Set ${name} to ${status}? Use this only when you know their current status is stale.`,
      () => onUserStatusChange(userId, status)
    );
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
      handleActionError(error, "Failed to update your status");
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
      handleActionError(error, "Failed to update your language");
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
        pushToast("success", "Offer accepted.");
      } else {
        await api.rejectOffer(getToken, offerId);
        pushToast("success", "Offer rejected and reassigned.");
      }
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      handleActionError(error, "Failed to process offer");
    } finally {
      setActiveOfferAction(null);
    }
  };

  const requestOfferReject = (offerId: number) => {
    openConfirm(
      "Confirm Offer Rejection",
      "Reject this offer and reassign the enrollment to another ES?",
      () => onOfferAction(offerId, "reject")
    );
  };

  const onCreateTransferRequest = async () => {
    if (!syncState.user) {
      return;
    }

    const premiseId = requestForm.premiseId.trim();
    const selectedTimeslot = requestForm.timeslot.trim();
    if (!premiseId || !selectedTimeslot || !requestForm.language) {
      setActionError("Premise ID, timeslot, and language are required.");
      return;
    }

    setActionError(null);
    setIsSubmittingRequest(true);
    try {
      await api.createTransferRequest(getToken, {
        premise_id: premiseId,
        timeslot: selectedTimeslot,
        language: requestForm.language,
      });
      setRequestForm({ premiseId: "", timeslot: "", language: "English" });
      pushToast("success", "Transfer request created.");
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      handleActionError(error, "Failed to create transfer request");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const onCompleteEnrollment = async (enrollmentId: number) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActiveEnrollmentAction(enrollmentId);
    try {
      await api.completeEnrollment(getToken, enrollmentId);
      pushToast("success", "Enrollment marked as completed.");
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      handleActionError(error, "Failed to complete enrollment");
    } finally {
      setActiveEnrollmentAction(null);
    }
  };

  const requestCompleteEnrollment = (enrollmentId: number) => {
    openConfirm(
      "Confirm Completion",
      `Mark enrollment #${enrollmentId} as completed?`,
      () => onCompleteEnrollment(enrollmentId)
    );
  };

  const onStartEnrollmentWork = async (enrollmentId: number) => {
    if (!syncState.user) {
      return;
    }
    setActionError(null);
    setActiveStartAction(enrollmentId);
    try {
      await api.startEnrollmentWork(getToken, enrollmentId);
      pushToast("success", `You are now marked as working enrollment #${enrollmentId}.`);
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      handleActionError(error, "Failed to mark current enrollment");
    } finally {
      setActiveStartAction(null);
    }
  };

  const onAdminReofferEnrollment = async (enrollmentId: number) => {
    if (!syncState.user) {
      return;
    }
    const target = reofferTargetByEnrollment[enrollmentId];
    if (!target) {
      setActionError("Select an ES before re-offering.");
      return;
    }

    const targetEsId = Number(target);
    if (Number.isNaN(targetEsId)) {
      setActionError("Invalid ES selection.");
      return;
    }

    setActionError(null);
    setActiveReofferAction(enrollmentId);
    try {
      const result = await api.reofferEnrollment(getToken, enrollmentId, targetEsId);
      pushToast("success", `Enrollment #${enrollmentId} re-offered to ${result.offered_to}.`);
      await loadDashboard(syncState.user.role);
    } catch (error: unknown) {
      handleActionError(error, "Failed to re-offer enrollment");
    } finally {
      setActiveReofferAction(null);
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
  const adminEsUsers = users.filter(
    (user) => user.role === "ES" && (user.status === "AVAILABLE" || user.status === "BUSY")
  );
  const suspiciousBusyEsUsers = users.filter(
    (user) => user.role === "ES" && user.status === "BUSY" && !user.current_enrollment_id
  );
  const adminFilteredUsers = users.filter((user) => {
    const matchesRole = adminUserRoleFilter === "ALL" || user.role === adminUserRoleFilter;
    const matchesStatus = adminUserStatusFilter === "ALL" || user.status === adminUserStatusFilter;
    const languageValue = user.language ?? "English";
    const matchesLanguage = adminUserLanguageFilter === "ALL" || languageValue === adminUserLanguageFilter;
    return matchesRole && matchesStatus && matchesLanguage;
  });
  const adminFilteredEnrollments = enrollments.filter((row) => {
    const matchesStatus =
      adminEnrollmentStatusFilter === "ALL" || row.status === adminEnrollmentStatusFilter;
    const search = adminEnrollmentSearch.trim().toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      row.premise_id.toLowerCase().includes(search) ||
      String(row.id).includes(search);
    return matchesStatus && matchesSearch;
  });
  const adminRecoveryRows = adminFilteredEnrollments
    .map((row) => ({
      row,
      risk: getAdminRiskState(row),
      ageMinutes: getAgeMinutes(row.created_at),
    }))
    .filter((entry) => entry.risk !== null)
    .sort((left, right) => {
      return (right.risk?.severity ?? 0) - (left.risk?.severity ?? 0) || right.ageMinutes - left.ageMinutes;
    });
  const uncoveredCount = enrollments.filter(
    (row) => row.status === "WAITING" && row.current_offer_status === "REJECTED" && (row.pending_offer_count ?? 0) === 0
  ).length;
  const agingQueueCount = enrollments.filter(
    (row) => row.status === "WAITING" && getAgeMinutes(row.created_at) >= 15
  ).length;
  const needsStartCount = enrollments.filter(
    (row) => row.status === "ASSIGNED" && !!row.assigned_es_id && !row.es_current_enrollment_id && getAgeMinutes(row.created_at) >= 10
  ).length;
  const adminNextAction = adminRecoveryRows[0] ?? null;
  const asFilteredEnrollments = enrollments.filter((row) => {
    const matchesStatus = asStatusFilter === "ALL" || row.status === asStatusFilter;
    const search = asPremiseSearch.trim().toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      row.premise_id.toLowerCase().includes(search) ||
      String(row.id).includes(search);
    return matchesStatus && matchesSearch;
  });
  const esFilteredOffers = offers.filter((row) => {
    const matchesStatus = esOfferFilter === "ALL" || row.status === esOfferFilter;
    const search = esPremiseSearch.trim().toLowerCase();
    const premise = row.premise_id?.toLowerCase() ?? "";
    const matchesSearch =
      search.length === 0 ||
      premise.includes(search) ||
      String(row.enrollment_id).includes(search) ||
      String(row.id).includes(search);
    return matchesStatus && matchesSearch;
  });
  const esPrioritizedOffers = [...esFilteredOffers].sort((left, right) => {
    const leftPending = left.status === "PENDING" ? 1 : 0;
    const rightPending = right.status === "PENDING" ? 1 : 0;

    if (leftPending !== rightPending) {
      return rightPending - leftPending;
    }

    return new Date(right.offered_at).getTime() - new Date(left.offered_at).getTime();
  });
  const esFilteredEnrollments = enrollments.filter((row) => {
    const matchesActive = esAssignmentFilter === "ALL" || row.status === "ASSIGNED";
    const search = esPremiseSearch.trim().toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      row.premise_id.toLowerCase().includes(search) ||
      String(row.id).includes(search);
    return matchesActive && matchesSearch;
  });
  const nextAsAction =
    asFilteredEnrollments.find((row) => row.status === "ASSIGNED" && row.es_current_enrollment_id === row.id) ??
    asFilteredEnrollments.find((row) => row.status === "ASSIGNED") ??
    asFilteredEnrollments.find((row) => row.status === "WAITING" && (row.pending_offer_count ?? 0) > 0) ??
    null;
  const nextEsExpiringOffer = esFilteredOffers
    .filter((row) => row.status === "PENDING")
    .map((row) => ({ row, expiresMs: new Date(row.expires_at).getTime() - Date.now() }))
    .sort((a, b) => a.expiresMs - b.expiresMs)[0] ?? null;
  const newestPendingEsOffer = esPrioritizedOffers.find((row) => row.status === "PENDING") ?? null;
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
          <label className="sound-control">
            <span>Alert Volume {soundVolume}%</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={soundVolume}
              onChange={(event) => setSoundVolume(Number(event.target.value))}
            />
          </label>
          <SignOutButton>
            <button className="btn-secondary" type="button">Sign out</button>
          </SignOutButton>
        </div>
      </header>

      {sessionWarning && (
        <div className="session-banner" role="alert">
          <span>{sessionWarning}</span>
          <button type="button" className="btn-secondary" onClick={() => setSessionWarning(null)}>
            Dismiss
          </button>
        </div>
      )}

      {toasts.length > 0 && (
        <section className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <article key={toast.id} className={`toast-item ${toast.tone}`}>
              {toast.message}
            </article>
          ))}
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
              <div className="maintenance-stat">
                <span>Aging Waiting Queue</span>
                <strong>{agingQueueCount}</strong>
              </div>
              <div className="maintenance-stat">
                <span>Uncovered Requests</span>
                <strong>{uncoveredCount}</strong>
              </div>
              <div className="maintenance-stat">
                <span>Assigned But Not Started</span>
                <strong>{needsStartCount}</strong>
              </div>
              <div className="maintenance-stat">
                <span>Stuck Busy ES</span>
                <strong>{suspiciousBusyEsUsers.length}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Operations Health</h2>
            <p className="subtle">This section highlights issues that commonly need admin intervention during live dispatch.</p>
            {adminNextAction ? (
              <p className="next-action">
                Next best action: Enrollment #{adminNextAction.row.id} is {adminNextAction.risk?.label.toLowerCase()}. {adminNextAction.risk?.guidance}
              </p>
            ) : (
              <p className="subtle">No active admin intervention signals right now.</p>
            )}
            <div className="health-grid">
              <article className="health-card">
                <h3>Queue Risks</h3>
                <p className="subtle">Requests needing attention because of age, rejection, or delayed ES pickup.</p>
                <div className="health-list">
                  <span className="status-badge queued">Aging queue: {agingQueueCount}</span>
                  <span className="status-badge blocked">Uncovered: {uncoveredCount}</span>
                  <span className="status-badge waiting">Needs start: {needsStartCount}</span>
                </div>
              </article>
              <article className="health-card">
                <h3>Recovery Signals</h3>
                <p className="subtle">Operators that may need manual status recovery to keep routing healthy.</p>
                <div className="health-list">
                  <span className={suspiciousBusyEsUsers.length > 0 ? "status-badge blocked" : "status-badge complete"}>
                    Busy without active enrollment: {suspiciousBusyEsUsers.length}
                  </span>
                </div>
              </article>
            </div>
          </section>

          <section className="card">
            <h2>Recovery Queue</h2>
            <p className="subtle">Use this board to resolve dispatch situations that are likely to stall operations.</p>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Enrollment</th>
                    <th>Risk</th>
                    <th>Age</th>
                    <th>Assigned / Offered ES</th>
                    <th>Guidance</th>
                    <th>Recover</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRecoveryRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="subtle">No flagged enrollments right now.</td>
                    </tr>
                  ) : (
                    adminRecoveryRows.map(({ row, risk, ageMinutes }) => (
                      <tr key={row.id}>
                        <td>
                          #{row.id} / {row.premise_id}
                          <button type="button" className="copy-btn" onClick={() => copyText("Premise ID", row.premise_id)}>
                            Copy
                          </button>
                        </td>
                        <td><span className={risk?.className}>{risk?.label}</span></td>
                        <td>{ageMinutes}m</td>
                        <td>{getEsDisplay(row)}</td>
                        <td className="prompt-note">{risk?.guidance}</td>
                        <td>
                          {row.status === "WAITING" ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => {
                                const fallbackEs = adminEsUsers[0];
                                if (fallbackEs) {
                                  setReofferTargetByEnrollment((prev) => ({
                                    ...prev,
                                    [row.id]: String(fallbackEs.id),
                                  }));
                                  pushToast("info", `Preselected ${fallbackEs.name} for enrollment #${row.id}.`);
                                } else {
                                  pushToast("error", "No assignable ES available for quick recovery.");
                                }
                              }}
                            >
                              Prep Re-offer
                            </button>
                          ) : (
                            <span className="subtle">Monitor ES progress</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>ES Recovery Tools</h2>
            <p className="subtle">If an ES is stuck in BUSY without an active assignment, you can safely return them to AVAILABLE.</p>
            <div className="recovery-user-list">
              {suspiciousBusyEsUsers.length === 0 ? (
                <p className="subtle">No ES users currently look stuck.</p>
              ) : (
                suspiciousBusyEsUsers.map((user) => (
                  <article key={user.id} className="recovery-user-card">
                    <div>
                      <strong>{user.name}</strong>
                      <p className="subtle">ES #{user.id} is BUSY but has no `current_enrollment_id`.</p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => requestUserStatusRecovery(user.id, user.name, "AVAILABLE")}
                      disabled={activeUserAction === user.id}
                    >
                      Mark Available
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="card">
            <h2>User Management</h2>
            <p className="subtle">Update status and role assignments for dispatch operators.</p>
            <div className="filter-row">
              <label className="control-field">
                <span>Role</span>
                <select
                  value={adminUserRoleFilter}
                  onChange={(event) => setAdminUserRoleFilter(event.target.value as "ALL" | UserRole)}
                >
                  <option value="ALL">All</option>
                  {USER_ROLES.map((userRole) => (
                    <option key={userRole} value={userRole}>
                      {userRole}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-field">
                <span>Status</span>
                <select
                  value={adminUserStatusFilter}
                  onChange={(event) => setAdminUserStatusFilter(event.target.value as "ALL" | UserStatus)}
                >
                  <option value="ALL">All</option>
                  {USER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-field">
                <span>Language</span>
                <select
                  value={adminUserLanguageFilter}
                  onChange={(event) => setAdminUserLanguageFilter(event.target.value as "ALL" | UserLanguage)}
                >
                  <option value="ALL">All</option>
                  {USER_LANGUAGES.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Language</th>
                    <th>Last Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {adminFilteredUsers.map((user) => (
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
                          onChange={(event) => requestUserRoleChange(user.id, event.target.value as UserRole)}
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
                      <td>{user.language ?? "-"}</td>
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

          <section className="card">
            <h2>Enrollment Queue Control</h2>
            <p className="subtle">Filter queue, identify aging requests, and manually re-offer when needed.</p>
            <div className="filter-row">
              <label className="control-field">
                <span>Search by ID/Premise</span>
                <input
                  type="text"
                  value={adminEnrollmentSearch}
                  onChange={(event) => setAdminEnrollmentSearch(event.target.value)}
                  placeholder="e.g. 42 or TEST-PREMISE"
                />
              </label>
              <label className="control-field">
                <span>Status</span>
                <select
                  value={adminEnrollmentStatusFilter}
                  onChange={(event) => setAdminEnrollmentStatusFilter(
                    event.target.value as "ALL" | "WAITING" | "ASSIGNED" | "COMPLETED"
                  )}
                >
                  <option value="ALL">All</option>
                  <option value="WAITING">WAITING</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </label>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Premise</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th>Timeslot</th>
                    <th>Age</th>
                    <th>Assigned / Offered ES</th>
                    <th>Re-offer To</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adminFilteredEnrollments.map((row) => {
                    const ageMinutes = Math.max(
                      0,
                      Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60000)
                    );
                    const ageClass =
                      ageMinutes >= 30 ? "status-badge blocked" : ageMinutes >= 15 ? "status-badge queued" : "status-badge waiting";
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.id}
                          <button type="button" className="copy-btn" onClick={() => copyText("Enrollment ID", row.id)}>
                            Copy
                          </button>
                        </td>
                        <td>
                          {row.premise_id}
                          <button type="button" className="copy-btn" onClick={() => copyText("Premise ID", row.premise_id)}>
                            Copy
                          </button>
                        </td>
                        <td>{row.language}</td>
                        <td>{row.status}</td>
                        <td>{formatTimeslot(row.timeslot)}</td>
                        <td><span className={ageClass}>{ageMinutes}m</span></td>
                        <td>
                          {getEsDisplay(row)}
                          {getEsDisplay(row) !== "-" && (
                            <button
                              type="button"
                              className="copy-btn"
                              onClick={() => copyText("ES name", getEsDisplay(row))}
                            >
                              Copy
                            </button>
                          )}
                        </td>
                        <td>
                          <select
                            value={reofferTargetByEnrollment[row.id] ?? ""}
                            onChange={(event) => setReofferTargetByEnrollment((prev) => ({
                              ...prev,
                              [row.id]: event.target.value,
                            }))}
                            disabled={row.status !== "WAITING"}
                          >
                            <option value="">Select ES</option>
                            {adminEsUsers.map((es) => (
                              <option key={es.id} value={String(es.id)}>
                                {es.name} ({es.status})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => onAdminReofferEnrollment(row.id)}
                            disabled={row.status !== "WAITING" || activeReofferAction === row.id}
                          >
                            Re-offer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {actionError && <p className="inline-error">{actionError}</p>}

      {role === "AS" && (
        <section className="card">
          <h2>Create Transfer Request</h2>
          <p className="subtle">Submit a premise, language, and appointment slot so dispatch routes it to the correct ES language group.</p>
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
              <span>Customer Language</span>
              <select
                value={requestForm.language}
                onChange={(event) => setRequestForm((prev) => ({
                  ...prev,
                  language: event.target.value as UserLanguage,
                }))}
              >
                {USER_LANGUAGES.map((language) => (
                  <option key={language} value={language}>{language}</option>
                ))}
              </select>
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
          <p className="subtle">Filter by status or premise and follow the guidance column for next action.</p>
          <div className="filter-row">
            <label className="control-field">
              <span>Status</span>
              <select
                value={asStatusFilter}
                onChange={(event) => setAsStatusFilter(
                  event.target.value as "ALL" | "WAITING" | "ASSIGNED" | "COMPLETED"
                )}
              >
                <option value="ALL">All</option>
                <option value="WAITING">WAITING</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </label>
            <label className="control-field">
              <span>Search by ID/Premise</span>
              <input
                type="text"
                value={asPremiseSearch}
                onChange={(event) => setAsPremiseSearch(event.target.value)}
                placeholder="e.g. TEST-PREMISE or 42"
              />
            </label>
          </div>
          {nextAsAction && (
            <p className="next-action">
              Next best action: {getAsGuidance(nextAsAction)}
            </p>
          )}
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Premise</th>
                  <th>Language</th>
                  <th>Timeslot</th>
                  <th>Status</th>
                  <th>Assigned / Offered ES</th>
                  <th>ES Work Status</th>
                  <th>Guidance</th>
                </tr>
              </thead>
              <tbody>
                {asFilteredEnrollments.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.id}
                      <button type="button" className="copy-btn" onClick={() => copyText("Enrollment ID", row.id)}>
                        Copy
                      </button>
                    </td>
                    <td>
                      {row.premise_id}
                      <button type="button" className="copy-btn" onClick={() => copyText("Premise ID", row.premise_id)}>
                        Copy
                      </button>
                    </td>
                    <td>{row.language}</td>
                    <td>{formatTimeslot(row.timeslot)}</td>
                    <td>{row.status}</td>
                    <td>
                      {getEsDisplay(row)}
                      {getEsDisplay(row) !== "-" && (
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => copyText("ES name", getEsDisplay(row))}
                        >
                          Copy
                        </button>
                      )}
                    </td>
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

      {role === "ES" && state.data.offers && (
        <section className="card">
          <h2>My Offer Queue</h2>
          {newestPendingEsOffer && (
            <div className="offer-alert-banner" role="alert">
              <div>
                <p className="eyebrow">New Request</p>
                <strong>
                  Offer #{newestPendingEsOffer.id} for enrollment #{newestPendingEsOffer.enrollment_id}
                </strong>
                    <p className="subtle">
                      Premise: {newestPendingEsOffer.premise_id ?? "No premise"}.
                      Review this first before older items in the queue.
                    </p>
                  </div>
              <span className="status-badge blocked">Pending Now</span>
            </div>
          )}
          <div className="filter-row">
            <label className="control-field">
              <span>Offer Filter</span>
              <select
                value={esOfferFilter}
                onChange={(event) => setEsOfferFilter(event.target.value as "ALL" | "PENDING")}
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending only</option>
              </select>
            </label>
            <label className="control-field">
              <span>Search by ID/Premise</span>
              <input
                type="text"
                value={esPremiseSearch}
                onChange={(event) => setEsPremiseSearch(event.target.value)}
                placeholder="e.g. TEST-PREMISE or 42"
              />
            </label>
          </div>
          {nextEsExpiringOffer && (
            <p className="next-action">
              Next best action: You have 1 pending offer expiring soon (offer #{nextEsExpiringOffer.row.id}).
            </p>
          )}
          <ul className="record-list">
            {esPrioritizedOffers.map((row, index) => (
              <li
                key={String(row.id)}
                className={[
                  row.status === "PENDING" ? "record-item-pending" : "",
                  row.status === "PENDING" && index === 0 ? "record-item-fresh" : "",
                ].filter(Boolean).join(" ")}
              >
                <span>
                  #{String(row.id)}
                  <button type="button" className="copy-btn" onClick={() => copyText("Offer ID", row.id)}>
                    Copy
                  </button>
                </span>
                <span>
                  Enrollment {String(row.enrollment_id ?? "-")} ({row.premise_id ?? "No premise"})
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyText("Premise ID", row.premise_id ?? null)}
                  >
                    Copy
                  </button>
                </span>
                <span>{String(row.status ?? "-")}</span>
                {row.status === "PENDING" && (
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
                      onClick={() => requestOfferReject(row.id)}
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

      {role === "ES" && state.data.enrollments && (
        <section className="card">
          <h2>My Assigned Enrollments</h2>
          <div className="filter-row">
            <label className="control-field">
              <span>Assignment Filter</span>
              <select
                value={esAssignmentFilter}
                onChange={(event) => setEsAssignmentFilter(event.target.value as "ALL" | "ACTIVE")}
              >
                <option value="ALL">All</option>
                <option value="ACTIVE">Active only</option>
              </select>
            </label>
            <label className="control-field">
              <span>Search by ID/Premise</span>
              <input
                type="text"
                value={esPremiseSearch}
                onChange={(event) => setEsPremiseSearch(event.target.value)}
                placeholder="e.g. TEST-PREMISE or 42"
              />
            </label>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Premise</th>
                  <th>Language</th>
                  <th>Timeslot</th>
                  <th>Status</th>
                  <th>Requested By</th>
                  <th>Current Work</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {esFilteredEnrollments.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.id}
                      <button type="button" className="copy-btn" onClick={() => copyText("Enrollment ID", row.id)}>
                        Copy
                      </button>
                    </td>
                    <td>
                      {row.premise_id}
                      <button type="button" className="copy-btn" onClick={() => copyText("Premise ID", row.premise_id)}>
                        Copy
                      </button>
                    </td>
                    <td>{row.language}</td>
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
                          onClick={() => requestCompleteEnrollment(row.id)}
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

      {confirmState && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={confirmState.title}>
          <div className="modal-card">
            <h3>{confirmState.title}</h3>
            <p>{confirmState.message}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmState(null)}
                disabled={isConfirmingAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={async () => {
                  if (!confirmState) return;
                  setIsConfirmingAction(true);
                  try {
                    await confirmState.onConfirm();
                  } finally {
                    setIsConfirmingAction(false);
                    setConfirmState(null);
                  }
                }}
                disabled={isConfirmingAction}
              >
                {isConfirmingAction ? "Applying..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
