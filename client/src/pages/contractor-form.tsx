import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, CheckCircle, User, FileText, CreditCard, Phone, Wrench, Shield } from "lucide-react";

interface FormData {
  // Step 1: Personal Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  telegramId: string;
  address: string;
  city: string;
  postcode: string;

  // Step 2: Right to Work & Documentation
  rightToWork: boolean;
  passportNumber: string;
  passportPhoto: File | null;
  utrNumber: string;
  cisRegistered: boolean;
  publicLiabilityInsurance: boolean;

  // Step 3: CIS & Tax Details
  cisStatus: "gross" | "net" | "unregistered" | "";
  cisNumber: string;
  utrConfirmed: string;
  cscsCardNumber: string;
  cscsExpiry: string;

  // Step 4: Banking Information
  bankName: string;
  accountNumber: string;
  sortCode: string;
  accountHolderName: string;

  // Step 5: Emergency Contact
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;

  // Step 6: Trade & Tools
  primaryTrade: string;
  yearsExperience: number;
  toolsAvailable: boolean;
  toolsList: string;
}

const trades = [
  "Carpenter", "Electrician", "Plumber", "Bricklayer", "Plasterer", 
  "Painter/Decorator", "Tiler", "Roofer", "Groundworker", "Scaffolder",
  "HVAC Technician", "Kitchen Fitter", "Bathroom Fitter", "Flooring Specialist", "General Builder"
];

