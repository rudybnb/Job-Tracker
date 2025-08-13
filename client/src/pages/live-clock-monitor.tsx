import { useState, useEffect } from "react";

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  return (
    <div className="fixed top-4 left-4 z-50 bg-slate-800 rounded-lg p-2 border border-slate-600 shadow-lg">
      <div className="flex items-center space-x-2">
        <span className="text-yellow-400 text-sm font-medium">Admin</span>
        <button
          onClick={handleLogout}
          className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default function LiveClockMonitor() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Auto redirect to dashboard after showing message
  useEffect(() => {
    const redirectTimer = setTimeout(() => {
      window.location.href = '/admin';
    }, 3000);

    return () => clearTimeout(redirectTimer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <LogoutButton />
      
      {/* Redirect Message */}
      <div className="text-center space-y-6 max-w-md mx-auto p-8">
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
          <i className="fas fa-arrow-right text-white text-xl"></i>
        </div>
        
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Live Monitoring Moved</h1>
          <p className="text-slate-400">
            Live clock monitoring is now integrated into the main Admin Dashboard for easier access.
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
            <h3 className="text-green-400 font-medium mb-2">What's New:</h3>
            <ul className="text-slate-300 text-sm space-y-1">
              <li>• Live monitoring on main dashboard</li>
              <li>• Simple, clean layout</li>
              <li>• Quick access from bottom nav</li>
            </ul>
          </div>
          
          <button 
            onClick={() => window.location.href = '/admin'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Go to Admin Dashboard
          </button>
          
          <p className="text-slate-500 text-sm">
            Redirecting automatically in 3 seconds...
          </p>
        </div>
      </div>
    </div>
  );
}