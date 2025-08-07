import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import GPSDashboard from "@/pages/gps-dashboard";
import Jobs from "@/pages/jobs";
import UploadJob from "@/pages/upload-job";
import AdminDashboard from "@/pages/admin-dashboard";
import ContractorOnboarding from "@/pages/contractor-onboarding";
import ContractorForm from "@/pages/contractor-form";
import JobAssignments from "@/pages/job-assignments";
import Login from "@/pages/login";
import TaskProgress from "@/pages/task-progress";
import DirectJobAssignments from "@/pages/direct-job-assignments";
import AdminTaskMonitor from "@/pages/admin-task-monitor";
import SystemCleanupPage from "@/pages/system-cleanup";
import NotFound from "@/pages/not-found";
import ProtectedRoute from "@/components/ProtectedRoute";

function Router() {
  return (
    <div className="relative">
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/" component={() => (
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        )} />
        <Route path="/upload" component={() => (
          <ProtectedRoute requiredRole="admin">
            <UploadJob />
          </ProtectedRoute>
        )} />
        <Route path="/admin" component={() => (
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        )} />
        <Route path="/admin-task-monitor" component={() => (
          <ProtectedRoute requiredRole="admin">
            <AdminTaskMonitor />
          </ProtectedRoute>
        )} />
        <Route path="/contractor-onboarding" component={() => (
          <ProtectedRoute requiredRole="admin">
            <ContractorOnboarding />
          </ProtectedRoute>
        )} />
        <Route path="/contractor-form" component={() => (
          <ProtectedRoute requiredRole="admin">
            <ContractorForm />
          </ProtectedRoute>
        )} />
        <Route path="/job-assignments" component={() => (
          <ProtectedRoute requiredRole="admin">
            <JobAssignments />
          </ProtectedRoute>
        )} />
        <Route path="/system-cleanup" component={() => (
          <ProtectedRoute requiredRole="admin">
            <SystemCleanupPage />
          </ProtectedRoute>
        )} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
