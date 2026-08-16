import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "contractor";
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    const userRole = localStorage.getItem("userRole");

    if (!isLoggedIn) {
      // Preserve any scanned QR token from URL search params before redirecting to login
      const params = new URLSearchParams(window.location.search);
      const token = params.get("t") || params.get("qrToken") || params.get("token");
      if (token) {
        sessionStorage.setItem("pendingQrToken", token.trim());
      }
      const loginUrl = token ? `/login?qrToken=${encodeURIComponent(token.trim())}` : "/login";
      window.location.href = loginUrl;
      return;
    }

    // Enforce role-based access if requiredRole is specified
    if (requiredRole && userRole !== requiredRole) {
      if (userRole === "admin") {
        window.location.href = "/admin";
      } else if (userRole === "contractor") {
        window.location.href = "/";
      } else {
        window.location.href = "/login";
      }
      return;
    }
  }, [requiredRole]);

  return <>{children}</>;
}