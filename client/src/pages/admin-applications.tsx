import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Clock, User, Mail, Phone, MapPin, Building, Calendar, FileText, Settings, PoundSterling } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ContractorApplication } from "@shared/schema";

interface ApplicationCardProps {
  application: ContractorApplication;
  onStatusUpdate: (id: string, status: string) => void;
  onAdminUpdate: (id: string, updates: Partial<ContractorApplication>) => void;
}

function ApplicationCard({ application, onStatusUpdate, onAdminUpdate }: ApplicationCardProps) {
  const [adminFields, setAdminFields] = useState({
    adminCisVerification: application.adminCisVerification || '',
    adminPayRate: application.adminPayRate || '',
    adminNotes: application.adminNotes || ''
  });
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);

  const handleAdminSave = () => {
    onAdminUpdate(application.id, adminFields);
    setIsEditingAdmin(false);
  };
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5" />
              {application.firstName} {application.lastName}
            </CardTitle>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Mail className="w-4 h-4" />
                {application.email}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {application.phone}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(application.status)}
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {application.submittedAt ? new Date(application.submittedAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-500" />
            <span className="text-sm">{application.city}, {application.postcode}</span>
          </div>
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-gray-500" />
            <span className="text-sm">{application.primaryTrade}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-sm">{application.yearsExperience} experience</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <h4 className="font-medium mb-2">Tax & CIS Information</h4>
            <ul className="space-y-1 text-gray-600">
              <li>• CIS Status: {application.cisStatus}</li>
              <li>• UTR: {application.utrNumberDetails}</li>
              <li>• CIS Registered: {application.isCisRegistered === "true" ? "Yes" : "No"}</li>
              <li>• Valid CSCS: {application.hasValidCscs === "true" ? "Yes" : "No"}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Work Details</h4>
            <ul className="space-y-1 text-gray-600">
              <li>• Right to Work: {application.hasRightToWork === "true" ? "Yes" : "No"}</li>
              <li>• Public Liability: {application.hasPublicLiability === "true" ? "Yes" : "No"}</li>
              <li>• Own Tools: {application.hasOwnTools === "true" ? "Yes" : "No"}</li>
              <li>• Passport Photo: {application.passportPhotoUploaded === "true" ? "Uploaded" : "Not uploaded"}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Admin Details
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setIsEditingAdmin(!isEditingAdmin)}
                className="ml-auto h-6 px-2 text-xs"
              >
                {isEditingAdmin ? "Cancel" : "Edit"}
              </Button>
            </h4>
            {isEditingAdmin ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="cisVerification" className="text-xs">CIS Verification</Label>
                  <Input
                    id="cisVerification"
                    value={adminFields.adminCisVerification}
                    onChange={(e) => setAdminFields(prev => ({...prev, adminCisVerification: e.target.value}))}
                    placeholder="Admin CIS verification details"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="payRate" className="text-xs">Pay Rate (£/hour)</Label>
                  <Input
                    id="payRate"
                    value={adminFields.adminPayRate}
                    onChange={(e) => setAdminFields(prev => ({...prev, adminPayRate: e.target.value}))}
                    placeholder="e.g. 22.50"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="adminNotes" className="text-xs">Admin Notes</Label>
                  <Textarea
                    id="adminNotes"
                    value={adminFields.adminNotes}
                    onChange={(e) => setAdminFields(prev => ({...prev, adminNotes: e.target.value}))}
                    placeholder="Internal admin notes"
                    className="h-16 text-xs"
                  />
                </div>
                <Button size="sm" onClick={handleAdminSave} className="w-full h-7 text-xs">
                  Save Admin Details
                </Button>
              </div>
            ) : (
              <ul className="space-y-1 text-gray-600">
                <li className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  CIS: {application.adminCisVerification || "Not verified"}
                </li>
                <li className="flex items-center gap-1">
                  <PoundSterling className="w-3 h-3" />
                  Rate: {application.adminPayRate ? `£${application.adminPayRate}/hr` : "Not set"}
                </li>
                <li className="text-xs">
                  Notes: {application.adminNotes || "None"}
                </li>
              </ul>
            )}
          </div>
        </div>

        {application.status === "pending" && (
          <div className="flex gap-3 mt-6 pt-4 border-t">
            <Button
              size="lg"
              className="bg-green-600 hover:bg-green-700 flex-1 py-3 text-base font-medium"
              onClick={() => onStatusUpdate(application.id, "approved")}
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Approve Application
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="flex-1 py-3 text-base font-medium"
              onClick={() => onStatusUpdate(application.id, "rejected")}
            >
              <XCircle className="w-5 h-5 mr-2" />
              Reject Application
            </Button>
          </div>
        )}
        {application.status === "approved" && (
          <div className="mt-4 pt-4 border-t">
            <Badge className="bg-green-100 text-green-800 border-green-300 px-4 py-2 text-sm">
              <CheckCircle className="w-4 h-4 mr-2" />
              Application Approved
            </Badge>
          </div>
        )}
        {application.status === "rejected" && (
          <div className="mt-4 pt-4 border-t">
            <Badge className="bg-red-100 text-red-800 border-red-300 px-4 py-2 text-sm">
              <XCircle className="w-4 h-4 mr-2" />
              Application Rejected
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminApplications() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pending");

  const { data: applications = [], isLoading } = useQuery<ContractorApplication[]>({
    queryKey: ["/api/contractor-applications"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/contractor-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-applications"] });
      toast({
        title: "Status Updated",
        description: "Application status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update application status.",
        variant: "destructive",
      });
    },
  });

  const updateAdminMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ContractorApplication> }) => {
      const response = await fetch(`/api/contractor-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update admin details");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-applications"] });
      toast({
        title: "Admin Details Updated",
        description: "CIS verification and pay rate have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update admin details.",
        variant: "destructive",
      });
    },
  });

  const handleStatusUpdate = (id: string, status: string) => {
    updateStatusMutation.mutate({ id, status });
  };

  const handleAdminUpdate = (id: string, updates: Partial<ContractorApplication>) => {
    updateAdminMutation.mutate({ id, updates });
  };

  const pendingApplications = applications.filter(app => app.status === "pending");
  const approvedApplications = applications.filter(app => app.status === "approved");
  const rejectedApplications = applications.filter(app => app.status === "rejected");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-800 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
              <p>Loading applications...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-800 text-white">
      <div className="bg-slate-700 text-white p-4 border-b border-slate-600">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold">Contractor Applications</h1>
          <p className="text-sm opacity-75">Review and manage contractor applications</p>
          <div className="mt-2">
            <span className="text-xs text-slate-400">Contractor Form Link: </span>
            <a href="/contractor-form" className="text-xs text-blue-400 hover:text-blue-300 underline">
              http://localhost:5000/contractor-form
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-700 border-slate-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{pendingApplications.length}</p>
                  <p className="text-sm text-gray-300">Pending Review</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-700 border-slate-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-500">{approvedApplications.length}</p>
                  <p className="text-sm text-gray-300">Approved</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-700 border-slate-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-red-500">{rejectedApplications.length}</p>
                  <p className="text-sm text-gray-300">Rejected</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-700">
            <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
              Pending ({pendingApplications.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              Approved ({approvedApplications.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              Rejected ({rejectedApplications.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-6">
            {pendingApplications.length === 0 ? (
              <Card className="bg-slate-700 border-slate-600 text-white">
                <CardContent className="p-8 text-center">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Pending Applications</h3>
                  <p className="text-gray-400">All applications have been reviewed.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingApplications.map((application) => (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    onStatusUpdate={handleStatusUpdate}
                    onAdminUpdate={handleAdminUpdate}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="approved" className="mt-6">
            {approvedApplications.length === 0 ? (
              <Card className="bg-slate-700 border-slate-600 text-white">
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Approved Applications</h3>
                  <p className="text-gray-400">No applications have been approved yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {approvedApplications.map((application) => (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    onStatusUpdate={handleStatusUpdate}
                    onAdminUpdate={handleAdminUpdate}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="mt-6">
            {rejectedApplications.length === 0 ? (
              <Card className="bg-slate-700 border-slate-600 text-white">
                <CardContent className="p-8 text-center">
                  <XCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Rejected Applications</h3>
                  <p className="text-gray-400">No applications have been rejected.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {rejectedApplications.map((application) => (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    onStatusUpdate={handleStatusUpdate}
                    onAdminUpdate={handleAdminUpdate}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Bottom Navigation for Applications */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-4 text-center">
          <button 
            onClick={() => setActiveTab("pending")}
            className={`py-3 px-4 ${activeTab === "pending" ? "text-yellow-600" : "text-slate-400 hover:text-white"}`}
          >
            <Clock className="w-5 h-5 mx-auto mb-1" />
            <span className="text-xs">Pending ({pendingApplications.length})</span>
          </button>
          <button 
            onClick={() => setActiveTab("approved")}
            className={`py-3 px-4 ${activeTab === "approved" ? "text-yellow-600" : "text-slate-400 hover:text-white"}`}
          >
            <CheckCircle className="w-5 h-5 mx-auto mb-1" />
            <span className="text-xs">Approved ({approvedApplications.length})</span>
          </button>
          <button 
            onClick={() => setActiveTab("rejected")}
            className={`py-3 px-4 ${activeTab === "rejected" ? "text-yellow-600" : "text-slate-400 hover:text-white"}`}
          >
            <XCircle className="w-5 h-5 mx-auto mb-1" />
            <span className="text-xs">Rejected ({rejectedApplications.length})</span>
          </button>
          <button 
            onClick={() => window.location.href = '/contractor-onboarding-clean'}
            className="py-3 px-4 text-slate-400 hover:text-yellow-600"
          >
            <i className="fas fa-user-plus block mb-1"></i>
            <span className="text-xs">Send Form</span>
          </button>
        </div>
      </div>

      {/* Bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}