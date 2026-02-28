import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoaded, userId } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="center-screen">
        <p>Loading session...</p>
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
