export type ClerkPaginatedList = {
  data: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type UserRole = "ADMIN" | "ES" | "AS";
export type UserStatus = "AVAILABLE" | "BUSY" | "UNAVAILABLE";

export type UserRow = {
  id: number;
  name: string;
  role: UserRole;
  status: UserStatus;
  last_assigned_at: string | null;
};

export type AuditLogRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_clerk_id: string | null;
  created_at: string;
};

export type DashboardData = {
  role: UserRole;
  users: ClerkPaginatedList | null;
  enrollments: ClerkPaginatedList | null;
  offers: ClerkPaginatedList | null;
  auditLog: ClerkPaginatedList | null;
};

export type UserSyncResponse = {
  id: number;
  name: string;
  role: UserRole;
  status: string;
  clerk_id: string;
  email: string;
};
