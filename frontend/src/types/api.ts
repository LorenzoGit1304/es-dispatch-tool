export type ClerkPaginatedList = {
  data: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type DashboardData = {
  users: ClerkPaginatedList;
  enrollments: ClerkPaginatedList;
  offers: ClerkPaginatedList;
};

export type UserSyncResponse = {
  id: number;
  name: string;
  role: string;
  status: string;
  clerk_id: string;
  email: string;
};
