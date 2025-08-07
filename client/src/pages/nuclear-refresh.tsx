import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function NuclearRefreshPage() {
  const [countdown, setCountdown] = useState(5);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          executeNuclearRefresh();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const executeNuclearRefresh = () => {
    console.log('🚀 NUCLEAR REFRESH - Destroying all caches...');
    
    // Clear everything aggressively
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear service workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => {
            registration.unregister();
          });
        });
      }
      
      // Clear all caches
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }
      
      // Nuclear URL with maximum cache busting
      const timestamp = Date.now();
      const random1 = Math.random().toString(36).substring(7);
      const random2 = Math.random().toString(36).substring(7);
      const nuclearUrl = `${window.location.origin}/?nuclear=true&v=2.0.2&t=${timestamp}&r1=${random1}&r2=${random2}&mobile=force&cache=destroy&refresh=nuclear`;
      
      // Try all methods simultaneously
      window.location.replace(nuclearUrl);
      window.location.href = nuclearUrl;
      window.open(nuclearUrl, '_self');
      
      // Final backup
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      console.error('Nuclear refresh error:', error);
      window.location.reload();
    }
  };

  const manualNuclearRefresh = () => {
    toast({
      title: "Nuclear Refresh Activated",
      description: "Destroying all caches and forcing complete refresh...",
      variant: "destructive"
    });
    
    setTimeout(executeNuclearRefresh, 1000);
  };

  return (
    <div className="min-h-screen bg-red-900 text-white flex items-center justify-center p-4">
      <div className="bg-red-800 rounded-lg border-2 border-red-600 p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">☢️</div>
        <h1 className="text-2xl font-bold mb-4">NUCLEAR REFRESH</h1>
        <p className="mb-6 text-red-200">
          Your mobile app is being extremely stubborn with caching. 
          This will destroy ALL cached data and force a complete refresh.
        </p>
        
        {countdown > 0 ? (
          <div className="mb-6">
            <div className="text-4xl font-mono mb-2">{countdown}</div>
            <p className="text-sm text-red-300">Auto-refresh in...</p>
          </div>
        ) : (
          <div className="mb-6">
            <div className="text-2xl mb-2">💥</div>
            <p className="text-sm">Refreshing now...</p>
          </div>
        )}
        
        <Button 
          onClick={manualNuclearRefresh}
          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold"
          disabled={countdown === 0}
        >
          ☢️ ACTIVATE NUCLEAR REFRESH NOW
        </Button>
        
        <p className="text-xs text-red-400 mt-4">
          This will clear ALL app data and force a complete reload.
          Use only if normal refresh methods have failed.
        </p>
      </div>
    </div>
  );
}