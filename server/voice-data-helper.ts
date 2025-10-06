import type { IStorage } from './storage';

export async function getVoiceAssistantData(query: string, storage: IStorage): Promise<string | null> {
  const lowerQuery = query.toLowerCase();
  
  // Who's working / active sessions
  if (lowerQuery.includes('working') || lowerQuery.includes('clocked in') || lowerQuery.includes('active')) {
    const activeSessions = await storage.getAllActiveSessions();
    if (activeSessions.length === 0) {
      return "No one is currently clocked in.";
    }
    const names = activeSessions.map(s => s.contractorName).join(', ');
    return `${activeSessions.length} ${activeSessions.length === 1 ? 'person is' : 'people are'} working right now: ${names}`;
  }
  
  // Work hours for specific contractor
  if (lowerQuery.includes('hours') && (lowerQuery.includes('marius') || lowerQuery.includes('dalwayne') || lowerQuery.includes('earl') || lowerQuery.includes('muhammed'))) {
    const name = lowerQuery.includes('marius') ? 'Marius Andronache' :
                 lowerQuery.includes('dalwayne') ? 'Dalwayne Diedericks' :
                 lowerQuery.includes('earl') ? 'Earl Joseph' : 'Muhammed Hussain';
    
    const sessions = await storage.getWorkSessions(name);
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.startTime.toISOString().startsWith(today));
    
    if (todaySessions.length === 0) {
      return `${name.split(' ')[0]} hasn't worked today yet.`;
    }
    
    const totalMinutes = todaySessions.reduce((sum, s) => {
      if (s.totalHours) {
        const [h, m] = s.totalHours.split(':').map(Number);
        return sum + (h * 60) + m;
      }
      return sum;
    }, 0);
    
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${name.split(' ')[0]} has worked ${hours} hours and ${mins} minutes today.`;
  }
  
  // Jobs / assignments
  if (lowerQuery.includes('job') || lowerQuery.includes('project') || lowerQuery.includes('assignment')) {
    const jobs = await storage.getJobs();
    const activeJobs = jobs.filter(j => j.status === 'assigned');
    
    if (activeJobs.length === 0) {
      return "No active jobs right now.";
    }
    
    return `There are ${activeJobs.length} active ${activeJobs.length === 1 ? 'job' : 'jobs'}. ${activeJobs.slice(0, 3).map(j => `${j.title} at ${j.location}`).join(', ')}`;
  }
  
  // Pending inspections
  if (lowerQuery.includes('inspection') || lowerQuery.includes('inspect')) {
    const inspections = await storage.getAdminInspections();
    const pending = inspections.filter(i => i.status === 'pending_review');
    
    if (pending.length === 0) {
      return "No pending inspections.";
    }
    
    return `You have ${pending.length} pending ${pending.length === 1 ? 'inspection' : 'inspections'}.`;
  }
  
  // Contractor applications
  if (lowerQuery.includes('application') || lowerQuery.includes('applicant')) {
    const applications = await storage.getContractorApplications();
    const pending = applications.filter(a => a.status === 'pending');
    
    if (pending.length === 0) {
      return "No pending applications.";
    }
    
    return `You have ${pending.length} new contractor ${pending.length === 1 ? 'application' : 'applications'}.`;
  }
  
  // Specific contractor info
  if (lowerQuery.includes('pay rate') || lowerQuery.includes('hourly rate')) {
    const name = lowerQuery.includes('marius') ? 'Marius Andronache' :
                 lowerQuery.includes('dalwayne') ? 'Dalwayne Diedericks' :
                 lowerQuery.includes('earl') ? 'Earl Joseph' : 
                 lowerQuery.includes('muhammed') ? 'Muhammed Hussain' : null;
    
    if (name) {
      const applications = await storage.getContractorApplications();
      const contractor = applications.find(a => a.firstName + ' ' + a.lastName === name);
      
      if (contractor?.adminPayRate) {
        return `${name.split(' ')[0]}'s pay rate is ${contractor.adminPayRate} per hour.`;
      }
    }
  }
  
  // Return null if no app-specific data found (will use ChatGPT instead)
  return null;
}
