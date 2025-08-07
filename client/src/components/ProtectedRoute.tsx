import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "contractor";
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');

    if (!isLoggedIn) {
      window.location.href = '/login';
      return;
    }

    if (requiredRole && userRole !== requiredRole) {
      // Redirect to appropriate dashboard based on actual role
      if (userRole === 'admin') {
        window.location.href = '/admin';
      } else {
        window.location.href = '/';
      }
      return;
    }
  }, [requiredRole]);

  return <>{children}</>;
}