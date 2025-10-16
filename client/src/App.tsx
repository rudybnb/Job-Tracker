import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { RoleRedirect } from "@/components/role-redirect";
import { AuthWrapper } from "@/components/auth-wrapper";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";

import Dashboard from "@/pages/dashboard";
import Rota from "@/pages/rota";
import Attendance from "@/pages/attendance";
import Rooms from "@/pages/rooms";
import Payroll from "@/pages/payroll";
import Reports from "@/pages/reports";
import Queries from "@/pages/queries";
import Sites from "@/pages/sites";
import Directory from "@/pages/directory";
import Settings from "@/pages/settings";
import WorkerHome from "@/pages/worker-home";
import WorkerClock from "@/pages/worker-clock";
import WorkerPay from "@/pages/worker-pay";
import WorkerScan from "@/pages/worker-scan";
import WorkerProfile from "@/pages/worker-profile";

function AdminLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AdminDashboard() {
  return (
    <AdminLayout>
      <Dashboard />
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Login Route */}
      <Route path="/login" component={Login} />

      {/* Protected Home Route - Auto-redirect based on role */}
      <Route path="/">
        <AuthWrapper>
          <RoleRedirect adminComponent={AdminDashboard} workerRedirect="/worker" />
        </AuthWrapper>
      </Route>

      {/* Protected Admin Routes */}
      <Route path="/rota">
        <AuthWrapper>
          <AdminLayout>
            <Rota />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/attendance">
        <AuthWrapper>
          <AdminLayout>
            <Attendance />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/rooms">
        <AuthWrapper>
          <AdminLayout>
            <Rooms />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/payroll">
        <AuthWrapper>
          <AdminLayout>
            <Payroll />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/reports">
        <AuthWrapper>
          <AdminLayout>
            <Reports />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/queries">
        <AuthWrapper>
          <AdminLayout>
            <Queries />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/sites">
        <AuthWrapper>
          <AdminLayout>
            <Sites />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/directory">
        <AuthWrapper>
          <AdminLayout>
            <Directory />
          </AdminLayout>
        </AuthWrapper>
      </Route>
      <Route path="/settings">
        <AuthWrapper>
          <AdminLayout>
            <Settings />
          </AdminLayout>
        </AuthWrapper>
      </Route>

      {/* Protected Worker Routes - Mobile-First */}
      <Route path="/worker">
        <AuthWrapper>
          <WorkerHome />
        </AuthWrapper>
      </Route>
      <Route path="/worker/clock">
        <AuthWrapper>
          <WorkerClock />
        </AuthWrapper>
      </Route>
      <Route path="/worker/pay">
        <AuthWrapper>
          <WorkerPay />
        </AuthWrapper>
      </Route>
      <Route path="/worker/scan">
        <AuthWrapper>
          <WorkerScan />
        </AuthWrapper>
      </Route>
      <Route path="/worker/profile">
        <AuthWrapper>
          <WorkerProfile />
        </AuthWrapper>
      </Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
