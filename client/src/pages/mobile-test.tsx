import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { VersionChecker } from "@/utils/version-check";

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userRole');
    window.location.href = '/auth';
  };

  return (
    <div className="absolute top-4 right-4 z-50">
      <div className="flex items-center space-x-2">
        <span className="text-yellow-400 text-sm font-medium">Admin</span>
        <Button
          onClick={handleLogout}
          size="sm"
          className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white"
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

export default function MobileTestPage() {
  const [testResult, setTestResult] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  const testTelegramIntegration = async () => {
    setIsTesting(true);
    setTestResult('Testing Telegram integration...');
    
    try {
      const response = await fetch('/api/send-telegram-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractorName: "James",
          phone: "07534251548",
          hbxlJob: "MOBILE UPDATE TEST - Version 2.0.1",
          workLocation: "Mobile Device",
          buildPhases: ["Mobile Cache Fixed", "Telegram Working", "CORS Resolved"],
          startDate: new Date().toLocaleDateString('en-GB'),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setTestResult('✅ SUCCESS: Telegram notification sent! Check your phone.');
        toast({
          title: "Test Successful!",
          description: "Telegram notification sent successfully. The mobile app is now updated!",
        });
      } else {
        setTestResult(`❌ FAILED: ${result.reason || 'Unknown error'}`);
        toast({
          title: "Test Failed",
          description: "Telegram notification failed. Check console for details.",
          variant: "destructive"
        });
      }
    } catch (error) {
      setTestResult(`❌ ERROR: ${error instanceof Error ? error.message : 'Network error'}`);
      toast({
        title: "Network Error",
        description: "Could not connect to backend. The CORS issue may not be fully resolved.",
        variant: "destructive"
      });
    }
    
    setIsTesting(false);
  };

  const forceRefreshApp = () => {
    toast({
      title: "Force Refreshing App",
      description: "Clearing all caches and reloading...",
    });
    
    setTimeout(() => {
      VersionChecker.forceRefreshWithCacheBust();
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
            <span className="text-black font-bold text-sm">📱</span>
          </div>
          <div>
            <div className="text-sm font-medium">Mobile Test</div>
            <div className="text-xs text-slate-400">Version: {VersionChecker.getCurrentVersion()}</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Updated</span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Page Title */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-yellow-400">Mobile Update Test</h1>
        </div>

        {/* Version Info */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">📱</span>
            <h3 className="text-lg font-semibold text-green-400">App Version Status</h3>
          </div>
          
          <div className="space-y-2 text-sm">
            <p><strong>Current Version:</strong> {VersionChecker.getCurrentVersion()}</p>
            <p><strong>User Agent:</strong> {navigator.userAgent.substring(0, 80)}...</p>
            <p><strong>Cache Busting:</strong> ✅ Active</p>
            <p><strong>Timestamp:</strong> {new Date().toISOString()}</p>
          </div>
        </div>

        {/* Test Actions */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">🧪</span>
            <h3 className="text-lg font-semibold text-yellow-400">Test Mobile Integration</h3>
          </div>
          
          <div className="space-y-4">
            <Button 
              onClick={testTelegramIntegration}
              disabled={isTesting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center space-x-2"
            >
              {isTesting ? (
                <>
                  <span className="animate-spin">⚙️</span>
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <span>📞</span>
                  <span>Test Telegram Notification</span>
                </>
              )}
            </Button>
            
            <Button 
              onClick={forceRefreshApp}
              variant="outline"
              className="w-full border-slate-600 hover:bg-slate-700"
            >
              <span className="mr-2">🔄</span>
              Force App Refresh
            </Button>
          </div>

          {testResult && (
            <div className="mt-4 p-4 bg-slate-900 rounded border border-slate-600">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Test Result:</h4>
              <p className="text-sm font-mono">{testResult}</p>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">📋</span>
            <h3 className="text-lg font-semibold text-slate-300">Test Instructions</h3>
          </div>
          
          <div className="text-sm text-slate-400 space-y-2">
            <p><strong>1. Version Check:</strong> If you see "2.0.1-mobile-force-refresh" above, the mobile app is updated.</p>
            <p><strong>2. Telegram Test:</strong> Click the blue button to test if notifications work on mobile.</p>
            <p><strong>3. Expected Result:</strong> You should receive a Telegram message on phone 07534251548.</p>
            <p><strong>4. If It Works:</strong> The CORS issue is completely resolved on mobile!</p>
          </div>
        </div>
      </div>
    </div>
  );
}