import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ExtremeRefreshPage() {
  const [stage, setStage] = useState(0);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (stage === 0) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            setStage(1);
            executeExtremeRefresh();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [stage]);

  const executeExtremeRefresh = async () => {
    console.log('💥 EXTREME REFRESH - Multiple destruction methods...');
    
    setStage(2); // Show "Destroying caches" message
    
    try {
      // Method 1: Clear all storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Method 2: Clear IndexedDB
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases();
        await Promise.all(
          databases.map(db => {
            const deleteReq = indexedDB.deleteDatabase(db.name!);
            return new Promise(resolve => {
              deleteReq.onsuccess = () => resolve(true);
              deleteReq.onerror = () => resolve(false);
            });
          })
        );
      }
      
      // Method 3: Clear Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      }
      
      // Method 4: Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      // Method 5: Create impossible-to-cache URL
      const timestamp = Date.now();
      const random1 = Math.random().toString(36);
      const random2 = Math.random().toString(36);
      const random3 = Math.random().toString(36);
      const extremeUrl = `${window.location.origin}/?extreme=true&v=2.0.3-extreme&t=${timestamp}&r1=${random1}&r2=${random2}&r3=${random3}&mobile=destroy&cache=obliterate&browser=stubborn&force=nuclear&update=mandatory&refresh=extreme`;
      
      setStage(3); // Show "Redirecting" message
      
      // Method 6: Multiple simultaneous redirects
      setTimeout(() => {
        window.location.replace(extremeUrl);
      }, 100);
      
      setTimeout(() => {
        window.location.href = extremeUrl;
      }, 200);
      
      setTimeout(() => {
        window.open(extremeUrl, '_self');
      }, 300);
      
      // Method 7: Hard reload fallback
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('Extreme refresh error:', error);
      // Ultimate fallback
      window.location.href = `${window.location.origin}/?fallback=${Date.now()}`;
    }
  };

  const manualExtreme = () => {
    setStage(1);
    executeExtremeRefresh();
  };

  return (
    <div className="min-h-screen bg-red-950 text-red-100 flex items-center justify-center p-4">
      <div className="bg-red-900 rounded-lg border-2 border-red-700 p-8 max-w-md w-full text-center">
        
        {stage === 0 && (
          <>
            <div className="text-6xl mb-4">💥</div>
            <h1 className="text-2xl font-bold mb-4 text-red-200">EXTREME REFRESH</h1>
            <p className="mb-6 text-red-300 text-sm">
              Your mobile browser is extremely stubborn. This will use 7 different methods 
              to destroy ALL cached data and force a complete update.
            </p>
            
            <div className="mb-6">
              <div className="text-5xl font-mono mb-2 text-red-200">{countdown}</div>
              <p className="text-sm text-red-400">Auto-activating in...</p>
            </div>
            
            <Button 
              onClick={manualExtreme}
              className="w-full bg-red-700 hover:bg-red-600 text-red-100 font-bold border border-red-600"
            >
              💥 ACTIVATE EXTREME REFRESH NOW
            </Button>
          </>
        )}

        {stage === 1 && (
          <>
            <div className="text-6xl mb-4 animate-pulse">🔄</div>
            <h2 className="text-xl font-bold mb-4 text-red-200">PREPARING DESTRUCTION</h2>
            <p className="text-sm text-red-300">Initializing cache obliteration...</p>
          </>
        )}

        {stage === 2 && (
          <>
            <div className="text-6xl mb-4 animate-spin">💣</div>
            <h2 className="text-xl font-bold mb-4 text-red-200">DESTROYING CACHES</h2>
            <div className="text-sm text-red-300 space-y-1">
              <p>• Clearing localStorage ✓</p>
              <p>• Clearing sessionStorage ✓</p>
              <p>• Destroying IndexedDB ✓</p>
              <p>• Unregistering Service Workers ✓</p>
              <p>• Obliterating browser caches ✓</p>
            </div>
          </>
        )}

        {stage === 3 && (
          <>
            <div className="text-6xl mb-4">🚀</div>
            <h2 className="text-xl font-bold mb-4 text-red-200">FORCE REDIRECTING</h2>
            <p className="text-sm text-red-300">Using 7 simultaneous methods to update your app...</p>
          </>
        )}
        
        <p className="text-xs text-red-500 mt-6">
          This is the most aggressive refresh method possible.
          If this doesn't work, the mobile browser has serious caching issues.
        </p>
      </div>
    </div>
  );
}