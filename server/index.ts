import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Automatic 5PM logout background service
async function startAutomaticLogoutService() {
  const { storage } = await import('./storage');
  console.log("🕐 Starting automatic logout service...");
  
  setInterval(async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      // Force logout at 5:00 PM exactly
      if (currentHour >= 17) {
        const allSessions = await storage.getAllActiveSessions();
        
        for (const session of allSessions) {
          // Calculate end time as 5:00 PM sharp
          const endTime = new Date(session.startTime);
          endTime.setHours(17, 0, 0, 0);
          
          // Update session to completed
          await storage.updateWorkSession(session.id, {
            endTime,
            status: 'completed' as const
          });
          
          console.log(`🕐 AUTO-LOGOUT: ${session.contractorName} clocked out at 5:00 PM`);
        }
      }
      
      // Show progress every 5 minutes before 5pm
      if (currentMinute % 5 === 0 && currentHour < 17) {
        const activeSessions = await storage.getAllActiveSessions();
        if (activeSessions.length > 0) {
          console.log(`🕐 MONITORING: ${activeSessions.length} active contractors, auto-logout at 5:00 PM`);
        }
      }
      
    } catch (error) {
      console.error("❌ Error in automatic logout service:", error);
    }
  }, 30000); // Check every 30 seconds
}

(async () => {
  const server = await registerRoutes(app);
  
  // Start automatic logout service
  await startAutomaticLogoutService();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
