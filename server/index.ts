import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enable CORS for mobile (Capacitor) and local dev
const allowedOrigins = new Set<string>([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "http://localhost:5000",
  "http://localhost:5173",
]);
// Dynamically allow the current server port (e.g., 5160 in dev)
if (process.env.PORT) {
  allowedOrigins.add(`http://localhost:${process.env.PORT}`);
}
if (process.env.REPLIT_DOMAINS) {
  for (const d of process.env.REPLIT_DOMAINS.split(",")) {
    allowedOrigins.add(`https://${d}`);
  }
}
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const o = origin.toLowerCase();
      if (allowedOrigins.has(o) || /https:\/\/.*\.replit\.dev$/i.test(o)) {
        return cb(null, true);
      }
      cb(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);

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

async function seedDevData() {
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const usingMemory = !process.env.DATABASE_URL;
    if (!isDev || !usingMemory) return;

    const [sites, users] = await Promise.all([
      storage.getAllSites(),
      storage.getAllUsers(),
    ]);

    // Only seed when there are no users (fresh memory store)
    if (users.length > 0) {
      log("dev seed: users already present, skipping", "seed");
      return;
    }

    log("dev seed: populating in-memory data", "seed");

    // Ensure a few test sites exist (Kent Care Home is pre-seeded in memory)
    const existingNames = new Set(sites.map(s => s.name));
    const siteDefs = [
      { name: "London Care Home", color: "teal", location: "London", postCode: "SW1A 1AA" },
      { name: "Essex Care Home", color: "orange", location: "Essex", postCode: "CM1 1AA" },
    ];

    for (const def of siteDefs) {
      if (!existingNames.has(def.name)) {
        await storage.createSite(def as any);
      }
    }

    const allSites = await storage.getAllSites();
    const kent = allSites.find(s => s.name.includes("Kent")) || allSites[0];
    const london = allSites.find(s => s.name.includes("London")) || allSites[0];
    const essex = allSites.find(s => s.name.includes("Essex")) || allSites[0];

    // Create an admin and a site manager
    const admin = await storage.createUser({
      email: "admin@test.local",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
    });

    const manager = await storage.createUser({
      email: "manager@test.local",
      firstName: "Site",
      lastName: "Manager",
      role: "site_manager",
      siteId: london?.id,
    });

    await storage.createUser({
      email: "worker@test.local",
      firstName: "Test",
      lastName: "Worker",
      role: "worker",
      siteId: kent?.id,
    });

    log("dev seed: finished", "seed");
  } catch (e) {
    log(`dev seed error: ${String(e)}`, "seed");
  }
}

(async () => {
  const server = await registerRoutes(app);

  await seedDevData();

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
    // reusePort can cause ENOTSUP on some platforms (e.g., Windows), omit it
  }, () => {
    log(`serving on port ${port}`);
  });
})();
