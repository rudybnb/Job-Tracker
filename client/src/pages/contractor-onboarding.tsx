import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    // Personal Information
    fullName: "",
    email: "",
    phone: "",
    address: "",
    postcode: "",
    
    // Professional Details
    tradeSpecializations: [],
    experienceYears: "",
    qualifications: "",
    
    // Contact & Communication
    emergencyContactName: "",
    emergencyContactPhone: "",
    telegramId: "",
    preferredContact: "",
    
    // Banking & Payment
    bankAccountHolder: "",
    sortCode: "",
    accountNumber: "",
    cisStatus: "",
    
    // Availability
    availableStartDate: "",
    workingHours: "",
    weekendAvailable: false,
    
    // Additional
    hasOwnTransport: false,
    hasInsurance: false,
    additionalNotes: ""
  });

  const tradeOptions = [
    "Kitchen Fitting", "Bathroom Fitting", "Plumbing", "Electrical", 
    "Carpentry", "Plastering", "Tiling", "Decorating", "Masonry",
    "Flooring", "Roofing", "General Building", "Demolition"
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTradeToggle = (trade: string) => {
    const currentTrades = formData.tradeSpecializations;
    const updatedTrades = currentTrades.includes(trade)
      ? currentTrades.filter(t => t !== trade)
      : [...currentTrades, trade];
    
    handleInputChange('tradeSpecializations', updatedTrades);
  };

  const handleSendForm = () => {
    // Basic validation
    const requiredFields = ['fullName', 'email', 'phone', 'telegramId'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields marked with *",
        variant: "destructive",
      });
      return;
    }

    if (formData.tradeSpecializations.length === 0) {
      toast({
        title: "Missing Trade Specialization",
        description: "Please select at least one trade specialization",
        variant: "destructive",
      });
      return;
    }

    // TODO: Send comprehensive onboarding data to contractor via Telegram
    console.log("Sending comprehensive onboarding form:", formData);

    toast({
      title: "Comprehensive Form Sent Successfully",
      description: `Detailed onboarding form sent to ${formData.fullName} via Telegram`,
    });

    // Reset form
    setFormData({
      fullName: "", email: "", phone: "", address: "", postcode: "",
      tradeSpecializations: [], experienceYears: "", qualifications: "",
      emergencyContactName: "", emergencyContactPhone: "", telegramId: "", preferredContact: "",
      bankAccountHolder: "", sortCode: "", accountNumber: "", cisStatus: "",
      availableStartDate: "", workingHours: "", weekendAvailable: false,
      hasOwnTransport: false, hasInsurance: false, additionalNotes: ""
    });
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

        {/* Comprehensive Contractor Onboarding Form */}
        <div className="space-y-6 max-w-4xl mx-auto">
          
          {/* Personal Information */}
          <Card className="bg-slate-800 border-slate-600">
            <CardHeader>
              <CardTitle className="text-yellow-400 flex items-center">
                <i className="fas fa-user mr-2"></i>
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-yellow-400">Full Name *</Label>
                  <Input
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="e.g. James Carpenter"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Email Address *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="james@example.com"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Phone Number *</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="07534251548"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Postcode</Label>
                  <Input
                    value={formData.postcode}
                    onChange={(e) => handleInputChange('postcode', e.target.value)}
                    placeholder="DA17 5DB"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-yellow-400">Full Address</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Full address including street, city"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </CardContent>
          </Card>

          {/* Trade Specializations */}
          <Card className="bg-slate-800 border-slate-600">
            <CardHeader>
              <CardTitle className="text-yellow-400 flex items-center">
                <i className="fas fa-tools mr-2"></i>
                Trade Specializations *
              </CardTitle>
              <CardDescription className="text-slate-400">
                Select all trades the contractor is qualified for
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {tradeOptions.map((trade) => (
                  <div key={trade} className="flex items-center space-x-2">
                    <Checkbox
                      id={trade}
                      checked={formData.tradeSpecializations.includes(trade)}
                      onCheckedChange={() => handleTradeToggle(trade)}
                      className="border-slate-600"
                    />
                    <Label htmlFor={trade} className="text-sm text-slate-300 cursor-pointer">
                      {trade}
                    </Label>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <Label className="text-yellow-400">Years of Experience</Label>
                  <Select value={formData.experienceYears} onValueChange={(value) => handleInputChange('experienceYears', value)}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue placeholder="Select experience level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0-2">0-2 years</SelectItem>
                      <SelectItem value="3-5">3-5 years</SelectItem>
                      <SelectItem value="6-10">6-10 years</SelectItem>
                      <SelectItem value="10+">10+ years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-yellow-400">Qualifications & Certifications</Label>
                  <Textarea
                    value={formData.qualifications}
                    onChange={(e) => handleInputChange('qualifications', e.target.value)}
                    placeholder="List relevant qualifications, certifications, licenses"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact & Communication */}
          <Card className="bg-slate-800 border-slate-600">
            <CardHeader>
              <CardTitle className="text-yellow-400 flex items-center">
                <i className="fas fa-phone mr-2"></i>
                Contact & Communication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-yellow-400">Emergency Contact Name</Label>
                  <Input
                    value={formData.emergencyContactName}
                    onChange={(e) => handleInputChange('emergencyContactName', e.target.value)}
                    placeholder="Next of kin name"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Emergency Contact Phone</Label>
                  <Input
                    value={formData.emergencyContactPhone}
                    onChange={(e) => handleInputChange('emergencyContactPhone', e.target.value)}
                    placeholder="Emergency contact number"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Telegram ID *</Label>
                  <Input
                    value={formData.telegramId}
                    onChange={(e) => handleInputChange('telegramId', e.target.value)}
                    placeholder="@username or 7617462316"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                  <p className="text-slate-500 text-xs mt-1">For job notifications</p>
                </div>
                <div>
                  <Label className="text-yellow-400">Preferred Contact Method</Label>
                  <Select value={formData.preferredContact} onValueChange={(value) => handleInputChange('preferredContact', value)}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue placeholder="How to reach you" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="phone">Phone Call</SelectItem>
                      <SelectItem value="sms">Text Message</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Banking & Payment */}
          <Card className="bg-slate-800 border-slate-600">
            <CardHeader>
              <CardTitle className="text-yellow-400 flex items-center">
                <i className="fas fa-credit-card mr-2"></i>
                Banking & Payment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-yellow-400">Account Holder Name</Label>
                  <Input
                    value={formData.bankAccountHolder}
                    onChange={(e) => handleInputChange('bankAccountHolder', e.target.value)}
                    placeholder="Name on bank account"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Sort Code</Label>
                  <Input
                    value={formData.sortCode}
                    onChange={(e) => handleInputChange('sortCode', e.target.value)}
                    placeholder="12-34-56"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Account Number</Label>
                  <Input
                    value={formData.accountNumber}
                    onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                    placeholder="12345678"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-yellow-400">CIS Status</Label>
                <Select value={formData.cisStatus} onValueChange={(value) => handleInputChange('cisStatus', value)}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                    <SelectValue placeholder="Construction Industry Scheme status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">CIS Registered</SelectItem>
                    <SelectItem value="not-registered">Not CIS Registered</SelectItem>
                    <SelectItem value="sole-trader">Sole Trader</SelectItem>
                    <SelectItem value="limited-company">Limited Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Availability & Additional Information */}
          <Card className="bg-slate-800 border-slate-600">
            <CardHeader>
              <CardTitle className="text-yellow-400 flex items-center">
                <i className="fas fa-calendar mr-2"></i>
                Availability & Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-yellow-400">Available Start Date</Label>
                  <Input
                    type="date"
                    value={formData.availableStartDate}
                    onChange={(e) => handleInputChange('availableStartDate', e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-yellow-400">Preferred Working Hours</Label>
                  <Select value={formData.workingHours} onValueChange={(value) => handleInputChange('workingHours', value)}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue placeholder="Select working hours" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full Time (40+ hours)</SelectItem>
                      <SelectItem value="part-time">Part Time (20-40 hours)</SelectItem>
                      <SelectItem value="flexible">Flexible Hours</SelectItem>
                      <SelectItem value="weekends-only">Weekends Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="weekends"
                    checked={formData.weekendAvailable}
                    onCheckedChange={(checked) => handleInputChange('weekendAvailable', checked)}
                    className="border-slate-600"
                  />
                  <Label htmlFor="weekends" className="text-slate-300">Available for weekend work</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="transport"
                    checked={formData.hasOwnTransport}
                    onCheckedChange={(checked) => handleInputChange('hasOwnTransport', checked)}
                    className="border-slate-600"
                  />
                  <Label htmlFor="transport" className="text-slate-300">Has own transport and can travel to job sites</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="insurance"
                    checked={formData.hasInsurance}
                    onCheckedChange={(checked) => handleInputChange('hasInsurance', checked)}
                    className="border-slate-600"
                  />
                  <Label htmlFor="insurance" className="text-slate-300">Has public liability insurance</Label>
                </div>
              </div>

              <div>
                <Label className="text-yellow-400">Additional Notes</Label>
                <Textarea
                  value={formData.additionalNotes}
                  onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
                  placeholder="Any additional information, special requirements, or notes"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary Box */}
          <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div className="flex items-start space-x-3">
              <i className="fas fa-info-circle text-yellow-400 mt-1"></i>
              <div className="text-slate-300 text-sm">
                <p className="font-medium mb-2">This comprehensive form will be sent to the contractor covering:</p>
                <ul className="space-y-1 text-slate-400 text-xs">
                  <li>• Personal details and contact information</li>
                  <li>• Trade specializations and experience verification</li>
                  <li>• Banking details and CIS status</li>
                  <li>• Emergency contacts and communication preferences</li>
                  <li>• Availability and additional requirements</li>
                  <li>• Insurance and transportation details</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSendForm}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-medium py-4 text-lg"
            disabled={!formData.fullName || !formData.email || !formData.phone || !formData.telegramId}
          >
            <i className="fas fa-paper-plane mr-2"></i>
            Send Comprehensive Onboarding Form
          </Button>
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