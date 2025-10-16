import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import type { User } from "@shared/schema";

interface RoleRedirectProps {
  adminComponent: React.ComponentType;
  workerRedirect?: string;
}

export function RoleRedirect({ adminComponent: AdminComponent, workerRedirect = "/worker" }: RoleRedirectProps) {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect workers to their mobile interface
  if (user?.role === "worker") {
    return <Redirect to={workerRedirect} />;
  }

  // Show admin component for admins and site managers
  return <AdminComponent />;
}
