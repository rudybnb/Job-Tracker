import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, User, Phone, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ContractorIdCapture() {
  const [contractorName, setContractorName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const { toast } = useToast();

  const handleCopyFormMessage = () => {
    const formMessage = `🔨 JobFlow Contractor Application

Hi ${contractorName || '[Contractor Name]'},

Please complete your contractor application form by providing:

📋 **Required Information:**
• Personal details (Name, Email, Phone, Address)
• Right to work documentation
• CIS registration status
• Banking information
• Emergency contact
• Trade specializations and experience

Reply with your completed information or visit our application portal.

Best regards,
JobFlow Team`;

    navigator.clipboard.writeText(formMessage);
    toast({
      title: "Form Message Copied",
      description: "Send this message to the contractor on Telegram"
    });
  };

  const handleSaveContractor = () => {
    if (!contractorName || !phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please enter contractor name and phone number",
        variant: "destructive"
      });
      return;
    }

    // Save contractor details to localStorage for now
    const contractorData = {
      name: contractorName,
      phone: phoneNumber,
      telegramId: telegramId || 'Not provided',
      dateAdded: new Date().toISOString(),
      status: 'pending_application'
    };

    const existingContractors = JSON.parse(localStorage.getItem('contractor_contacts') || '[]');
    existingContractors.push(contractorData);
    localStorage.setItem('contractor_contacts', JSON.stringify(existingContractors));

    toast({
      title: "Contractor Added",
      description: `${contractorName} has been added to your contact list`
    });

    // Clear form
    setContractorName("");
    setPhoneNumber("");
    setTelegramId("");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-6">
          <User className="h-8 w-8 text-yellow-600 mr-3" />
          <h1 className="text-2xl font-bold">Contractor ID Capture</h1>
        </div>

        <Card className="bg-slate-800 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="text-yellow-600">Add New Contractor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Contractor Name</label>
              <Input
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder="Enter contractor's full name"
                className="bg-slate-700 border-slate-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Phone Number</label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g., 07534251548"
                className="bg-slate-700 border-slate-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Telegram ID (Optional)
                <span className="text-slate-400 text-xs ml-2">Get this from the contractor</span>
              </label>
              <Input
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="e.g., @username or user ID number"
                className="bg-slate-700 border-slate-600"
              />
            </div>

            <div className="flex space-x-3">
              <Button 
                onClick={handleSaveContractor}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-black"
              >
                <User className="h-4 w-4 mr-2" />
                Save Contractor
              </Button>
              
              <Button 
                onClick={handleCopyFormMessage}
                variant="outline"
                className="flex-1 border-slate-600 hover:bg-slate-700"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Form Message
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-yellow-600 flex items-center">
              <MessageCircle className="h-5 w-5 mr-2" />
              How to Get Telegram ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="bg-slate-700 p-3 rounded">
                <h4 className="font-medium text-white mb-2">Method 1: Ask the Contractor</h4>
                <p>Ask them to search for "@userinfobot" on Telegram and send /start. The bot will reply with their user ID.</p>
              </div>
              
              <div className="bg-slate-700 p-3 rounded">
                <h4 className="font-medium text-white mb-2">Method 2: Username Method</h4>
                <p>If they have a username (like @john_contractor), you can use that instead of the numeric ID.</p>
              </div>
              
              <div className="bg-slate-700 p-3 rounded">
                <h4 className="font-medium text-white mb-2">Method 3: Phone Contact</h4>
                <p>Start with their phone number for initial contact, then get Telegram ID for future automated messages.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}