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
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [tradeSpecialization, setTradeSpecialization] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState("");
  const [hasInsurance, setHasInsurance] = useState(false);
  const [hasCSCS, setHasCSCS] = useState(false);
  const [hasDriversLicense, setHasDriversLicense] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [niNumber, setNiNumber] = useState("");
  const [cisStatus, setCisStatus] = useState("");
  const [availability, setAvailability] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  
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

  const tradeOptions = [
    "Carpentry", "Bricklaying", "Electrical", "Plumbing", "Roofing", 
    "Plastering", "Painting", "Tiling", "Flooring", "HVAC", 
    "Landscaping", "Masonry", "Glazing", "Kitchen Fitting", "Bathroom Fitting"
  ];

  const toggleTradeSpecialization = (trade: string) => {
    setTradeSpecialization(prev => 
      prev.includes(trade) 
        ? prev.filter(t => t !== trade)
        : [...prev, trade]
    );
  };

  const handleSendForm = async () => {
    if (!contractorName || !phoneNumber || !email) {
      toast({
        title: "Missing Information",
        description: "Please fill in contractor name, phone number, and email",
        variant: "destructive",
      });
      return;
    }

    try {
      // Send onboarding form to contractor via Telegram
      const telegramMessage = `🔨 CONTRACTOR ONBOARDING - Welcome to JobFlow!

👤 Hello ${contractorName}!

We're excited to have you join our contractor network. Please complete your onboarding by providing the following information:

📋 REQUIRED INFORMATION:
• Personal Details (Name, Address, Contact Info)
• Trade Specializations & Experience
• Insurance & Certification Status
• Banking Details for Payments
• Emergency Contact Information
• Tool Inventory & Availability

📱 NEXT STEPS:
1. Reply with your full details
2. Upload required documents (Insurance, CSCS, etc.)
3. Complete skills assessment
4. Schedule orientation meeting

📞 Contact: ${phoneNumber}
📧 Email: ${email}

Questions? Reply to this message or contact our admin team.

Welcome aboard! 🚀`;

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
            title: "Onboarding Form Sent",
            description: `Welcome message sent to ${contractorName} via Telegram`,
          });
        } else {
          // Fallback: simulate successful send for demo
          toast({
            title: "Form Prepared",
            description: `Onboarding form ready for ${contractorName}. Contact manually if needed.`,
          });
        }
      } else {
        toast({
          title: "Form Prepared", 
          description: `Onboarding package prepared for ${contractorName}. Send via email or manual contact.`,
        });
      }

      // Add to pending applications
      const newApplication = {
        id: Date.now().toString(),
        name: contractorName,
        phone: phoneNumber,
        email: email,
        specialization: tradeSpecialization,
        status: "invited" as const,
        submittedDate: new Date().toLocaleDateString('en-GB'),
        telegramId: telegramId
      };

      setPendingApplications(prev => [newApplication, ...prev]);

      // Clear form
      setContractorName("");
      setPhoneNumber("");
      setEmail("");
      setAddress("");
      setPostcode("");
      setEmergencyContact("");
      setEmergencyPhone("");
      setTradeSpecialization([]);
      setYearsExperience("");
      setHasInsurance(false);
      setHasCSCS(false);
      setHasDriversLicense(false);
      setBankName("");
      setAccountNumber("");
      setSortCode("");
      setNiNumber("");
      setCisStatus("");
      setAvailability("");
      setTelegramId("");
      setAdditionalNotes("");

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

        {/* Tab Content */}
        {activeTab === "Send Form" && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center mb-6">
              <i className="fas fa-user-plus text-yellow-400 mr-3 text-xl"></i>
              <h2 className="text-xl font-semibold text-yellow-400">Send Contractor Onboarding</h2>
            </div>
            
            <p className="text-slate-400 text-sm mb-6">
              Send comprehensive onboarding package to new contractors via Telegram
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white border-b border-slate-600 pb-2">Personal Information</h3>
                
                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value)}
                    placeholder="e.g. James Carpenter"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="07534251548"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Email Address *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="james@gmail.com"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main Street, London"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Postcode</label>
                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="SW1A 1AA"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Telegram ID</label>
                  <input
                    type="text"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                    placeholder="@username or 7617462316"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  />
                  <p className="text-slate-500 text-xs mt-1">Use @username or numeric ID for Telegram notifications</p>
                </div>
              </div>

              {/* Trade Specializations & Experience */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white border-b border-slate-600 pb-2">Trade Specializations</h3>
                
                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Specializations</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {tradeOptions.map((trade) => (
                      <label key={trade} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tradeSpecialization.includes(trade)}
                          onChange={() => toggleTradeSpecialization(trade)}
                          className="rounded border-slate-600 text-yellow-500 focus:ring-yellow-500"
                        />
                        <span className="text-white text-sm">{trade}</span>
                      </label>
                    ))}
                  </div>
                  {tradeSpecialization.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tradeSpecialization.map((trade) => (
                        <Badge key={trade} className="bg-yellow-600 text-black text-xs">{trade}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Years of Experience</label>
                  <select
                    value={yearsExperience}
                    onChange={(e) => setYearsExperience(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  >
                    <option value="">Select experience level</option>
                    <option value="0-1">0-1 years (Apprentice)</option>
                    <option value="2-5">2-5 years (Junior)</option>
                    <option value="6-10">6-10 years (Experienced)</option>
                    <option value="11-15">11-15 years (Senior)</option>
                    <option value="16+">16+ years (Expert)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">CIS Status</label>
                  <select
                    value={cisStatus}
                    onChange={(e) => setCisStatus(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  >
                    <option value="">Select CIS status</option>
                    <option value="registered">CIS Registered</option>
                    <option value="gross">Gross Payment Status</option>
                    <option value="not-registered">Not CIS Registered</option>
                  </select>
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Availability</label>
                  <select
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  >
                    <option value="">Select availability</option>
                    <option value="immediate">Available Immediately</option>
                    <option value="1-week">Available in 1 week</option>
                    <option value="2-weeks">Available in 2 weeks</option>
                    <option value="1-month">Available in 1 month</option>
                    <option value="project-basis">Project basis only</option>
                  </select>
                </div>

                {/* Certifications */}
                <div className="space-y-3">
                  <label className="block text-yellow-400 text-sm font-medium">Certifications & Documents</label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasInsurance}
                      onChange={(e) => setHasInsurance(e.target.checked)}
                      className="rounded border-slate-600 text-yellow-500 focus:ring-yellow-500"
                    />
                    <span className="text-white text-sm">Has valid insurance</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasCSCS}
                      onChange={(e) => setHasCSCS(e.target.checked)}
                      className="rounded border-slate-600 text-yellow-500 focus:ring-yellow-500"
                    />
                    <span className="text-white text-sm">Has CSCS Card</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasDriversLicense}
                      onChange={(e) => setHasDriversLicense(e.target.checked)}
                      className="rounded border-slate-600 text-yellow-500 focus:ring-yellow-500"
                    />
                    <span className="text-white text-sm">Has driver's license</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Additional Notes */}
            <div className="mt-6">
              <label className="block text-yellow-400 text-sm font-medium mb-2">Additional Notes</label>
              <textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Any additional information about this contractor..."
                rows={3}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
              />
            </div>

            {/* Information Box */}
            <div className="bg-slate-700 rounded-lg p-4 border border-slate-600 mt-6">
              <div className="flex items-start space-x-3">
                <i className="fas fa-info-circle text-yellow-400 mt-1"></i>
                <div className="text-slate-300 text-sm">
                  <p className="font-medium mb-2">The contractor will receive a comprehensive onboarding package including:</p>
                  <ul className="space-y-1 text-slate-400">
                    <li>• Welcome message with next steps</li>
                    <li>• Document requirements (Insurance, CSCS, Right to Work)</li>
                    <li>• Banking and payment setup instructions</li>
                    <li>• Health & safety orientation details</li>
                    <li>• Tool inventory checklist</li>
                    <li>• JobFlow app download and setup guide</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSendForm}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-medium py-3 text-lg mt-6"
            >
              <i className="fas fa-paper-plane mr-2"></i>
              Send Onboarding Package
            </Button>
          </div>
        )}

        {/* Pending Review Tab */}
        {activeTab === "Pending Review" && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center mb-6">
              <i className="fas fa-clock text-yellow-400 mr-3 text-xl"></i>
              <h2 className="text-xl font-semibold text-yellow-400">Pending Applications</h2>
            </div>
            
            {pendingApplications.length > 0 ? (
              <div className="space-y-4">
                {pendingApplications.map((application) => (
                  <div key={application.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                          <i className="fas fa-user text-white text-lg"></i>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{application.name}</h3>
                          <p className="text-sm text-slate-400">📞 {application.phone}</p>
                          <p className="text-sm text-slate-400">📧 {application.email}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {application.specialization.map((spec) => (
                              <Badge key={spec} className="bg-blue-600 text-white text-xs">{spec}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right mr-4">
                          <div className="text-xs text-slate-400">Submitted</div>
                          <div className="text-white text-sm">{application.submittedDate}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            Status: <span className="text-yellow-400 capitalize">{application.status}</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleApproveApplication(application.id)}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2"
                        >
                          <i className="fas fa-check mr-1"></i>
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleRejectApplication(application.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2"
                        >
                          <i className="fas fa-times mr-1"></i>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <i className="fas fa-inbox text-slate-500 text-4xl mb-4"></i>
                <div className="text-slate-400 text-lg mb-2">No pending applications</div>
                <div className="text-slate-500 text-sm">New contractor applications will appear here for review</div>
              </div>
            )}
          </div>
        )}

        {/* Reviewed Tab */}
        {activeTab === "Reviewed" && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center mb-6">
              <i className="fas fa-check-circle text-yellow-400 mr-3 text-xl"></i>
              <h2 className="text-xl font-semibold text-yellow-400">Reviewed Applications</h2>
            </div>
            
            {reviewedApplications.length > 0 ? (
              <div className="space-y-4">
                {reviewedApplications.map((application) => (
                  <div key={application.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                          <i className="fas fa-user-check text-white text-lg"></i>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{application.name}</h3>
                          <p className="text-sm text-slate-400">📞 {application.phone}</p>
                          <p className="text-sm text-slate-400">📧 {application.email}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {application.specialization.map((spec) => (
                              <Badge key={spec} className="bg-green-600 text-white text-xs">{spec}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Reviewed</div>
                        <div className="text-white text-sm">{application.reviewedDate}</div>
                        <div className="text-xs text-green-400 mt-1 capitalize font-medium">
                          <i className="fas fa-check mr-1"></i>
                          {application.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <i className="fas fa-clipboard-check text-slate-500 text-4xl mb-4"></i>
                <div className="text-slate-400 text-lg mb-2">No reviewed applications</div>
                <div className="text-slate-500 text-sm">Approved and rejected applications will appear here</div>
              </div>
            )}
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