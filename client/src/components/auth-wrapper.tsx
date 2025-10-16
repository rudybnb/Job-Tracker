import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import type { User } from "@shared/schema";

interface AuthWrapperProps {
  children: React.ReactNode;
  loginPath?: string;
}

export function AuthWrapper({ children, loginPath = "/login" }: AuthWrapperProps) {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
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

  // If not authenticated (401 error), redirect to login
  if (error || !user) {
    return <Redirect to={loginPath} />;
  }

  // User is authenticated, show the children
  return <>{children}</>;
}
