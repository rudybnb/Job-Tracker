import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, CheckCircle, XCircle, Clock } from "lucide-react";

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
  
  // Simple form to send invitation
  const [contractorName, setContractorName] = useState("");
  const [contractorEmail, setContractorEmail] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [telegramId, setTelegramId] = useState("");
  
  const [pendingApplications, setPendingApplications] = useState([
    {
      id: "1",
      name: "James Carpenter",
      phone: "07534251548",
      email: "james@gmail.com",
      specialization: ["Carpentry", "Flooring"],
      status: "pending",
      submittedDate: "06/08/2025",
      telegramId: "@james_contractor"
    },
    {
      id: "2", 
      name: "Sarah Mason",
      phone: "07845123456",
      email: "sarah.mason@email.com",
      specialization: ["Bricklaying", "Masonry"],
      status: "pending",
      submittedDate: "05/08/2025",
      telegramId: "@sarah_mason"
    }
  ]);
  
  const [reviewedApplications, setReviewedApplications] = useState([
    {
      id: "3",
      name: "Mike Electrician", 
      phone: "07567890123",
      email: "mike.elec@email.com",
      specialization: ["Electrical"],
      status: "approved",
      reviewedDate: "04/08/2025",
      telegramId: "@mike_electrical"
    }
  ]);

  const { toast } = useToast();

  const handleSendForm = async () => {
    if (!contractorName || !contractorEmail || !contractorPhone) {
      toast({
        title: "Missing Information",
        description: "Please provide contractor's name, email, and phone number",
        variant: "destructive",
      });
      return;
    }

    try {
      // Generate unique form link
      const formId = Math.random().toString(36).substr(2, 9);
      const formLink = `${window.location.origin}/contractor-form?id=${formId}&name=${encodeURIComponent(contractorName)}`;
      
      // Send Telegram message with link to professional onboarding form
      const telegramMessage = `📋 Contractor Onboarding - ER Build & Design

Hello ${contractorName}!

You've been invited to join our construction team. Please complete your contractor registration form:

🔗 Form Link: ${formLink}

📝 What you'll need:
• Personal details & contact information
• Passport photo and right to work documents
• CIS number and tax details
• CSCS card information (if available)
• Bank details for payments
• Emergency contact details
• Your primary trade and tool availability

⏱️ Please complete within 24 hours

❓ Need help? Reply to this message

📱 Complete Form`;

      // Send directly via Telegram API
      if (telegramId) {
        const response = await fetch('https://api.telegram.org/bot8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA/sendMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: telegramId.startsWith('@') ? telegramId.slice(1) : telegramId,
            text: telegramMessage,
            parse_mode: 'HTML'
          }),
        });

        if (response.ok) {
          toast({
            title: "Onboarding Form Sent Successfully",
            description: `Professional registration form sent to ${contractorName} via Telegram with secure link.`,
          });
        } else {
          toast({
            title: "Form Link Prepared",
            description: `Professional form link ready for ${contractorName}. Send manually if needed.`,
          });
        }
      } else {
        toast({
          title: "Form Link Generated", 
          description: `Professional registration form link prepared for ${contractorName}. Share via any contact method.`,
        });
      }

      // Add to pending applications
      const newApplication = {
        id: Date.now().toString(),
        name: contractorName,
        phone: contractorPhone,
        email: contractorEmail,
        specialization: ["To Be Determined"],
        status: "invited" as const,
        submittedDate: new Date().toLocaleDateString('en-GB'),
        telegramId: telegramId
      };

      setPendingApplications(prev => [newApplication, ...prev]);

      // Reset form
      setContractorName("");
      setContractorEmail("");
      setContractorPhone("");
      setTelegramId("");

    } catch (error) {
      console.error('Error sending onboarding form:', error);
      toast({
        title: "Error",
        description: "Failed to send onboarding form. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleApproveApplication = (applicationId: string) => {
    const application = pendingApplications.find(app => app.id === applicationId);
    if (application) {
      setReviewedApplications(prev => [...prev, { ...application, status: "approved", reviewedDate: new Date().toLocaleDateString('en-GB') }]);
      setPendingApplications(prev => prev.filter(app => app.id !== applicationId));
      
      toast({
        title: "Application Approved",
        description: `${application.name} has been approved and added to the contractor network.`,
      });
    }
  };

  const handleRejectApplication = (applicationId: string) => {
    const application = pendingApplications.find(app => app.id === applicationId);
    if (application) {
      setPendingApplications(prev => prev.filter(app => app.id !== applicationId));
      
      toast({
        title: "Application Rejected",
        description: `${application.name}'s application has been rejected.`,
        variant: "destructive",
      });
    }
  };

  const renderSendFormTab = () => (
    <div className="space-y-6">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
        <h3 className="text-yellow-400 text-lg font-medium mb-4">Send Onboarding Form</h3>
        <p className="text-slate-300 mb-6 text-sm">
          Enter contractor details to send them a professional registration form link via Telegram.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-yellow-400 text-sm font-medium mb-2">Contractor Name *</label>
            <input
              type="text"
              value={contractorName}
              onChange={(e) => setContractorName(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          
          <div>
            <label className="block text-yellow-400 text-sm font-medium mb-2">Email Address *</label>
            <input
              type="email"
              value={contractorEmail}
              onChange={(e) => setContractorEmail(e.target.value)}
              placeholder="john@email.com"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          
          <div>
            <label className="block text-yellow-400 text-sm font-medium mb-2">Phone Number *</label>
            <input
              type="tel"
              value={contractorPhone}
              onChange={(e) => setContractorPhone(e.target.value)}
              placeholder="07123456789"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          
          <div>
            <label className="block text-yellow-400 text-sm font-medium mb-2">Telegram ID (Optional)</label>
            <input
              type="text"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder="@username or 7617462316"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            />
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4 mb-6">
          <h4 className="text-blue-400 font-medium mb-2">What happens next:</h4>
          <ol className="text-slate-300 text-sm space-y-1">
            <li>1. Professional form link sent to contractor via Telegram</li>
            <li>2. Contractor completes 6-step registration form</li>
            <li>3. Application appears in "Pending Review" tab</li>
            <li>4. You review and approve/reject their application</li>
            <li>5. Approved contractors can start receiving job assignments</li>
          </ol>
        </div>

        <Button
          onClick={handleSendForm}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-medium py-3 flex items-center justify-center space-x-2"
        >
          <Send className="w-4 h-4" />
          <span>Send Onboarding Form</span>
        </Button>
      </div>
    </div>
  );

  const renderPendingReviewTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-yellow-400 text-lg font-medium">Applications Pending Review</h3>
        <Badge variant="secondary" className="bg-orange-600 text-white">
          {pendingApplications.length} Pending
        </Badge>
      </div>

      {pendingApplications.length === 0 ? (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-8 text-center">
          <Clock className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h4 className="text-slate-300 text-lg mb-2">No Pending Applications</h4>
          <p className="text-slate-500">Applications will appear here when contractors submit their forms.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pendingApplications.map((application) => (
            <div key={application.id} className="bg-slate-800 border border-slate-600 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-white text-lg font-medium">{application.name}</h4>
                  <div className="text-slate-400 text-sm space-y-1">
                    <p>📧 {application.email}</p>
                    <p>📞 {application.phone}</p>
                    <p>📅 Submitted: {application.submittedDate}</p>
                    {application.telegramId && <p>💬 {application.telegramId}</p>}
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className="bg-orange-600 text-white"
                >
                  {application.status}
                </Badge>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  onClick={() => handleApproveApplication(application.id)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center space-x-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Approve</span>
                </Button>
                <Button
                  onClick={() => handleRejectApplication(application.id)}
                  variant="destructive"
                  className="flex-1 flex items-center justify-center space-x-2"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderApprovedTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-yellow-400 text-lg font-medium">Approved Contractors</h3>
        <Badge variant="secondary" className="bg-green-600 text-white">
          {reviewedApplications.length} Approved
        </Badge>
      </div>

      {reviewedApplications.length === 0 ? (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-8 text-center">
          <CheckCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h4 className="text-slate-300 text-lg mb-2">No Approved Contractors</h4>
          <p className="text-slate-500">Approved contractors will appear here after review.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reviewedApplications.map((contractor) => (
            <div key={contractor.id} className="bg-slate-800 border border-green-600 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-white text-lg font-medium">{contractor.name}</h4>
                  <div className="text-slate-400 text-sm space-y-1">
                    <p>📧 {contractor.email}</p>
                    <p>📞 {contractor.phone}</p>
                    <p>✅ Approved: {contractor.reviewedDate}</p>
                    {contractor.telegramId && <p>💬 {contractor.telegramId}</p>}
                  </div>
                </div>
                <Badge variant="secondary" className="bg-green-600 text-white">
                  Approved
                </Badge>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {contractor.specialization.map((spec, index) => (
                  <Badge key={index} variant="outline" className="border-yellow-500 text-yellow-400">
                    {spec}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white relative">
      <LogoutButton />
      
      {/* Header */}
      <div className="bg-yellow-500 text-black p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold">Contractor Onboarding</h1>
          <p className="mt-1">Send registration forms and manage contractor applications</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-800 border-b border-slate-600">
        <div className="max-w-6xl mx-auto">
          <div className="flex space-x-8">
            {["Send Form", "Pending Review", "Approved"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? "border-yellow-500 text-yellow-400"
                    : "border-transparent text-slate-400 hover:text-slate-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-6">
        {activeTab === "Send Form" && renderSendFormTab()}
        {activeTab === "Pending Review" && renderPendingReviewTab()}
        {activeTab === "Approved" && renderApprovedTab()}
      </div>
    </div>
  );
}