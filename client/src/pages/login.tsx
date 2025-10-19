import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, UserCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { resolveUrl } from "@/lib/queryClient";

export default function Login() {
  const isDev = import.meta.env.DEV;
  const handleLogin = () => {
    window.location.href = resolveUrl("/api/login");
  };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDevSimpleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) {
      setError("Please enter username and password");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(resolveUrl("/api/dev-simple-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "Login failed");
      }
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Social Care Homes Workforce Portal</CardTitle>
            <CardDescription className="text-base mt-2">
              Sign in to access your schedule, attendance, payroll, and more
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isDev ? (
            <form onSubmit={handleDevSimpleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="input-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" data-testid="error-login">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full h-12 text-base"
                disabled={loading}
                data-testid="button-dev-simple-login"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          ) : (
            <Button
              onClick={handleLogin}
              className="w-full h-12 text-base"
              data-testid="button-login"
            >
              <UserCircle className="mr-2 h-5 w-5" />
              Continue with Replit
            </Button>
          )}

          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>Staff see the mobile interface after sign-in</p>
            <p>Admins and managers see the management dashboard</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
