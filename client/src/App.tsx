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
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={GPSDashboard} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/upload" component={UploadJob} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/contractor-onboarding" component={ContractorOnboarding} />
      <Route path="/contractor-form" component={ContractorForm} />
      <Route component={NotFound} />
    </Switch>
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
