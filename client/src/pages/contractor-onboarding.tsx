import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function ContractorOnboarding() {
  const [activeTab, setActiveTab] = useState("send");
  const [contractorName, setContractorName] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const { toast } = useToast();

  const handleSendForm = () => {
    if (!contractorName || !telegramId) {
      toast({
        title: "Missing Information",
        description: "Please fill in both contractor name and Telegram ID",
        variant: "destructive"
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
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4">
            <span className="text-white font-bold text-sm">RD</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Page Title */}
        <div className="mb-6">
          <h2 className="text-slate-400 text-lg mb-2">Send forms and manage contractor applications</h2>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          <button
            onClick={() => setActiveTab("send")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "send" 
                ? "bg-yellow-600 text-black" 
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Send Form
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "pending" 
                ? "bg-yellow-600 text-black" 
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Pending Review
          </button>
          <button
            onClick={() => setActiveTab("reviewed")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "reviewed" 
                ? "bg-yellow-600 text-black" 
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Reviewed
          </button>
        </div>

        {/* Send Form Tab Content */}
        {activeTab === "send" && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center mb-6">
              <i className="fas fa-paper-plane text-yellow-400 mr-3"></i>
              <h3 className="text-xl font-bold text-yellow-400">Send Contractor Form</h3>
            </div>
            
            <p className="text-slate-400 text-sm mb-6">
              Send onboarding form to new contractors via Telegram
            </p>

            <div className="space-y-6">
              {/* Contractor Name Field */}
              <div>
                <label className="block text-yellow-400 font-medium mb-2">
                  Contractor Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. James Carpenter"
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Telegram ID Field */}
              <div>
                <label className="block text-yellow-400 font-medium mb-2">
                  Telegram ID *
                </label>
                <input
                  type="text"
                  placeholder="@username or 1234567890"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-yellow-400"
                />
                <p className="text-slate-500 text-xs mt-1">
                  Use @username or numeric ID
                </p>
              </div>

              {/* Information Box */}
              <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
                <div className="flex items-start">
                  <i className="fas fa-info-circle text-blue-400 mr-3 mt-1"></i>
                  <div className="text-slate-300 text-sm">
                    <p className="mb-2">
                      The contractor will receive a comprehensive form covering:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-slate-400">
                      <li>Personal details</li>
                      <li>Right to work verification</li>
                      <li>CIS information</li>
                      <li>Banking details</li>
                      <li>Emergency contacts</li>
                      <li>Trade certifications</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Send Button */}
              <Button
                onClick={handleSendForm}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-medium py-3 flex items-center justify-center"
              >
                <i className="fab fa-telegram-plane mr-2"></i>
                Send Form via Telegram
              </Button>
            </div>
          </div>
        )}

        {/* Pending Review Tab */}
        {activeTab === "pending" && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="text-center py-8">
              <i className="fas fa-clock text-yellow-400 text-4xl mb-4"></i>
              <h3 className="text-xl font-semibold text-white mb-2">No Pending Reviews</h3>
              <p className="text-slate-400">
                Completed contractor forms will appear here for review
              </p>
            </div>
          </div>
        )}

        {/* Reviewed Tab */}
        {activeTab === "reviewed" && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="text-center py-8">
              <i className="fas fa-check-circle text-green-400 text-4xl mb-4"></i>
              <h3 className="text-xl font-semibold text-white mb-2">No Reviewed Applications</h3>
              <p className="text-slate-400">
                Approved contractor applications will be listed here
              </p>
            </div>
          </div>
        )}
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
            onClick={() => window.location.href = '/jobs'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
            className="py-3 px-4 text-slate-400 hover:text-white"
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