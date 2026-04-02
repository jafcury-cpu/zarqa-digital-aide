import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/components/auth/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="surface-elevated w-full max-w-xl space-y-5 p-8">
          <Skeleton className="h-4 w-32 bg-muted" />
          <Skeleton className="h-12 w-2/3 bg-muted" />
          <Skeleton className="h-28 w-full bg-muted" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
