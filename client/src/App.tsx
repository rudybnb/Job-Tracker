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
import NotFound from "@/pages/not-found";
import AccountSwitcher from "@/components/AccountSwitcher";

function Router() {
  return (
    <div className="relative">
      <AccountSwitcher />
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/" component={GPSDashboard} />
        <Route path="/jobs" component={DirectJobAssignments} />
        <Route path="/task-progress" component={TaskProgress} />
        <Route path="/upload" component={UploadJob} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin-task-monitor" component={AdminTaskMonitor} />
        <Route path="/contractor-onboarding" component={ContractorOnboarding} />
        <Route path="/contractor-form" component={ContractorForm} />
        <Route path="/job-assignments" component={JobAssignments} />
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
