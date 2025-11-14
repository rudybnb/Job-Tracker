import { Express, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Financial Tracking API Routes
 * Provides comprehensive endpoints for budget management, expense tracking, and financial reporting
 */

export function setupFinancialRoutes(app: Express) {
  
  // ============================================================================
  // CLIENTS API
  // ============================================================================
  
  /**
   * GET /api/clients
   * Get all clients with their spending summary
   */
  app.get("/api/financial/clients", async (req: Request, res: Response) => {
    try {
      const clients = await db.execute(sql`
        SELECT * FROM clients ORDER BY created_at DESC
      `);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });
  
  /**
   * GET /api/clients/:id
   * Get a specific client with detailed information
   */
  app.get("/api/financial/clients/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const client = await db.execute(sql`
        SELECT * FROM clients WHERE id = ${id}
      `);
      
      if (!client || client.length === 0) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      // Get client's jobs
      const jobs = await db.execute(sql`
        SELECT * FROM jobs WHERE client_id = ${id} ORDER BY created_at DESC
      `);
      
      res.json({
        ...client[0],
        jobs
      });
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });
  
  /**
   * POST /api/clients
   * Create a new client
   */
  app.post("/api/financial/clients", async (req: Request, res: Response) => {
    try {
      const { name, email, phone, address } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Client name is required" });
      }
      
      const result = await db.execute(sql`
        INSERT INTO clients (name, email, phone, address)
        VALUES (${name}, ${email || null}, ${phone || null}, ${address || null})
        RETURNING *
      `);
      
      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });
  
  /**
   * PUT /api/clients/:id
   * Update a client
   */
  app.put("/api/financial/clients/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, phone, address } = req.body;
      
      const result = await db.execute(sql`
        UPDATE clients 
        SET name = ${name}, 
            email = ${email || null}, 
            phone = ${phone || null}, 
            address = ${address || null},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `);
      
      if (!result || result.length === 0) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      res.json(result[0]);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });
  
  /**
   * DELETE /api/clients/:id
   * Delete a client (will cascade delete all associated jobs)
   */
  app.delete("/api/financial/clients/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.execute(sql`
        DELETE FROM clients WHERE id = ${id}
      `);
      
      res.json({ message: "Client deleted successfully" });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: "Failed to delete client" });
    }
  });
  
  // ============================================================================
  // JOBS API
  // ============================================================================
  
  /**
   * GET /api/jobs
   * Get all jobs with budget summary
   */
  app.get("/api/financial/jobs", async (req: Request, res: Response) => {
    try {
      const jobs = await db.execute(sql`
        SELECT j.*, c.name as client_name
        FROM jobs j
        LEFT JOIN clients c ON j.client_id = c.id
        ORDER BY j.created_at DESC
      `);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });
  
  /**
   * GET /api/jobs/:id
   * Get a specific job with detailed budget breakdown
   */
  app.get("/api/financial/jobs/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // Get job details
      const job = await db.execute(sql`
        SELECT j.*, c.name as client_name, c.email as client_email
        FROM jobs j
        LEFT JOIN clients c ON j.client_id = c.id
        WHERE j.id = ${id}
      `);
      
      if (!job || job.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Get job phases
      const phases = await db.execute(sql`
        SELECT * FROM job_phases WHERE job_id = ${id} ORDER BY phase_order
      `);
      
      // Get expenses
      const expenses = await db.execute(sql`
        SELECT * FROM expenses WHERE job_id = ${id} ORDER BY expense_date DESC
      `);
      
      res.json({
        ...job[0],
        phases,
        expenses
      });
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });
  
  /**
   * POST /api/jobs
   * Create a new job
   */
  app.post("/api/financial/jobs", async (req: Request, res: Response) => {
    try {
      const {
        client_id,
        job_name,
        job_description,
        job_address,
        total_budget,
        labour_budget,
        material_budget,
        plant_budget,
        start_date,
        estimated_end_date
      } = req.body;
      
      if (!client_id || !job_name || !total_budget) {
        return res.status(400).json({ 
          error: "client_id, job_name, and total_budget are required" 
        });
      }
      
      const result = await db.execute(sql`
        INSERT INTO jobs (
          client_id, job_name, job_description, job_address,
          total_budget, labour_budget, material_budget, plant_budget,
          start_date, estimated_end_date, status
        )
        VALUES (
          ${client_id}, ${job_name}, ${job_description || null}, ${job_address || null},
          ${total_budget}, ${labour_budget || 0}, ${material_budget || 0}, ${plant_budget || 0},
          ${start_date || null}, ${estimated_end_date || null}, 'planned'
        )
        RETURNING *
      `);
      
      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  });
  
  /**
   * PUT /api/jobs/:id
   * Update a job
   */
  app.put("/api/financial/jobs/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        job_name,
        job_description,
        job_address,
        total_budget,
        labour_budget,
        material_budget,
        plant_budget,
        start_date,
        estimated_end_date,
        actual_end_date,
        status
      } = req.body;
      
      const result = await db.execute(sql`
        UPDATE jobs 
        SET job_name = ${job_name},
            job_description = ${job_description || null},
            job_address = ${job_address || null},
            total_budget = ${total_budget},
            labour_budget = ${labour_budget || 0},
            material_budget = ${material_budget || 0},
            plant_budget = ${plant_budget || 0},
            start_date = ${start_date || null},
            estimated_end_date = ${estimated_end_date || null},
            actual_end_date = ${actual_end_date || null},
            status = ${status || 'planned'},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `);
      
      if (!result || result.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(result[0]);
    } catch (error) {
      console.error("Error updating job:", error);
      res.status(500).json({ error: "Failed to update job" });
    }
  });
  
  /**
   * DELETE /api/jobs/:id
   * Delete a job
   */
  app.delete("/api/financial/jobs/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.execute(sql`
        DELETE FROM jobs WHERE id = ${id}
      `);
      
      res.json({ message: "Job deleted successfully" });
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });
  
  // ============================================================================
  // JOB PHASES API
  // ============================================================================
  
  /**
   * GET /api/jobs/:jobId/phases
   * Get all phases for a job
   */
  app.get("/api/financial/jobs/:jobId/phases", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const phases = await db.execute(sql`
        SELECT * FROM job_phases 
        WHERE job_id = ${jobId} 
        ORDER BY phase_order
      `);
      
      res.json(phases);
    } catch (error) {
      console.error("Error fetching phases:", error);
      res.status(500).json({ error: "Failed to fetch phases" });
    }
  });
  
  /**
   * POST /api/jobs/:jobId/phases
   * Create a new phase for a job
   */
  app.post("/api/financial/jobs/:jobId/phases", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const {
        phase_name,
        phase_description,
        phase_order,
        labour_budget,
        material_budget,
        plant_budget,
        start_date,
        estimated_end_date
      } = req.body;
      
      if (!phase_name) {
        return res.status(400).json({ error: "phase_name is required" });
      }
      
      const result = await db.execute(sql`
        INSERT INTO job_phases (
          job_id, phase_name, phase_description, phase_order,
          labour_budget, material_budget, plant_budget,
          start_date, estimated_end_date, status
        )
        VALUES (
          ${jobId}, ${phase_name}, ${phase_description || null}, ${phase_order || 0},
          ${labour_budget || 0}, ${material_budget || 0}, ${plant_budget || 0},
          ${start_date || null}, ${estimated_end_date || null}, 'not_started'
        )
        RETURNING *
      `);
      
      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating phase:", error);
      res.status(500).json({ error: "Failed to create phase" });
    }
  });
  
  /**
   * PUT /api/phases/:id
   * Update a phase
   */
  app.put("/api/financial/phases/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        phase_name,
        phase_description,
        phase_order,
        labour_budget,
        material_budget,
        plant_budget,
        start_date,
        estimated_end_date,
        actual_end_date,
        status
      } = req.body;
      
      const result = await db.execute(sql`
        UPDATE job_phases 
        SET phase_name = ${phase_name},
            phase_description = ${phase_description || null},
            phase_order = ${phase_order || 0},
            labour_budget = ${labour_budget || 0},
            material_budget = ${material_budget || 0},
            plant_budget = ${plant_budget || 0},
            start_date = ${start_date || null},
            estimated_end_date = ${estimated_end_date || null},
            actual_end_date = ${actual_end_date || null},
            status = ${status || 'not_started'},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `);
      
      if (!result || result.length === 0) {
        return res.status(404).json({ error: "Phase not found" });
      }
      
      res.json(result[0]);
    } catch (error) {
      console.error("Error updating phase:", error);
      res.status(500).json({ error: "Failed to update phase" });
    }
  });
  
  /**
   * DELETE /api/phases/:id
   * Delete a phase
   */
  app.delete("/api/financial/phases/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.execute(sql`
        DELETE FROM job_phases WHERE id = ${id}
      `);
      
      res.json({ message: "Phase deleted successfully" });
    } catch (error) {
      console.error("Error deleting phase:", error);
      res.status(500).json({ error: "Failed to delete phase" });
    }
  });
  
  // ============================================================================
  // EXPENSES API
  // ============================================================================
  
  /**
   * GET /api/jobs/:jobId/expenses
   * Get all expenses for a job
   */
  app.get("/api/financial/jobs/:jobId/expenses", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const expenses = await db.execute(sql`
        SELECT e.*, jp.phase_name
        FROM expenses e
        LEFT JOIN job_phases jp ON e.phase_id = jp.id
        WHERE e.job_id = ${jobId}
        ORDER BY e.expense_date DESC
      `);
      
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });
  
  /**
   * POST /api/expenses
   * Create a new expense
   */
  app.post("/api/financial/expenses", async (req: Request, res: Response) => {
    try {
      const {
        job_id,
        phase_id,
        expense_type,
        description,
        amount,
        expense_date,
        supplier,
        receipt_url,
        payment_status
      } = req.body;
      
      if (!job_id || !expense_type || !amount) {
        return res.status(400).json({ 
          error: "job_id, expense_type, and amount are required" 
        });
      }
      
      const result = await db.execute(sql`
        INSERT INTO expenses (
          job_id, phase_id, expense_type, description, amount,
          expense_date, supplier, receipt_url, payment_status
        )
        VALUES (
          ${job_id}, ${phase_id || null}, ${expense_type}, ${description || null}, ${amount},
          ${expense_date || sql`CURRENT_DATE`}, ${supplier || null}, ${receipt_url || null}, ${payment_status || 'pending'}
        )
        RETURNING *
      `);
      
      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating expense:", error);
      res.status(500).json({ error: "Failed to create expense" });
    }
  });
  
  /**
   * PUT /api/expenses/:id
   * Update an expense
   */
  app.put("/api/financial/expenses/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        expense_type,
        description,
        amount,
        expense_date,
        supplier,
        receipt_url,
        payment_status
      } = req.body;
      
      const result = await db.execute(sql`
        UPDATE expenses 
        SET expense_type = ${expense_type},
            description = ${description || null},
            amount = ${amount},
            expense_date = ${expense_date},
            supplier = ${supplier || null},
            receipt_url = ${receipt_url || null},
            payment_status = ${payment_status},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `);
      
      if (!result || result.length === 0) {
        return res.status(404).json({ error: "Expense not found" });
      }
      
      res.json(result[0]);
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(500).json({ error: "Failed to update expense" });
    }
  });
  
  /**
   * DELETE /api/expenses/:id
   * Delete an expense
   */
  app.delete("/api/financial/expenses/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.execute(sql`
        DELETE FROM expenses WHERE id = ${id}
      `);
      
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });
  
  // ============================================================================
  // CONTRACTORS API
  // ============================================================================
  
  /**
   * GET /api/contractors
   * Get all contractors
   */
  app.get("/api/financial/contractors", async (req: Request, res: Response) => {
    try {
      const contractors = await db.execute(sql`
        SELECT c.*, ct.type_name as contractor_type_name
        FROM contractors c
        LEFT JOIN contractor_types ct ON c.contractor_type_id = ct.id
        ORDER BY c.name
      `);
      res.json(contractors);
    } catch (error) {
      console.error("Error fetching contractors:", error);
      res.status(500).json({ error: "Failed to fetch contractors" });
    }
  });
  
  /**
   * POST /api/contractors
   * Create a new contractor
   */
  app.post("/api/financial/contractors", async (req: Request, res: Response) => {
    try {
      const {
        name,
        email,
        phone,
        trade,
        contractor_type_id,
        hourly_rate,
        daily_rate
      } = req.body;
      
      if (!name || !contractor_type_id) {
        return res.status(400).json({ 
          error: "name and contractor_type_id are required" 
        });
      }
      
      const result = await db.execute(sql`
        INSERT INTO contractors (
          name, email, phone, trade, contractor_type_id,
          hourly_rate, daily_rate, status
        )
        VALUES (
          ${name}, ${email || null}, ${phone || null}, ${trade || null}, ${contractor_type_id},
          ${hourly_rate || null}, ${daily_rate || null}, 'active'
        )
        RETURNING *
      `);
      
      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating contractor:", error);
      res.status(500).json({ error: "Failed to create contractor" });
    }
  });
  
  /**
   * GET /api/contractor-types
   * Get all contractor types
   */
  app.get("/api/financial/contractor-types", async (req: Request, res: Response) => {
    try {
      const types = await db.execute(sql`
        SELECT * FROM contractor_types ORDER BY type_name
      `);
      res.json(types);
    } catch (error) {
      console.error("Error fetching contractor types:", error);
      res.status(500).json({ error: "Failed to fetch contractor types" });
    }
  });
  
  // ============================================================================
  // PAYMENTS API
  // ============================================================================
  
  /**
   * GET /api/contractors/:contractorId/payments
   * Get all payments for a contractor
   */
  app.get("/api/financial/contractors/:contractorId/payments", async (req: Request, res: Response) => {
    try {
      const { contractorId } = req.params;
      
      const payments = await db.execute(sql`
        SELECT cp.*, j.job_name, c.name as contractor_name
        FROM contractor_payments cp
        LEFT JOIN jobs j ON cp.job_id = j.id
        LEFT JOIN contractors c ON cp.contractor_id = c.id
        WHERE cp.contractor_id = ${contractorId}
        ORDER BY cp.payment_date DESC
      `);
      
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });
  
  /**
   * POST /api/payments
   * Record a new payment
   */
  app.post("/api/financial/payments", async (req: Request, res: Response) => {
    try {
      const {
        contractor_id,
        job_id,
        phase_id,
        amount,
        payment_date,
        payment_method,
        reference_number,
        notes
      } = req.body;
      
      if (!contractor_id || !job_id || !amount) {
        return res.status(400).json({ 
          error: "contractor_id, job_id, and amount are required" 
        });
      }
      
      const result = await db.execute(sql`
        INSERT INTO contractor_payments (
          contractor_id, job_id, phase_id, amount, payment_date,
          payment_method, reference_number, notes, status
        )
        VALUES (
          ${contractor_id}, ${job_id}, ${phase_id || null}, ${amount}, 
          ${payment_date || sql`CURRENT_DATE`},
          ${payment_method || null}, ${reference_number || null}, ${notes || null}, 'completed'
        )
        RETURNING *
      `);
      
      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error recording payment:", error);
      res.status(500).json({ error: "Failed to record payment" });
    }
  });
  
  // ============================================================================
  // DASHBOARD / SUMMARY API
  // ============================================================================
  
  /**
   * GET /api/dashboard/summary
   * Get overall financial summary
   */
  app.get("/api/financial/dashboard/summary", async (req: Request, res: Response) => {
    try {
      // Total clients
      const clientCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM clients
      `);
      
      // Active jobs
      const activeJobs = await db.execute(sql`
        SELECT COUNT(*) as count FROM jobs WHERE status = 'in_progress'
      `);
      
      // Total budget across all jobs
      const totalBudget = await db.execute(sql`
        SELECT 
          COALESCE(SUM(total_budget), 0) as total_budget,
          COALESCE(SUM(total_actual_cost), 0) as total_actual,
          COALESCE(SUM(profit_loss), 0) as total_profit_loss
        FROM jobs
      `);
      
      // Recent expenses
      const recentExpenses = await db.execute(sql`
        SELECT e.*, j.job_name
        FROM expenses e
        LEFT JOIN jobs j ON e.job_id = j.id
        ORDER BY e.expense_date DESC
        LIMIT 10
      `);
      
      // Budget alerts
      const alerts = await db.execute(sql`
        SELECT ba.*, j.job_name
        FROM budget_alerts ba
        LEFT JOIN jobs j ON ba.job_id = j.id
        WHERE ba.status = 'pending'
        ORDER BY ba.created_at DESC
        LIMIT 5
      `);
      
      res.json({
        clientCount: clientCount[0].count,
        activeJobsCount: activeJobs[0].count,
        totalBudget: totalBudget[0].total_budget,
        totalActual: totalBudget[0].total_actual,
        totalProfitLoss: totalBudget[0].total_profit_loss,
        recentExpenses,
        alerts
      });
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      res.status(500).json({ error: "Failed to fetch dashboard summary" });
    }
  });
  
  console.log("✅ Financial tracking API routes registered");
}
