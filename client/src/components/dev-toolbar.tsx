import { Button } from "@/components/ui/button";
import { Shield, Briefcase, Users, LogOut } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export function DevToolbar() {
  // Check both Vite dev mode and localhost URL
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname.includes('.replit.dev');

  if (!isDev) return null;

  const switchRole = async (role: string) => {
    // Clear all cached data before switching roles
    await queryClient.clear();
    window.location.href = `/api/dev-login/${role}`;
  };

  const logout = async () => {
    await queryClient.clear();
    window.location.href = '/api/logout';
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-chart-1 border-b-2 border-chart-1-foreground/30 px-4 py-2 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-chart-1-foreground">DEV MODE:</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => switchRole('admin')}
              data-testid="dev-login-admin"
            >
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => switchRole('site_manager')}
              data-testid="dev-login-manager"
            >
              <Briefcase className="h-3 w-3 mr-1" />
              Manager
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => switchRole('worker')}
              data-testid="dev-login-worker"
            >
              <Users className="h-3 w-3 mr-1" />
              Worker
            </Button>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-chart-1-foreground hover:text-chart-1-foreground"
          onClick={logout}
          data-testid="dev-logout"
        >
          <LogOut className="h-3 w-3 mr-1" />
          Logout
        </Button>
      </div>
    </div>
  );
}
