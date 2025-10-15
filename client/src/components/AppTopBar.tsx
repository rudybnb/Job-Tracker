import { ArrowLeft, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function AppTopBar() {
  const [, navigate] = useLocation();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  };

  const goHome = () => {
    // Role-agnostic: '/' routes to RoleBased which picks admin/contractor
    navigate("/");
  };

  return (
    <div className="app-topbar">
      <button
        aria-label="Back"
        title={canGoBack ? "Back" : "Back to Home"}
        onClick={goBack}
        className="app-topbar-btn"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <button
        aria-label="Home"
        title="Home"
        onClick={goHome}
        className="app-topbar-btn"
      >
        <Home className="w-5 h-5" />
      </button>
    </div>
  );
}