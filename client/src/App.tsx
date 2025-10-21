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
import { DevToolbar } from "@/components/dev-toolbar";
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

// Enable auth bypass in dev so UI can be previewed without backend
const isDev = import.meta.env.DEV;
function MaybeAuth({ children }: { children: React.ReactNode }) {
  return isDev ? <>{children}</> : <AuthWrapper>{children}</AuthWrapper>;
}

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
        <MaybeAuth>
          <RoleRedirect adminComponent={AdminDashboard} workerRedirect="/worker" />
        </MaybeAuth>
      </Route>

      {/* Protected Admin Routes */}
      <Route path="/rota">
        <MaybeAuth>
          <AdminLayout>
            <Rota />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/attendance">
        <MaybeAuth>
          <AdminLayout>
            <Attendance />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/rooms">
        <MaybeAuth>
          <AdminLayout>
            <Rooms />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/payroll">
        <MaybeAuth>
          <AdminLayout>
            <Payroll />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/reports">
        <MaybeAuth>
          <AdminLayout>
            <Reports />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/queries">
        <MaybeAuth>
          <AdminLayout>
            <Queries />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/sites">
        <MaybeAuth>
          <AdminLayout>
            <Sites />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/directory">
        <MaybeAuth>
          <AdminLayout>
            <Directory />
          </AdminLayout>
        </MaybeAuth>
      </Route>
      <Route path="/settings">
        <MaybeAuth>
          <AdminLayout>
            <Settings />
          </AdminLayout>
        </MaybeAuth>
      </Route>

      {/* Protected Worker Routes - Mobile-First */}
      <Route path="/worker">
        <MaybeAuth>
          <WorkerHome />
        </MaybeAuth>
      </Route>
      <Route path="/worker/clock">
        <MaybeAuth>
          <WorkerClock />
        </MaybeAuth>
      </Route>
      <Route path="/worker/pay">
        <MaybeAuth>
          <WorkerPay />
        </MaybeAuth>
      </Route>
      <Route path="/worker/scan">
        <MaybeAuth>
          <WorkerScan />
        </MaybeAuth>
      </Route>
      <Route path="/worker/profile">
        <MaybeAuth>
          <WorkerProfile />
        </MaybeAuth>
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
          <DevToolbar />
          <div className={isDev ? "pt-12" : ""}>
            <Router />
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
