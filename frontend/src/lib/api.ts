import type {
  AuditLogRow,
  ClerkPaginatedList,
  DashboardData,
  EnrollmentRow,
  OfferRow,
  UserRow,
  UserLanguage,
  UserRole,
  UserStatus,
  UserSyncResponse,
} from "../types/api";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";

type TokenResolver = () => Promise<string | null>;

export class ApiRequestError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  tokenResolver: TokenResolver,
  options: RequestInit = {}
): Promise<T> {
  const token = await tokenResolver();
  if (!token) {
    throw new Error("No auth token available");
  }

  const headers = new Headers(options.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = typeof errorBody.error === "string" ? errorBody.error : "Request failed";
    const code = typeof errorBody.code === "string" ? errorBody.code : null;
    throw new ApiRequestError(message, response.status, code);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getUsers: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/users?page=1&limit=20", getToken),
  getEnrollments: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/enrollments?page=1&limit=50", getToken),
  getOffers: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/offers?page=1&limit=5", getToken),
  getMyEnrollments: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/enrollments/my/requests?page=1&limit=20", getToken),
  getMyAssignedEnrollments: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/enrollments/my/assigned?page=1&limit=20", getToken),
  getMyOffers: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/offers/my?page=1&limit=5", getToken),
  getCurrentUser: (getToken: TokenResolver) =>
    request<UserRow>("/users/me", getToken),
  getAuditLog: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/audit-log?page=1&limit=20", getToken),
  updateUserStatus: (getToken: TokenResolver, userId: number, status: UserStatus) =>
    request<UserRow>(`/users/${userId}/status`, getToken, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updateUserRole: (getToken: TokenResolver, userId: number, role: UserRole) =>
    request<UserRow>(`/users/${userId}`, getToken, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  updateMyStatus: (getToken: TokenResolver, status: UserStatus) =>
    request<UserRow>("/users/me/status", getToken, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updateMyLanguage: (getToken: TokenResolver, language: UserLanguage) =>
    request<UserRow>("/users/me/language", getToken, {
      method: "PATCH",
      body: JSON.stringify({ language }),
    }),
  acceptOffer: (getToken: TokenResolver, offerId: number) =>
    request<{ message: string }>(`/offers/${offerId}/accept`, getToken, {
      method: "POST",
    }),
  rejectOffer: (getToken: TokenResolver, offerId: number) =>
    request<{ message: string }>(`/offers/${offerId}/reject`, getToken, {
      method: "POST",
    }),
  createTransferRequest: (
    getToken: TokenResolver,
    payload: { premise_id: string; timeslot: string }
  ) =>
    request<{
      enrollment: EnrollmentRow;
      offered_to: string;
      offer: OfferRow;
      queued_for_busy: boolean;
    }>("/enrollments/request", getToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  completeEnrollment: (getToken: TokenResolver, enrollmentId: number) =>
    request<{ message: string }>(`/enrollments/${enrollmentId}/complete`, getToken, {
      method: "POST",
    }),
  startEnrollmentWork: (getToken: TokenResolver, enrollmentId: number) =>
    request<{ message: string }>(`/enrollments/${enrollmentId}/start`, getToken, {
      method: "POST",
    }),
  reofferEnrollment: (getToken: TokenResolver, enrollmentId: number, esId: number) =>
    request<{ message: string; offered_to: string }>(`/enrollments/${enrollmentId}/reoffer`, getToken, {
      method: "POST",
      body: JSON.stringify({ es_id: esId }),
    }),
  syncUser: (
    getToken: TokenResolver,
    payload: { clerk_id: string; email: string; name: string }
  ) =>
    request<UserSyncResponse>("/users/sync", getToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getDashboardData: async (getToken: TokenResolver, role: UserRole): Promise<DashboardData> => {
    if (role === "ADMIN") {
      const [users, enrollments, offers, auditLog] = await Promise.all([
        api.getUsers(getToken),
        api.getEnrollments(getToken),
        api.getOffers(getToken),
        api.getAuditLog(getToken),
      ]);
      return {
        role,
        users: {
          ...users,
          data: users.data as UserRow[],
        },
        enrollments,
        offers,
        auditLog: {
          ...auditLog,
          data: auditLog.data as AuditLogRow[],
        },
      };
    }

    if (role === "ES") {
      const [offers, currentUser, assignedEnrollments] = await Promise.all([
        api.getMyOffers(getToken),
        api.getCurrentUser(getToken),
        api.getMyAssignedEnrollments(getToken),
      ]);
      return {
        role,
        users: {
          data: [currentUser],
          pagination: {
            page: 1,
            limit: 1,
            total: 1,
            totalPages: 1,
          },
        },
        enrollments: {
          ...assignedEnrollments,
          data: assignedEnrollments.data as EnrollmentRow[],
        },
        offers: {
          ...offers,
          data: offers.data as OfferRow[],
        },
        auditLog: null,
      };
    }

    const enrollments = await api.getMyEnrollments(getToken);
    return {
      role,
      users: null,
      enrollments: {
        ...enrollments,
        data: enrollments.data as EnrollmentRow[],
      },
      offers: null,
      auditLog: null,
    };
  },
};
