// Following Replit Auth blueprint patterns for route setup
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, hasRole } from "./replitAuth";
import { insertSiteSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth middleware and routes
  await setupAuth(app);

  // Auth routes (required for Replit Auth integration)
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Protected test route to verify auth is working
  app.get("/api/protected/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      res.json({
        message: "Authentication successful",
        userId,
        user,
      });
    } catch (error) {
      console.error("Error in protected test route:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Site Management Routes
  
  // GET /api/sites - list all sites
  app.get("/api/sites", isAuthenticated, async (req, res) => {
    try {
      const sites = await storage.getAllSites();
      res.json(sites);
    } catch (error) {
      console.error("Error fetching sites:", error);
      res.status(500).json({ message: "Failed to fetch sites" });
    }
  });

  // POST /api/sites - create site (admin only)
  app.post("/api/sites", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const siteData = insertSiteSchema.parse(req.body);
      const site = await storage.createSite(siteData);
      res.status(201).json(site);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid site data", errors: error.errors });
      }
      console.error("Error creating site:", error);
      res.status(500).json({ message: "Failed to create site" });
    }
  });

  // PATCH /api/sites/:id - update site (admin only)
  app.patch("/api/sites/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const siteId = parseInt(req.params.id);
      const siteData = insertSiteSchema.partial().parse(req.body);
      const site = await storage.updateSite(siteId, siteData);
      
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }
      
      res.json(site);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid site data", errors: error.errors });
      }
      console.error("Error updating site:", error);
      res.status(500).json({ message: "Failed to update site" });
    }
  });

  // User Management Routes

  // GET /api/users - list all users with their site/role info
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // POST /api/users - create/invite user (admin/site_manager only)
  app.post("/api/users", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // PATCH /api/users/:id - update user role/site/rate (admin/site_manager only)
  app.patch("/api/users/:id", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const userId = req.params.id;
      const userData = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(userId, userData);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // DELETE /api/users/:id - deactivate user (admin only)
  app.delete("/api/users/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const userId = req.params.id;
      const success = await storage.deleteUser(userId);
      
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
