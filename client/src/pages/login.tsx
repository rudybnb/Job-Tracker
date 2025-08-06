import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [formData, setFormData] = useState({
    username: "",
    password: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignIn = async () => {
    if (!formData.username || !formData.password) {
      toast({
        title: "Missing Information",
        description: "Please enter both username and password",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    // Simulate login process
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Login Successful",
        description: "Welcome to JobFlow",
      });
      // Redirect to main dashboard
      window.location.href = '/';
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSignIn();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-blue-800/80 backdrop-blur-sm rounded-2xl p-8 border border-blue-700/50 shadow-2xl">
          <div className="space-y-6">
            {/* Username Field */}
            <div>
              <label className="block text-white text-sm font-medium mb-3">
                Username
              </label>
              <input
                type="text"
                placeholder="Enter username"
                value={formData.username}
                onChange={(e) => updateFormData("username", e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full bg-blue-700/50 border-2 border-yellow-500 rounded-lg px-4 py-3 text-white placeholder-blue-200 focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-white text-sm font-medium mb-3">
                Password
              </label>
              <input
                type="password"
                placeholder="Enter password"
                value={formData.password}
                onChange={(e) => updateFormData("password", e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full bg-blue-700/50 border border-blue-600 rounded-lg px-4 py-3 text-white placeholder-blue-200 focus:outline-none focus:border-yellow-400 focus:border-2 transition-colors"
              />
            </div>

            {/* Sign In Button */}
            <Button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 text-lg"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Signing In...
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
          </div>
        </div>

        {/* Footer Space */}
        <div className="mt-8 text-center">
          <p className="text-blue-300 text-sm">
            JobFlow - GPS Time Tracking & Job Management
          </p>
        </div>
      </div>
    </div>
  );
}