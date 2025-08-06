import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface JobAssignment {
  id: string;
  contractorName: string;
  email: string;
  phone: string;
  workLocation: string;
  hbxlJob: string;
  startDate: string;
  endDate: string;
  specialInstructions: string;
  status: "pending" | "accepted" | "in_progress" | "completed";
  createdAt: string;
}

const hbxlJobs = [
  "Kitchen Installation - Unit 12A",
  "Bathroom Renovation - Unit 5B", 
  "Electrical Rewiring - Unit 8C",
  "Plumbing Repair - Unit 3A",
  "Flooring Installation - Unit 15D",
  "Painting & Decorating - Unit 7B",
  "Carpentry Work - Unit 11C",
  "Tiling Project - Unit 9A"
];

export default function JobAssignments() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [formData, setFormData] = useState({
    contractorName: "",
    email: "",
    phone: "",
    workLocation: "",
    hbxlJob: "",
    startDate: "",
    endDate: "",
    specialInstructions: ""
  });

  const { toast } = useToast();

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCreateAssignment = () => {
    if (!formData.contractorName || !formData.email || !formData.workLocation || !formData.hbxlJob || !formData.startDate || !formData.endDate) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    const newAssignment: JobAssignment = {
      id: Date.now().toString(),
      ...formData,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    setAssignments(prev => [newAssignment, ...prev]);
    setShowCreateForm(false);
    setFormData({
      contractorName: "",
      email: "",
      phone: "",
      workLocation: "",
      hbxlJob: "",
      startDate: "",
      endDate: "",
      specialInstructions: ""
    });

    toast({
      title: "Assignment Created",
      description: `Telegram notification sent to ${formData.contractorName}`,
    });
  };

  const filteredAssignments = assignments.filter(assignment =>
    assignment.contractorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment.hbxlJob.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment.workLocation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yellow-400">Job Assignments</h1>
        <Button 
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
        >
          <i className="fas fa-plus mr-2"></i>
          Create Assignment
        </Button>
      </div>

      <div className="p-4">
        {/* Create Assignment Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-yellow-400 mb-4">Create New Job Assignment</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Contractor Name *</label>
                  <input
                    type="text"
                    placeholder="James"
                    value={formData.contractorName}
                    onChange={(e) => updateFormData("contractorName", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    placeholder="james@gmail.com"
                    value={formData.email}
                    onChange={(e) => updateFormData("email", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Phone</label>
                  <input
                    type="tel"
                    placeholder="07534251548"
                    value={formData.phone}
                    onChange={(e) => updateFormData("phone", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Work Location (Postcode) *</label>
                  <input
                    type="text"
                    placeholder="DA17 5DB"
                    value={formData.workLocation}
                    onChange={(e) => updateFormData("workLocation", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">HBXL Job *</label>
                  <select
                    value={formData.hbxlJob}
                    onChange={(e) => updateFormData("hbxlJob", e.target.value)}
                    className="w-full bg-slate-700 border border-yellow-600 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select HBXL job</option>
                    {hbxlJobs.map(job => (
                      <option key={job} value={job}>{job}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => updateFormData("startDate", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => updateFormData("endDate", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Special Instructions</label>
                  <textarea
                    placeholder="Any special instructions for the contractor..."
                    value={formData.specialInstructions}
                    onChange={(e) => updateFormData("specialInstructions", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white h-20 resize-none"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <Button 
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateAssignment}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  Create Assignment
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Current Assignments Section */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-yellow-400">Current Assignments</h3>
            <input
              type="text"
              placeholder="Search assignments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm w-64"
            />
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-clipboard-list text-slate-500 text-4xl mb-4"></i>
              <p className="text-slate-400">
                {assignments.length === 0 
                  ? "No assignments found. Create your first assignment above."
                  : "No assignments match your search."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAssignments.map((assignment) => (
                <div key={assignment.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-white">{assignment.hbxlJob}</h4>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      assignment.status === 'pending' ? 'bg-yellow-600 text-black' :
                      assignment.status === 'accepted' ? 'bg-blue-600 text-white' :
                      assignment.status === 'in_progress' ? 'bg-orange-600 text-white' :
                      'bg-green-600 text-white'
                    }`}>
                      {assignment.status.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-400">Contractor:</span>
                      <div className="text-white font-medium">{assignment.contractorName}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Location:</span>
                      <div className="text-white font-medium">{assignment.workLocation}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Start Date:</span>
                      <div className="text-white font-medium">{assignment.startDate}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">End Date:</span>
                      <div className="text-white font-medium">{assignment.endDate}</div>
                    </div>
                  </div>

                  {assignment.specialInstructions && (
                    <div className="mt-3 pt-3 border-t border-slate-600">
                      <span className="text-slate-400 text-sm">Special Instructions:</span>
                      <p className="text-white text-sm mt-1">{assignment.specialInstructions}</p>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-600 flex items-center justify-between">
                    <span className="text-slate-500 text-xs">
                      Created: {new Date(assignment.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex space-x-2">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                        <i className="fab fa-telegram-plane mr-1"></i>
                        Resend
                      </Button>
                      <Button size="sm" className="bg-slate-600 hover:bg-slate-700 text-white">
                        <i className="fas fa-edit mr-1"></i>
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            onClick={() => window.location.href = '/jobs'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button className="py-3 px-4 text-yellow-400">
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