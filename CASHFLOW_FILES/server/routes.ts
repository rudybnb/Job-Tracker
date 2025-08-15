import { Router } from 'express';
import { z } from 'zod';
import { DatabaseStorage } from './database-storage.js';
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';

export function cashflowRoutes(storage: DatabaseStorage) {
  const router = Router();

  // GET /api/contractors - Get all contractors with their rates
  router.get('/contractors', async (req, res) => {
    try {
      const contractors = await storage.getContractors();
      res.json(contractors);
    } catch (error) {
      console.error('❌ Error fetching contractors:', error);
      res.status(500).json({ error: 'Failed to fetch contractors' });
    }
  });

  // GET /api/contractor/:id - Get specific contractor
  router.get('/contractor/:id', async (req, res) => {
    try {
      const contractor = await storage.getContractor(req.params.id);
      if (!contractor) {
        return res.status(404).json({ error: 'Contractor not found' });
      }
      res.json(contractor);
    } catch (error) {
      console.error('❌ Error fetching contractor:', error);
      res.status(500).json({ error: 'Failed to fetch contractor' });
    }
  });

  // GET /api/jobs - Get all jobs
  router.get('/jobs', async (req, res) => {
    try {
      const jobs = await storage.getJobs();
      res.json(jobs);
    } catch (error) {
      console.error('❌ Error fetching jobs:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  // GET /api/active-jobs - Get active jobs only
  router.get('/active-jobs', async (req, res) => {
    try {
      const jobs = await storage.getActiveJobs();
      res.json(jobs);
    } catch (error) {
      console.error('❌ Error fetching active jobs:', error);
      res.status(500).json({ error: 'Failed to fetch active jobs' });
    }
  });

  // GET /api/work-sessions - Get work sessions with optional filters
  router.get('/work-sessions', async (req, res) => {
    try {
      const { contractor, startDate, endDate } = req.query;
      
      const start = startDate ? parseISO(startDate as string) : undefined;
      const end = endDate ? parseISO(endDate as string) : undefined;
      
      const sessions = await storage.getWorkSessions(
        contractor as string,
        start,
        end
      );
      
      res.json(sessions);
    } catch (error) {
      console.error('❌ Error fetching work sessions:', error);
      res.status(500).json({ error: 'Failed to fetch work sessions' });
    }
  });

  // GET /api/contractor-earnings/:name - Get contractor earnings for date range
  router.get('/contractor-earnings/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start date and end date are required' });
      }
      
      const start = parseISO(startDate as string);
      const end = parseISO(endDate as string);
      
      const earnings = await storage.getContractorEarnings(name, start, end);
      res.json(earnings);
    } catch (error) {
      console.error('❌ Error fetching contractor earnings:', error);
      res.status(500).json({ error: 'Failed to fetch contractor earnings' });
    }
  });

  // GET /api/project-cashflow/:jobId - Get project cash flow analysis
  router.get('/project-cashflow/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const { startDate, endDate } = req.query;
      
      const start = startDate ? parseISO(startDate as string) : undefined;
      const end = endDate ? parseISO(endDate as string) : undefined;
      
      const cashFlow = await storage.getProjectCashFlow(jobId, start, end);
      
      if (!cashFlow) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(cashFlow);
    } catch (error) {
      console.error('❌ Error fetching project cash flow:', error);
      res.status(500).json({ error: 'Failed to fetch project cash flow' });
    }
  });

  // GET /api/weekly-report - Get weekly cash flow report
  router.get('/weekly-report', async (req, res) => {
    try {
      const { date } = req.query;
      const targetDate = date ? parseISO(date as string) : new Date();
      
      const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 }); // Monday
      const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 }); // Sunday
      
      // Get all work sessions for the week
      const sessions = await storage.getWeeklyWorkSessions(weekStart, weekEnd);
      
      // Group by contractor and calculate costs
      const contractorBreakdown: Record<string, {
        name: string;
        hours: number;
        cost: number;
        rate: number;
        sessions: number;
      }> = {};
      
      let totalLabourCosts = 0;
      let totalHours = 0;
      
      for (const session of sessions) {
        if (!session.endTime) continue;
        
        const contractor = await storage.getContractorByName(session.contractorName);
        if (!contractor) continue;
        
        const hours = (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);
        const rate = parseFloat(contractor.payRate);
        const cost = hours * rate;
        
        if (!contractorBreakdown[session.contractorName]) {
          contractorBreakdown[session.contractorName] = {
            name: session.contractorName,
            hours: 0,
            cost: 0,
            rate,
            sessions: 0
          };
        }
        
        contractorBreakdown[session.contractorName].hours += hours;
        contractorBreakdown[session.contractorName].cost += cost;
        contractorBreakdown[session.contractorName].sessions += 1;
        
        totalLabourCosts += cost;
        totalHours += hours;
      }
      
      // Get active jobs count
      const activeJobs = await storage.getActiveJobs();
      
      const report = {
        weekPeriod: {
          start: format(weekStart, 'yyyy-MM-dd'),
          end: format(weekEnd, 'yyyy-MM-dd'),
          startFormatted: format(weekStart, 'MMM dd, yyyy'),
          endFormatted: format(weekEnd, 'MMM dd, yyyy')
        },
        summary: {
          totalLabourCosts: Number(totalLabourCosts.toFixed(2)),
          totalMaterialCosts: 0, // TODO: Calculate from material costs table
          totalProjectCosts: Number(totalLabourCosts.toFixed(2)),
          totalHours: Number(totalHours.toFixed(2)),
          activeJobs: activeJobs.length,
          activeContractors: Object.keys(contractorBreakdown).length
        },
        contractorBreakdown: Object.values(contractorBreakdown),
        sessions: sessions.map(session => ({
          ...session,
          duration: session.endTime ? 
            (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60) : 0
        }))
      };
      
      res.json(report);
    } catch (error) {
      console.error('❌ Error generating weekly report:', error);
      res.status(500).json({ error: 'Failed to generate weekly report' });
    }
  });

  // GET /api/dashboard-summary - Get overall cash flow dashboard data
  router.get('/dashboard-summary', async (req, res) => {
    try {
      const currentDate = new Date();
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      
      // This week's data
      const thisWeekSessions = await storage.getWeeklyWorkSessions(weekStart, weekEnd);
      
      // Calculate this week's totals
      let thisWeekLabour = 0;
      let thisWeekHours = 0;
      const activeContractors = new Set<string>();
      
      for (const session of thisWeekSessions) {
        if (!session.endTime) continue;
        
        const contractor = await storage.getContractorByName(session.contractorName);
        if (!contractor) continue;
        
        const hours = (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);
        const cost = hours * parseFloat(contractor.payRate);
        
        thisWeekLabour += cost;
        thisWeekHours += hours;
        activeContractors.add(session.contractorName);
      }
      
      // Get all active jobs
      const activeJobs = await storage.getActiveJobs();
      
      // Get all contractors for rates display
      const allContractors = await storage.getContractors();
      
      const summary = {
        thisWeek: {
          labourCosts: Number(thisWeekLabour.toFixed(2)),
          materialCosts: 0, // TODO: Add material costs
          totalCosts: Number(thisWeekLabour.toFixed(2)),
          hoursWorked: Number(thisWeekHours.toFixed(2)),
          activeContractors: activeContractors.size,
          activeSessions: thisWeekSessions.length
        },
        projects: {
          activeJobs: activeJobs.length,
          totalBudget: 0, // TODO: Calculate from project budgets
          spent: Number(thisWeekLabour.toFixed(2)),
          remaining: 0 // TODO: Calculate remaining budget
        },
        contractors: allContractors.map(c => ({
          id: c.id,
          name: c.name,
          hourlyRate: parseFloat(c.payRate),
          thisWeekHours: thisWeekSessions
            .filter(s => s.contractorName === c.name && s.endTime)
            .reduce((total, s) => total + ((s.endTime!.getTime() - s.startTime.getTime()) / (1000 * 60 * 60)), 0),
          thisWeekEarnings: 0 // Will be calculated from hours
        }))
      };
      
      // Calculate contractor earnings
      summary.contractors.forEach(c => {
        c.thisWeekEarnings = Number((c.thisWeekHours * c.hourlyRate).toFixed(2));
      });
      
      res.json(summary);
    } catch (error) {
      console.error('❌ Error generating dashboard summary:', error);
      res.status(500).json({ error: 'Failed to generate dashboard summary' });
    }
  });

  return router;
}