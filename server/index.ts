import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { isProduction } from "./db-safety.ts";
import { registerRoutes } from "./routes";
import { setupSimpleRoutes } from "./simple-routes";
import { verifySchemaHealth } from "./schema-health.ts";
import { setupFinancialRoutes } from "./financial-routes";
import { setupVite, serveStatic, log } from "./vite";
import { client } from "./db";
import { createLocalJarvisShadowRouter, JARVIS_SHADOW_API_KEY_ID_ENV, JARVIS_SHADOW_API_KEY_SECRET_ENV, PostgresIntegrationSqlExecutor } from "./integration-shadow-live.ts";
import { SqlIntegrationReviewRepository } from "./integration-review-repository.ts";
import { createJarvisReviewRouter } from "./integration-review-route.ts";
import { SqlIntegrationChangeOrderApplicationRepository } from "./integration-change-order-applications.ts";
import { createJarvisApplicationRouter } from "./integration-application-route.ts";
import { SqlIntegrationContractorMessageRepository } from "./integration-contractor-message-repository.ts";
import { SqlContractorMessageService } from "./integration-contractor-message-service.ts";
import { createContractorMessageRouter } from "./integration-contractor-message-route.ts";
import { createWhatsAppWebhookRouter } from "./whatsapp-webhook-route.ts";
import { createWhatsAppProvider } from "./whatsapp.ts";
import { PostgresLabourCostExecutor } from "./labour-cost-executor.ts";
import { SqlLabourCostReviewRepository } from "./labour-cost-review.ts";
import { SqlLabourSettlementRepository } from "./labour-settlement.ts";
import { createLabourCostReviewRouter } from "./labour-cost-routes.ts";
import { createSiteCheckinRouter } from "./site-checkin-routes.ts";
import { PostgresSiteCheckinStore } from "./site-checkin-repository.ts";
import { CommercialFinanceRepository } from "./commercial-finance.ts";
import { createCommercialFinanceRouter } from "./commercial-finance-routes.ts";
import { BankReconciliationRepository } from "./monzo-bank.ts";
import { createBankRouter } from "./bank-routes.ts";
import { createJarvisIdentityResolverRouter, SqlJarvisIdentityResolver } from "./jarvis-identity-resolver.ts";
import { createWorkerRouter } from "./worker-routes.ts";

const app = express();
app.set("trust proxy", 1);
// Allow mobile WebView (capacitor://localhost) and other origins to call the API
app.use(cors({ origin: true, credentials: true }));

// Local Jarvis shadow intake. Dormant (404) unless JARVIS_SHADOW_API_KEY_ID
// and JARVIS_SHADOW_API_KEY_SECRET are set. Mounted before express.json() so
// the raw body is available for HMAC content-hash verification.
app.use(createLocalJarvisShadowRouter(client));

const jarvisMachineKeyId = process.env[JARVIS_SHADOW_API_KEY_ID_ENV]?.trim();
const jarvisMachineSecret = process.env[JARVIS_SHADOW_API_KEY_SECRET_ENV]?.trim();
const jarvisIdentityNonces = new Set<string>();

// Internal Jarvis identity resolver. Reuses the existing Jarvis machine-auth
// HMAC headers and remains dormant unless the same integration key env vars are set.
app.use(createJarvisIdentityResolverRouter({
  enabled: !!jarvisMachineKeyId && !!jarvisMachineSecret,
  resolver: new SqlJarvisIdentityResolver(new PostgresIntegrationSqlExecutor(client)),
  keyLookup: (candidate) => candidate === jarvisMachineKeyId ? jarvisMachineSecret : undefined,
  nonceLookup: (candidateKeyId, nonce) => jarvisIdentityNonces.has(`${candidateKeyId}:${nonce}`),
  nonceStore: (candidateKeyId, nonce) => {
    jarvisIdentityNonces.add(`${candidateKeyId}:${nonce}`);
  },
}));

const contractorMessageService = new SqlContractorMessageService({
  repository: new SqlIntegrationContractorMessageRepository({
    executor: new PostgresIntegrationSqlExecutor(client),
  }),
  provider: createWhatsAppProvider(),
});

// Meta-authenticated WhatsApp webhook. Mounted before express.json() so the POST
// route verifies the HMAC over the raw request bytes.
app.use(createWhatsAppWebhookRouter({
  service: contractorMessageService,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  appSecret: process.env.WHATSAPP_APP_SECRET,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session middleware for the existing admin login/session code. Mounted before
// every route that reads or writes req.session (simple admin auth and the
// admin-guarded Jarvis integration routers). The signing secret comes from the
// environment; startup refuses to proceed without it rather than using a
// hardcoded default.
const sessionSecret = process.env.SESSION_SECRET;
if (sessionSecret === undefined || sessionSecret.trim().length === 0) {
  throw new Error("SESSION_SECRET environment variable is required.");
}
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
  },
}));

// Admin-only Jarvis shadow review inbox. Records human review decisions ONLY;
// never creates or modifies operational Job Tracker data. Mounted after
// express.json() so decision bodies are parsed. Every route enforces a
// server-side admin session guard (requireAdmin).
const jarvisReviewRouter = createJarvisReviewRouter({
  repository: new SqlIntegrationReviewRepository({
    executor: new PostgresIntegrationSqlExecutor(client),
  }),
});

