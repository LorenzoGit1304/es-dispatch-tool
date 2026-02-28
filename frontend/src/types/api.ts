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
