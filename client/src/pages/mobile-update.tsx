import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function MobileUpdatePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-800 text-white flex items-center justify-center p-4">
      <div className="bg-slate-700 rounded-lg p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">📱</div>
        <h1 className="text-2xl font-bold mb-4 text-yellow-400">Mobile Update Center</h1>
        <p className="mb-6 text-slate-300 text-sm">
          Choose the refresh method for your stubborn mobile browser:
        </p>
        
        <div className="space-y-4">
          <Button 
            onClick={() => setLocation('/extreme-refresh')}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3"
          >
            💥 EXTREME REFRESH
            <span className="block text-xs mt-1">Most powerful - destroys all caches</span>
          </Button>
          
          <Button 
            onClick={() => setLocation('/nuclear-refresh')}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3"
          >
            ☢️ NUCLEAR REFRESH
            <span className="block text-xs mt-1">Strong - automatic countdown</span>
          </Button>
          
          <Button 
            onClick={() => setLocation('/mobile-test')}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3"
          >
            🧪 TEST & REFRESH
            <span className="block text-xs mt-1">Gentle - manual control</span>
          </Button>
          
          <div className="mt-6 p-4 bg-slate-600 rounded border-l-4 border-yellow-400">
            <p className="text-xs text-slate-300">
              <strong className="text-yellow-400">Current App Version:</strong> 2.0.3-extreme-refresh
            </p>
            <p className="text-xs text-slate-300 mt-1">
              If you still see old content after refresh, your browser has extreme caching issues.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}