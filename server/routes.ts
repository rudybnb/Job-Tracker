// Following Replit Auth blueprint patterns for route setup
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";

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

  // Additional application routes will go here
  // All routes should be prefixed with /api

  const httpServer = createServer(app);

  return httpServer;
}
