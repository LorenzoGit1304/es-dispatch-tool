import type {
  ClerkPaginatedList,
  DashboardData,
  UserRole,
  UserSyncResponse,
} from "../types/api";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";

type TokenResolver = () => Promise<string | null>;

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
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getUsers: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/users?page=1&limit=5", getToken),
  getEnrollments: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/enrollments?page=1&limit=5", getToken),
  getOffers: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/offers?page=1&limit=5", getToken),
  getMyEnrollments: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/enrollments/my/requests?page=1&limit=5", getToken),
  getMyOffers: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/offers/my?page=1&limit=5", getToken),
  getAuditLog: (getToken: TokenResolver) =>
    request<ClerkPaginatedList>("/audit-log?page=1&limit=5", getToken),
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
      return { role, users, enrollments, offers, auditLog };
    }

    if (role === "ES") {
      const offers = await api.getMyOffers(getToken);
      return { role, users: null, enrollments: null, offers, auditLog: null };
    }

    const enrollments = await api.getMyEnrollments(getToken);
    return { role, users: null, enrollments, offers: null, auditLog: null };
  },
};
