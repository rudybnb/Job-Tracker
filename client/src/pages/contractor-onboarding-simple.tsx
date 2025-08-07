import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    telegramId: "",
    trades: [] as string[]
  });

  const tradeOptions = [
    "Kitchen Fitting", "Bathroom Fitting", "Plumbing", "Electrical", 
    "Carpentry", "Plastering", "Tiling", "Decorating"
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTradeToggle = (trade: string) => {
    const currentTrades = formData.trades;
    const updatedTrades = currentTrades.includes(trade)
      ? currentTrades.filter(t => t !== trade)
      : [...currentTrades, trade];
    
    handleInputChange('trades', updatedTrades);
  };

  const handleSendForm = () => {
    if (!formData.fullName || !formData.email || !formData.phone || !formData.telegramId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.trades.length === 0) {
      toast({
        title: "Missing Trade",
        description: "Please select at least one trade",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Form Sent Successfully",
      description: `Onboarding form sent to ${formData.fullName}`,
    });

    // Reset form
    setFormData({
      fullName: "",
      email: "",
      phone: "",
      telegramId: "",
      trades: []
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
            <div className="text-sm font-medium">Contractor Onboarding</div>
            <div className="text-xs text-slate-400">Professional Registration</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Online</span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <Card className="bg-slate-800 border-slate-600">
          <CardHeader>
            <CardTitle className="text-yellow-400">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-yellow-400">Full Name *</Label>
              <Input
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Enter full name"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-yellow-400">Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter email address"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-yellow-400">Phone *</Label>
              <Input
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter phone number"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-yellow-400">Telegram ID *</Label>
              <Input
                value={formData.telegramId}
                onChange={(e) => handleInputChange('telegramId', e.target.value)}
                placeholder="Enter Telegram username"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-600">
          <CardHeader>
            <CardTitle className="text-yellow-400">Trade Specializations *</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {tradeOptions.map((trade) => (
                <div key={trade} className="flex items-center space-x-2">
                  <Checkbox
                    id={trade}
                    checked={formData.trades.includes(trade)}
                    onCheckedChange={() => handleTradeToggle(trade)}
                  />
                  <Label htmlFor={trade} className="text-sm text-slate-300 cursor-pointer">
                    {trade}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button
            onClick={handleSendForm}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium px-8 py-2"
          >
            Send Onboarding Form
          </Button>
        </div>
      </div>
    </div>
  );
}