import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, UserCircle, Shield, Users, Briefcase } from "lucide-react";

export default function Login() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Workforce Management</CardTitle>
            <CardDescription className="text-base mt-2">
              Kent • London • Essex Care Sites
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center text-sm text-muted-foreground">
            Sign in to access your schedule, attendance, payroll, and more
          </div>
          
          <Button 
            onClick={handleLogin}
            className="w-full h-12 text-base"
            data-testid="button-login"
          >
            <UserCircle className="mr-2 h-5 w-5" />
            Login with Replit
          </Button>

          <div className="space-y-3 pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground font-medium">
              Quick Login for Testing
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => window.location.href = "/api/dev-login/admin"}
                variant="outline"
                size="sm"
                className="flex flex-col gap-1 h-auto py-3"
                data-testid="button-dev-login-admin"
              >
                <Shield className="h-4 w-4" />
                <span className="text-xs">Admin</span>
              </Button>
              <Button
                onClick={() => window.location.href = "/api/dev-login/site_manager"}
                variant="outline"
                size="sm"
                className="flex flex-col gap-1 h-auto py-3"
                data-testid="button-dev-login-manager"
              >
                <Briefcase className="h-4 w-4" />
                <span className="text-xs">Manager</span>
              </Button>
              <Button
                onClick={() => window.location.href = "/api/dev-login/worker"}
                variant="outline"
                size="sm"
                className="flex flex-col gap-1 h-auto py-3"
                data-testid="button-dev-login-worker"
              >
                <Users className="h-4 w-4" />
                <span className="text-xs">Worker</span>
              </Button>
            </div>
          </div>

          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>Staff will see their mobile interface</p>
            <p>Admins and managers will see the management dashboard</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
