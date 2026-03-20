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
export type UserLanguage = "English" | "Spanish" | "Both";

export type UserRow = {
  id: number;
  name: string;
  role: UserRole;
  status: UserStatus;
  last_assigned_at: string | null;
  current_enrollment_id?: number | null;
  language?: UserLanguage | null;
};

export type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export type OfferRow = {
  id: number;
  enrollment_id: number;
  premise_id?: string;
  es_id: number;
  status: OfferStatus;
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
};

export type EnrollmentStatus = "WAITING" | "ASSIGNED" | "COMPLETED";

export type EnrollmentRow = {
  id: number;
  premise_id: string;
  requested_by: number;
  timeslot: string;
  status: EnrollmentStatus;
  language: UserLanguage;
  created_at: string;
  assigned_es_id: number | null;
  assigned_es_name?: string | null;
  current_offer_es_id?: number | null;
  current_offer_es_name?: string | null;
  current_offer_status?: OfferStatus | null;
  offer_attempt_count?: number;
  pending_offer_count?: number;
  requested_by_name?: string | null;
  es_current_enrollment_id?: number | null;
  es_current_premise_id?: string | null;
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