export default function ContractorForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    firstName: "", lastName: "", email: "", phone: "", telegramId: "",
    address: "", city: "", postcode: "", rightToWork: false, passportNumber: "",
    passportPhoto: null, utrNumber: "", cisRegistered: false, publicLiabilityInsurance: false,
    cisStatus: "", cisNumber: "", utrConfirmed: "", cscsCardNumber: "", cscsExpiry: "",
    bankName: "", accountNumber: "", sortCode: "", accountHolderName: "",
    emergencyName: "", emergencyPhone: "", emergencyRelationship: "",
    primaryTrade: "", yearsExperience: 0, toolsAvailable: false, toolsList: ""
  });
  
  const { toast } = useToast();

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.firstName && formData.lastName && formData.email && 
                 formData.phone && formData.address && formData.city && formData.postcode);
      case 2:
        return !!(formData.rightToWork && formData.passportNumber && formData.utrNumber);
      case 3:
        return !!(formData.cisStatus && formData.utrConfirmed);
      case 4:
        return !!(formData.bankName && formData.accountNumber && formData.sortCode && formData.accountHolderName);
      case 5:
        return !!(formData.emergencyName && formData.emergencyPhone && formData.emergencyRelationship);
      case 6:
        return !!(formData.primaryTrade && formData.yearsExperience > 0);
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 6));
    } else {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields before proceeding",
        variant: "destructive"
      });
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const submitForm = async () => {
    if (validateStep(6)) {
      try {
        // Create contractor payload
        const contractorData = {
          name: `${formData.firstName} ${formData.lastName}`,
          email: formData.email,
          phone: formData.phone,
          specialty: formData.primaryTrade,
          specialization: formData.primaryTrade,
          address: `${formData.address}, ${formData.city}, ${formData.postcode}`,
          telegramId: formData.telegramId,
          status: "available" as const,
          // Additional data stored as JSON for future reference
          formData: JSON.stringify(formData)
        };

        const response = await fetch("/api/contractors", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(contractorData),
        });

        if (response.ok) {
          toast({
            title: "Application Submitted Successfully! 🎉",
            description: "Welcome to JobFlow! You'll receive confirmation soon.",
          });
          
          // Reset form after successful submission
          setFormData({
            firstName: "", lastName: "", email: "", phone: "", telegramId: "",
            address: "", city: "", postcode: "", rightToWork: false, passportNumber: "",
            passportPhoto: null, utrNumber: "", cisRegistered: false, publicLiabilityInsurance: false,
            cisStatus: "", cisNumber: "", utrConfirmed: "", cscsCardNumber: "", cscsExpiry: "",
            bankName: "", accountNumber: "", sortCode: "", accountHolderName: "",
            emergencyName: "", emergencyPhone: "", emergencyRelationship: "",
            primaryTrade: "", yearsExperience: 0, toolsAvailable: false, toolsList: ""
          });
          setCurrentStep(1);
        } else {
          toast({
            title: "Submission Failed",
            description: "Please try again or contact support",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error("Form submission error:", error);
        toast({
          title: "Network Error",
          description: "Please check your connection and try again",
          variant: "destructive"
        });
      }
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Step 1: Personal Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white text-sm font-medium mb-2">First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateFormData("firstName", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white text-sm font-medium mb-2">Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => updateFormData("lastName", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateFormData("email", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Phone *</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateFormData("phone", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Telegram ID (optional)</label>
              <input
                type="text"
                value={formData.telegramId}
                onChange={(e) => updateFormData("telegramId", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Full Address *</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => updateFormData("address", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white text-sm font-medium mb-2">City *</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => updateFormData("city", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white text-sm font-medium mb-2">Postcode *</label>
                <input
                  type="text"
                  value={formData.postcode}
                  onChange={(e) => updateFormData("postcode", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Step 2: Right to Work & Documentation</h3>
            
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={formData.rightToWork}
                onChange={(e) => updateFormData("rightToWork", e.target.checked)}
                className="w-4 h-4"
              />
              <label className="text-white">I confirm I have the right to work in the UK *</label>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Passport Number *</label>
              <input
                type="text"
                value={formData.passportNumber}
                onChange={(e) => updateFormData("passportNumber", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Passport Photo Upload</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => updateFormData("passportPhoto", e.target.files?.[0] || null)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">UTR Number *</label>
              <input
                type="text"
                value={formData.utrNumber}
                onChange={(e) => updateFormData("utrNumber", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={formData.cisRegistered}
                onChange={(e) => updateFormData("cisRegistered", e.target.checked)}
                className="w-4 h-4"
              />
              <label className="text-white">CIS Registration Status</label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={formData.publicLiabilityInsurance}
                onChange={(e) => updateFormData("publicLiabilityInsurance", e.target.checked)}
                className="w-4 h-4"
              />
              <label className="text-white">Public Liability Insurance</label>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Step 3: CIS & Tax Details</h3>
            
            <div>
              <label className="block text-white text-sm font-medium mb-2">CIS Verification Status *</label>
              <select
                value={formData.cisStatus}
                onChange={(e) => updateFormData("cisStatus", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="">Select status...</option>
                <option value="gross">Gross</option>
                <option value="net">Net</option>
                <option value="unregistered">Unregistered</option>
              </select>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">CIS Number (if registered)</label>
              <input
                type="text"
                value={formData.cisNumber}
                onChange={(e) => updateFormData("cisNumber", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">UTR Number Confirmation *</label>
              <input
                type="text"
                value={formData.utrConfirmed}
                onChange={(e) => updateFormData("utrConfirmed", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white text-sm font-medium mb-2">CSCS Card Number</label>
                <input
                  type="text"
                  value={formData.cscsCardNumber}
                  onChange={(e) => updateFormData("cscsCardNumber", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white text-sm font-medium mb-2">CSCS Expiry Date</label>
                <input
                  type="date"
                  value={formData.cscsExpiry}
                  onChange={(e) => updateFormData("cscsExpiry", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Step 4: Banking Information</h3>
            
            <div>
              <label className="block text-white text-sm font-medium mb-2">Bank Name *</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => updateFormData("bankName", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white text-sm font-medium mb-2">Account Number *</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => updateFormData("accountNumber", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white text-sm font-medium mb-2">Sort Code *</label>
                <input
                  type="text"
                  value={formData.sortCode}
                  onChange={(e) => updateFormData("sortCode", e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Account Holder Name *</label>
              <input
                type="text"
                value={formData.accountHolderName}
                onChange={(e) => updateFormData("accountHolderName", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Step 5: Emergency Contact</h3>
            
            <div>
              <label className="block text-white text-sm font-medium mb-2">Emergency Contact Name *</label>
              <input
                type="text"
                value={formData.emergencyName}
                onChange={(e) => updateFormData("emergencyName", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Emergency Contact Phone *</label>
              <input
                type="tel"
                value={formData.emergencyPhone}
                onChange={(e) => updateFormData("emergencyPhone", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Relationship *</label>
              <input
                type="text"
                value={formData.emergencyRelationship}
                onChange={(e) => updateFormData("emergencyRelationship", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                placeholder="e.g. Spouse, Parent, Sibling"
              />
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Step 6: Trade & Tools</h3>
            
            <div>
              <label className="block text-white text-sm font-medium mb-2">Primary Trade *</label>
              <select
                value={formData.primaryTrade}
                onChange={(e) => updateFormData("primaryTrade", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="">Select your primary trade...</option>
                {trades.map(trade => (
                  <option key={trade} value={trade}>{trade}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Years of Experience *</label>
              <input
                type="number"
                value={formData.yearsExperience}
                onChange={(e) => updateFormData("yearsExperience", parseInt(e.target.value) || 0)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                min="0"
              />
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={formData.toolsAvailable}
                onChange={(e) => updateFormData("toolsAvailable", e.target.checked)}
                className="w-4 h-4"
              />
              <label className="text-white">I have my own tools available</label>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Tools List</label>
              <textarea
                value={formData.toolsList}
                onChange={(e) => updateFormData("toolsList", e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white h-24"
                placeholder="List your available tools..."
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const stepIcons = [
    { icon: User, label: "Personal" },
    { icon: Shield, label: "Verification" },
    { icon: FileText, label: "Tax Details" },
    { icon: CreditCard, label: "Banking" },
    { icon: Phone, label: "Emergency" },
    { icon: Wrench, label: "Trade & Tools" }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 border-b border-slate-600">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center">
            <User className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-yellow-400">Contractor Application</h1>
            <p className="text-slate-300 text-sm">Complete your registration to join our network</p>
          </div>
        </div>
      </div>

      {/* Enhanced Progress Bar */}
      <div className="bg-slate-800 px-6 py-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          {stepIcons.map((step, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep === stepNumber;
            const isCompleted = currentStep > stepNumber;
            const IconComponent = step.icon;
            
            return (
              <div key={stepNumber} className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all duration-300 ${
                  isCompleted ? 'bg-green-500' : 
                  isActive ? 'bg-yellow-400' : 'bg-slate-600'
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="w-6 h-6 text-white" />
                  ) : (
                    <IconComponent className={`w-6 h-6 ${
                      isActive ? 'text-slate-900' : 'text-slate-300'
                    }`} />
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  isActive ? 'text-yellow-400' : 
                  isCompleted ? 'text-green-400' : 'text-slate-400'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="w-full bg-slate-600 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-yellow-400 to-orange-400 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / 6) * 100}%` }}
          />
        </div>
        <div className="text-center mt-2">
          <span className="text-slate-300 text-sm">
            Step {currentStep} of 6 - {stepIcons[currentStep - 1]?.label}
          </span>
        </div>
      </div>

      <div className="p-6">
        {/* Form Content */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            {renderStep()}
          </CardContent>
        </Card>

        {/* Enhanced Navigation Buttons */}
        <div className="flex justify-between items-center mt-6">
          <Button 
            onClick={prevStep} 
            disabled={currentStep === 1}
            variant="outline"
            className="bg-slate-700 border-slate-600 hover:bg-slate-600 text-white flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </Button>
          
          <div className="text-center text-slate-400 text-sm">
            Progress: {Math.round((currentStep / 6) * 100)}% Complete
          </div>
          
          {currentStep < 6 ? (
            <Button 
              onClick={nextStep}
              className="bg-yellow-600 hover:bg-yellow-700 text-black flex items-center gap-2"
            >
              Next Step
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button 
              onClick={submitForm}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              Submit Application
              <CheckCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Add bottom padding */}
      <div className="h-8"></div>
    </div>
  );
}