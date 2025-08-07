import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "contractor";
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');

    if (!isLoggedIn) {
      window.location.href = '/login';
      return;
    }

    // Allow any authenticated user to access any page - they can use logout to switch roles
  }, [requiredRole]);

  return <>{children}</>;
}