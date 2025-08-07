import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

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

export default function ContractorOnboarding() {
  const [activeTab, setActiveTab] = useState("Send Form");
  const [contractorName, setContractorName] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const { toast } = useToast();

  const handleSendForm = () => {
    if (!contractorName || !telegramId) {
      toast({
        title: "Missing Information",
        description: "Please fill in both contractor name and Telegram ID",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Form Sent Successfully",
      description: `Onboarding form sent to ${contractorName} via Telegram`,
    });

    // Clear form
    setContractorName("");
    setTelegramId("");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
            <span className="text-black font-bold text-sm">Pro</span>
          </div>
          <div>
            <div className="text-sm font-medium">Pro</div>
            <div className="text-xs text-slate-400">Simple Time Tracking</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Online</span>
          <i className="fas fa-sun text-yellow-400 ml-2"></i>
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4">
            <span className="text-white font-bold text-sm">RD</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-slate-400 text-lg">Send forms and manage contractor applications</h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-slate-800 rounded-lg p-1">
          {["Send Form", "Pending Review", "Reviewed"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-yellow-600 text-black'
                  : 'text-yellow-400 hover:bg-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Send Contractor Form */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center mb-6">
            <i className="fas fa-paper-plane text-yellow-400 mr-3 text-xl"></i>
            <h2 className="text-xl font-semibold text-yellow-400">Send Contractor Form</h2>
          </div>
          
          <p className="text-slate-400 text-sm mb-6">
            Send onboarding form to new contractors via Telegram
          </p>

          <div className="space-y-6">
            {/* Contractor Name Field */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Contractor Name *
              </label>
              <input
                type="text"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder="e.g. James Carpenter"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
              />
            </div>

            {/* Telegram ID Field */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Telegram ID *
              </label>
              <input
                type="text"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="@username or 123456789"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
              />
              <p className="text-slate-500 text-xs mt-1">
                Use @username or numeric ID
              </p>
            </div>

            {/* Information Box */}
            <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
              <div className="flex items-start space-x-3">
                <i className="fas fa-info-circle text-yellow-400 mt-1"></i>
                <div className="text-slate-300 text-sm">
                  <p className="font-medium mb-2">The contractor will receive a comprehensive form covering:</p>
                  <ul className="space-y-1 text-slate-400">
                    <li>• Personal details, right to work, CIS information</li>
                    <li>• Banking details, emergency contacts and trade experience</li>
                    <li>• Health & safety certifications</li>
                    <li>• Insurance documentation</li>
                    <li>• Tool inventory and availability</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSendForm}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-medium py-3 text-lg"
            >
              <i className="fas fa-paper-plane mr-2"></i>
              Send Onboarding Form
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-4 text-center">
          <button 
            onClick={() => window.location.href = '/'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-home block mb-1"></i>
            <span className="text-xs">Dashboard</span>
          </button>
          <button 
            onClick={() => window.location.href = '/job-assignments'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin-task-monitor'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
            className="py-3 px-4 text-yellow-400"
          >
            <i className="fas fa-upload block mb-1"></i>
            <span className="text-xs">Upload Job</span>
          </button>
        </div>
      </div>
      
      {/* Add bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}