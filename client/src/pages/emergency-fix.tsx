import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function EmergencyFixPage() {
  const [step, setStep] = useState(1);
  
  const executeEmergencyFix = () => {
    console.log('🚨 EMERGENCY MOBILE FIX - Starting complete browser reset...');
    
    try {
      // Clear everything possible
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear cookies by setting them to expire
      document.cookie.split(";").forEach(cookie => {
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
      
      // Force complete page reload with new timestamp
      const emergencyUrl = `${window.location.origin}/?emergency=true&fix=complete&t=${Date.now()}&mobile=emergency&cache=destroyed`;
      
      // Multiple redirect methods
      window.location.replace(emergencyUrl);
      window.location.href = emergencyUrl;
      
      // Fallback after delay
      setTimeout(() => {
        window.location.reload();
      }, 100);
      
    } catch (error) {
      console.error('Emergency fix error:', error);
      window.location.href = `${window.location.origin}/?fallback=emergency`;
    }
  };

  return (
    <div className="min-h-screen bg-red-900 text-red-100 flex items-center justify-center p-4">
      <div className="bg-red-800 rounded-lg border-2 border-red-600 p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">🚨</div>
        <h1 className="text-2xl font-bold mb-4 text-red-200">EMERGENCY MOBILE FIX</h1>
        
        {step === 1 && (
          <>
            <p className="mb-6 text-red-300 text-sm">
              Your mobile browser has extreme caching issues. This emergency fix will:
            </p>
            
            <div className="text-left mb-6 space-y-2 text-xs text-red-300">
              <p>• Clear ALL localStorage and sessionStorage</p>
              <p>• Delete ALL cookies</p>
              <p>• Force complete page reload</p>
              <p>• Use emergency URL parameters</p>
              <p>• Multiple simultaneous refresh methods</p>
            </div>
            
            <Button 
              onClick={() => {
                setStep(2);
                setTimeout(executeEmergencyFix, 1000);
              }}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4"
            >
              🚨 ACTIVATE EMERGENCY FIX
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-4xl mb-4 animate-pulse">🔄</div>
            <h2 className="text-xl font-bold mb-4">EXECUTING EMERGENCY FIX</h2>
            <p className="text-sm text-red-300">
              Clearing all data and forcing complete refresh...
            </p>
          </>
        )}
        
        <div className="mt-6 p-3 bg-red-700 rounded text-xs text-red-300">
          <p><strong>If this doesn't work:</strong> Your mobile browser may need manual clearing of site data in browser settings.</p>
        </div>
      </div>
    </div>
  );
}