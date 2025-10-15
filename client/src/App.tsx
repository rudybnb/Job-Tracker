import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";

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
import WorkerPay from "@/pages/worker-pay";

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

function Router() {
  return (
    <Switch>
      {/* Admin Routes */}
      <Route path="/">
        <AdminLayout>
          <Dashboard />
        </AdminLayout>
      </Route>
      <Route path="/rota">
        <AdminLayout>
          <Rota />
        </AdminLayout>
      </Route>
      <Route path="/attendance">
        <AdminLayout>
          <Attendance />
        </AdminLayout>
      </Route>
      <Route path="/rooms">
        <AdminLayout>
          <Rooms />
        </AdminLayout>
      </Route>
      <Route path="/payroll">
        <AdminLayout>
          <Payroll />
        </AdminLayout>
      </Route>
      <Route path="/reports">
        <AdminLayout>
          <Reports />
        </AdminLayout>
      </Route>
      <Route path="/queries">
        <AdminLayout>
          <Queries />
        </AdminLayout>
      </Route>
      <Route path="/sites">
        <AdminLayout>
          <Sites />
        </AdminLayout>
      </Route>
      <Route path="/directory">
        <AdminLayout>
          <Directory />
        </AdminLayout>
      </Route>
      <Route path="/settings">
        <AdminLayout>
          <Settings />
        </AdminLayout>
      </Route>

      {/* Worker Routes */}
      <Route path="/worker" component={WorkerHome} />
      <Route path="/worker/pay" component={WorkerPay} />
      <Route path="/worker/clock">
        <Redirect to="/worker" />
      </Route>
      <Route path="/worker/scan">
        <Redirect to="/worker" />
      </Route>
      <Route path="/worker/profile">
        <Redirect to="/worker" />
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
