import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
// Allow mobile WebView (capacitor://localhost) and other origins to call the API
app.use(cors({ origin: true, credentials: true }));
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

// Attendance monitoring service - informational only, NEVER closes or completes work sessions
async function startAttendanceMonitoringService() {
  const { storage } = await import('./storage');
  console.log("🕐 Starting attendance monitoring service (read-only flags/alerts)...");
  
  // GPS distance calculation function
  function calculateGPSDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  }

  // Get postcode coordinates function
  function getPostcodeCoordinates(postcode: string): { latitude: string; longitude: string } | null {
    const postcodeMap: { [key: string]: { latitude: string; longitude: string } } = {
      'DA17 5DB': { latitude: '51.4851', longitude: '0.1540' },
      'DA17': { latitude: '51.4851', longitude: '0.1540' },
      'DA7 6HJ': { latitude: '51.4851', longitude: '0.1540' },
      'DA7': { latitude: '51.4851', longitude: '0.1540' },
      'BR6 9HE': { latitude: '51.361', longitude: '0.106' },
      'BR6': { latitude: '51.361', longitude: '0.106' },
      'BR9': { latitude: '51.4612', longitude: '0.1388' },
      'SE9': { latitude: '51.4629', longitude: '0.0789' },
      'DA8': { latitude: '51.4891', longitude: '0.2245' },
      'DA1': { latitude: '51.4417', longitude: '0.2056' },
      'SG1 1EH': { latitude: '51.8721', longitude: '-0.2015' },
      'SG1': { latitude: '51.8721', longitude: '-0.2015' },
      'ME5 9GX': { latitude: '51.335996', longitude: '0.530215' },
      'ME5': { latitude: '51.335996', longitude: '0.530215' },
    };
    
    const upperPostcode = postcode.toUpperCase().trim();
    if (postcodeMap[upperPostcode]) {
      return postcodeMap[upperPostcode];
    }
    
    const postcodePrefix = upperPostcode.split(' ')[0];
    if (postcodeMap[postcodePrefix]) {
      return postcodeMap[postcodePrefix];
    }
    
    return null;
  }
  
  setInterval(async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      const allSessions = await storage.getAllActiveSessions();
      
      // After-hours monitoring: Flag for review, NEVER force logout or write completed state
      if (currentHour >= 17) {
        for (const session of allSessions) {
          console.log(`🕐 [LATE CLOCKOUT / REVIEW REQUIRED] ${session.contractorName} still clocked in after 17:00 (${now.toLocaleTimeString('en-GB')}). Session remains active.`);
        }
      }

      // GPS proximity monitoring
      const { getContractorLocation } = await import('./location-tracker');
      
      for (const session of allSessions) {
        try {
          // Get real-time location from location tracker
          const currentLocation = getContractorLocation(session.contractorName.trim());
          
          if (currentLocation) {
            // Multi-site detection: Check proximity to ALL job sites
            const allJobs = await storage.getJobs();
            let nearestJobSite = null;
            let nearestDistance = Infinity;
            let isNearAnyJobSite = false;
            
            // Check distance to all job sites
            for (const job of allJobs) {
              if (job.location) {
                const jobSiteCoords = getPostcodeCoordinates(job.location);
                if (jobSiteCoords) {
                  const jobSiteLat = parseFloat(jobSiteCoords.latitude);
                  const jobSiteLon = parseFloat(jobSiteCoords.longitude);
                  
                  const distance = calculateGPSDistance(
                    currentLocation.latitude, 
                    currentLocation.longitude, 
                    jobSiteLat, 
                    jobSiteLon
                  );
                  
                  if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestJobSite = {
                      location: job.location,
                      distance: distance,
                      jobTitle: job.title
                    };
                  }
                  
                  // Check if within working range of ANY job site (3.5km threshold = 3500m)
                  if (distance <= 3500) {
                    isNearAnyJobSite = true;
                  }
                }
              }
            }
            
            const isWorkingHours = currentHour >= 8 && currentHour < 17;
            
            if (!isNearAnyJobSite) {
              const nearestInfo = nearestJobSite ? 
                `${Math.round(nearestDistance)}m from nearest site (${nearestJobSite.location})` :
                'no job sites found';

              // Outside site radius: Flag for review, NEVER auto-logout
              console.log(`📍 [ATTENDANCE REVIEW REQUIRED] ${session.contractorName} outside site range - ${nearestInfo} (working hours: ${isWorkingHours}). Session remains active.`);
              
              // Record departure for informational logs only if during working hours
              if (isWorkingHours) {
                const existingDeparture = await storage.getActiveDeparture(session.contractorName, session.id);
                if (!existingDeparture) {
                  await storage.createTemporaryDeparture({
                    contractorName: session.contractorName,
                    workSessionId: session.id,
                    departureTime: new Date(),
                    status: 'away',
                    distanceFromSite: nearestJobSite ? Math.round(nearestDistance).toString() : null,
                    nearestJobSite: nearestJobSite ? nearestJobSite.location : null
                  });
                }
              }
            } else {
              // Contractor is on site - check if they were previously away
              const activeDeparture = await storage.getActiveDeparture(session.contractorName, session.id);
              if (activeDeparture) {
                await storage.updateTemporaryDeparture(activeDeparture.id, {
                  returnTime: new Date(),
                  status: 'returned'
                });
                console.log(`🟢 RETURNED TO SITE: ${session.contractorName} back on job site (session continuous)`);
              }
            }
          } else {
            // No real-time GPS available: informational warning only
            const assignments = await storage.getContractorAssignments(session.contractorName.trim());
            if (assignments.length > 0 && session.startLatitude && session.startLongitude) {
              const assignment = assignments[0];
              const workLocation = assignment.workLocation;
              const jobSiteCoords = getPostcodeCoordinates(workLocation);
              
              if (jobSiteCoords) {
                const jobSiteLat = parseFloat(jobSiteCoords.latitude);
                const jobSiteLon = parseFloat(jobSiteCoords.longitude);
                const contractorLat = parseFloat(session.startLatitude);
                const contractorLon = parseFloat(session.startLongitude);
                const distance = calculateGPSDistance(contractorLat, contractorLon, jobSiteLat, jobSiteLon);
                
                if (distance > 500) {
                  console.log(`📍 [ATTENDANCE REVIEW REQUIRED - FALLBACK] ${session.contractorName} start location is ${Math.round(distance)}m from ${workLocation}. Session remains active.`);
                }
              }
            }
          }
        } catch (gpsError) {
          console.error(`❌ GPS proximity check error for ${session.contractorName}:`, gpsError);
        }
      }
      
      // Progress monitoring log
      if (currentMinute % 5 === 0 && currentHour < 17) {
        const activeSessions = await storage.getAllActiveSessions();
        if (activeSessions.length > 0) {
          console.log(`🕐 MULTI-SITE MONITORING: ${activeSessions.length} active contractors being monitored.`);
        }
      }
      
    } catch (error) {
      console.error("❌ Error in attendance monitoring service:", error);
    }
  }, 30000); // Check every 30 seconds
}

(async () => {
  const server = await registerRoutes(app);
  
  // Start attendance monitoring service (informational alerts only)
  await startAttendanceMonitoringService();

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
