import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check admin credentials first
    if (username === "admin" && password === "admin123") {
      localStorage.setItem('userRole', 'admin');
      localStorage.setItem('isLoggedIn', 'true');
      window.location.href = '/admin';
      toast({
        title: "Login Successful",
        description: "Welcome back, Admin!",
      });
      return;
    }
    
    // Check contractor credentials from database
    try {
      const response = await fetch('/api/contractor-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        const contractor = await response.json();
        localStorage.setItem('userRole', 'contractor');
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('contractorName', `${contractor.firstName} ${contractor.lastName}`);
        window.location.href = '/';
        toast({
          title: "Login Successful",
          description: `Welcome back, ${contractor.firstName}!`,
        });
      } else {
        // Fallback to legacy contractor login
        if (username === "contractor" && password === "contractor123") {
          localStorage.setItem('userRole', 'contractor');
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('contractorName', 'James Wilson');
          window.location.href = '/';
          toast({
            title: "Login Successful",
            description: "Welcome back, James!",
          });
        } else {
          toast({
            title: "Login Failed",
            description: "Invalid username or password",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Login Failed",
        description: "Unable to connect to server",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">JobFlow Login</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-2 border-yellow-400 focus:border-yellow-500"
                placeholder="admin or dalwayne"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            >
              Sign In
            </Button>
          </form>
          
          {/* Test Credentials Info */}
          <div className="mt-6 p-4 bg-slate-100 rounded-lg">
            <h4 className="font-medium text-slate-700 mb-2">Admin Login:</h4>
            <div className="text-sm text-slate-600 mb-3">
              <div><strong>Username:</strong> admin</div>
              <div><strong>Password:</strong> admin123</div>
            </div>
            
            <h4 className="font-medium text-slate-700 mb-2">Contractor Login:</h4>
            <div className="text-sm text-slate-600">
              <div><strong>Username:</strong> contractor</div>
              <div><strong>Password:</strong> contractor123</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}