// Admin-only Jarvis mapping + application readiness. Reads approved reviews and
// the mapping ledger; writes ONLY to integration_project_mapping and
// integration_change_order_applications. Never modifies operational job/task data.
const jarvisApplicationRouter = createJarvisApplicationRouter({
  repository: new SqlIntegrationChangeOrderApplicationRepository({
    executor: new PostgresIntegrationSqlExecutor(client),
    jobExists: async (jobId) => {
      const rows = await client`SELECT id FROM jobs WHERE id = ${jobId}`;
      return rows.length > 0;
    },
  }),
});

// The admin routers above apply requireAdmin via router.use(), so they must
// only ever receive their own integration URL prefixes. Forwarding them
// path-scoped keeps requireAdmin from intercepting unrelated routes such as
// /api/simple-admin-login or /api/stats while preserving the integration URLs.
app.use((request, response, next) => {
  if (request.path.startsWith("/api/integrations/review")) {
    return jarvisReviewRouter(request, response, next);
  }
  return next();
});

app.use((request, response, next) => {
  if (request.path.startsWith("/api/integrations/applications")) {
    return jarvisApplicationRouter(request, response, next);
  }
  return next();
});

// Admin-only contractor WhatsApp message foundation. Generates instruction
// previews from APPLIED change orders and sends them ONLY after an explicit
// human confirmation (preview_hash + confirmed_by + confirmed_at). The provider
// is created from the environment; when WHATSAPP_ACCESS_TOKEN / PHONE_NUMBER_ID
// are absent the provider is undefined and SEND is blocked without a live call.
const contractorMessageRouter = createContractorMessageRouter({
  service: contractorMessageService,
});

app.use((request, response, next) => {
  if (request.path.startsWith("/api/integrations/messages")) {
    return contractorMessageRouter(request, response, next);
  }
  return next();
});

// Admin-only labour review & settlement preparation. Manual run trigger + read
// review of RESOLVED/UNRESOLVED labour calculations and the two correction
// operations (verify time record, create approved rate). Corrections feed the
// versioned recalculation model; settlement review creates no payments.
const labourCostExecutor = new PostgresLabourCostExecutor(client);
const labourCostReviewRouter = createLabourCostReviewRouter({
  executor: labourCostExecutor,
  repository: new SqlLabourCostReviewRepository(labourCostExecutor),
  settlementRepository: new SqlLabourSettlementRepository(labourCostExecutor),
});

app.use((request, response, next) => {
  if (request.path.startsWith("/api/labour")) {
    return labourCostReviewRouter(request, response, next);
  }
  return next();
});

// Phase QR-1 — Site QR + GPS check-in. Worker endpoint requires a normal app
// session; admin config/QR endpoints are requireAdmin-guarded. The backend
// always makes the final QR + GPS decision and writes every attempt to the
// append-only audit table.
const siteCheckinRouter = createSiteCheckinRouter({
  store: new PostgresSiteCheckinStore(client),
});

app.use((request, response, next) => {
  if (request.path.startsWith("/api/checkin") || request.path.startsWith("/api/admin/site-checkin")) {
    return siteCheckinRouter(request, response, next);
  }
  return next();
});


const commercialFinanceRouter = createCommercialFinanceRouter(new CommercialFinanceRepository(labourCostExecutor));
app.use((request, response, next) => {
  if (request.path.startsWith("/api/commercial-finance")) {
    return commercialFinanceRouter(request, response, next);
  }
  return next();
});

const bankRouter = createBankRouter(new BankReconciliationRepository({ executor: labourCostExecutor }));
app.use((request, response, next) => {
  if (request.path.startsWith("/api/bank") || request.path.startsWith("/api/jarvis/finance")) {
    return bankRouter(request, response, next);
  }
  return next();
});

const workerRouter = createWorkerRouter();
app.use((request, response, next) => {
  if (request.path.startsWith("/api/admin/workers")) {
    return workerRouter(request, response, next);
  }
  return next();
});

// Serve audio files generated by ElevenLabs TTS
app.use('/audio', express.static('audio'));

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

// Automatic logout service - permanently disabled in favor of explicit GPS clock-out
async function startAutomaticLogoutService() {
  return;
}

(async () => {
  // Read-only database schema health check on application startup.
  // Normal startup performs NO CREATE, ALTER, DROP, or TRUNCATE statements.
  const health = await verifySchemaHealth();
  if (health.ready) {
    console.log(`✅ ${health.message}`);
  } else {
    console.warn(`⚠️ ${health.message}`);
  }
  
  const server = await registerRoutes(app);
  
  // Setup simple authentication routes
  setupSimpleRoutes(app);
  
  // Setup financial tracking routes
  setupFinancialRoutes(app);
  
  // Start automatic logout service (currently disabled)
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
  const host = process.env.HOST || (process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0');
  server.listen({
    port,
    host,
    reusePort: process.platform !== 'win32',
  }, () => {
    log(`serving on port ${port} (host ${host})`);
  });
})();
