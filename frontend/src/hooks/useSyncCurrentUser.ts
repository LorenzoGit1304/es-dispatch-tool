import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { UserSyncResponse } from "../types/api";

type SyncState = {
  loading: boolean;
  error: string | null;
  user: UserSyncResponse | null;
};

export function useSyncCurrentUser(): SyncState {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [state, setState] = useState<SyncState>({
    loading: true,
    error: null,
    user: null,
  });

  const syncPayload = useMemo(() => {
    if (!user?.id || !user.fullName || !user.primaryEmailAddress?.emailAddress) {
      return null;
    }

    return {
      clerk_id: user.id,
      name: user.fullName,
      email: user.primaryEmailAddress.emailAddress,
    };
  }, [user]);

  useEffect(() => {
    let isCancelled = false;

    if (!syncPayload) {
      setState({
        loading: false,
        error: "User profile is incomplete in Clerk (name/email missing).",
        user: null,
      });
      return;
    }

    api.syncUser(getToken, syncPayload)
      .then((syncedUser) => {
        if (!isCancelled) {
          setState({ loading: false, error: null, user: syncedUser });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : "Failed to sync user",
            user: null,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [getToken, syncPayload]);

  return state;
}
