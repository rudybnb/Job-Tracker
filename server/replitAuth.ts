import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const isDev = process.env.NODE_ENV !== 'production';

if (!process.env.REPLIT_DOMAINS && !isDev) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const usePgStore = !!process.env.DATABASE_URL && !isDev;
  const MemoryStore = session.MemoryStore;
  const sessionStore = usePgStore
    ? new (connectPg(session))({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: false,
        ttl: sessionTtl,
        tableName: "sessions",
      })
    : new MemoryStore();

  const secret = process.env.SESSION_SECRET || "dev-secret";
  const secure = process.env.NODE_ENV === "production";
  const sameSite: boolean | "lax" | "strict" | "none" = secure ? "none" : "lax";

  return session({
    secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Always configure Passport serialization for sessions (dev and prod)
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  const isDevLocal = process.env.NODE_ENV !== 'production';

  if (!isDevLocal) {
    const config = await getOidcConfig();

    const verify: VerifyFunction = async (
      tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
      verified: passport.AuthenticateCallback
    ) => {
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(tokens.claims());
      verified(null, user);
    };

    for (const domain of process.env.REPLIT_DOMAINS!.split(",")) {
      const strategy = new Strategy(
        {
          name: `replitauth:${domain}`,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
    }

    app.get("/api/login", (req, res, next) => {
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    });

    app.get("/api/callback", (req, res, next) => {
      passport.authenticate(`replitauth:${req.hostname}`, {
        successReturnToOrRedirect: "/",
        failureRedirect: "/api/login",
      })(req, res, next);
    });

    app.get("/api/logout", (req, res) => {
      req.logout(() => {
        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      });
    });
  }

  // Development bypass for testing
  if (isDevLocal) {
    app.get("/api/dev-login/:role", async (req, res) => {
      const role = req.params.role as 'admin' | 'site_manager' | 'worker';
      const testUsers = {
        admin: {
          sub: 'dev-admin-123',
          email: 'admin@test.com',
          first_name: 'Admin',
          last_name: 'User',
        },
        site_manager: {
          sub: 'dev-manager-123',
          email: 'manager@test.com',
          first_name: 'Site',
          last_name: 'Manager',
        },
        worker: {
          sub: 'dev-worker-123',
          email: 'worker@test.com',
          first_name: 'Test',
          last_name: 'Worker',
        },
      };

      const claims = testUsers[role] || testUsers.admin;
      
      await storage.upsertUser({
        id: claims.sub,
        email: claims.email,
        firstName: claims.first_name,
        lastName: claims.last_name,
      });

      const dbUser = await storage.getUser(claims.sub);
      if (dbUser) {
        let siteId = undefined as number | undefined;
        if (role === 'worker') {
          const sites = await storage.getAllSites();
          siteId = sites.length > 0 ? sites[0].id : undefined;
        }
        
        await storage.updateUser(claims.sub, { 
          role,
          siteId,
          hourlyRate: role === 'worker' ? '15.00' : undefined,
        });
      }

      const user = { claims } as any;
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Login failed' });
        }
        res.redirect('/');
      });
    });

    // Simple username/password dev login
    app.post("/api/dev-simple-login", async (req, res) => {
      try {
        const { username, password } = req.body as { username?: string; password?: string };
        if (!username || !password) {
          return res.status(400).json({ message: "Missing username or password" });
        }

        const clean = String(username).trim();
        const sub = `dev-${clean.toLowerCase().replace(/\s+/g, '-')}`;

        await storage.upsertUser({
          id: sub,
          email: `${clean}@test.com`,
          firstName: clean,
          lastName: "",
        });

        const dbUser = await storage.getUser(sub);
        if (dbUser) {
          let siteId: number | undefined = undefined;
          const sites = await storage.getAllSites();
          siteId = sites.length > 0 ? sites[0].id : undefined;

          await storage.updateUser(sub, {
            role: "worker",
            siteId,
            hourlyRate: "15.00",
          });
        }

        const user = { claims: { sub } } as any;
        req.login(user, (err) => {
          if (err) {
            return res.status(500).json({ message: "Login failed" });
          }
          return res.json({ ok: true });
        });
      } catch (e) {
        console.error("Error in dev-simple-login:", e);
        return res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/api/logout", (req, res) => {
      req.logout(() => {
        res.redirect('/');
      });
    });
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export function hasRole(roles: string[]): RequestHandler {
  return async (req: any, res, next) => {
    const user = req.user as any;
    const sub = user?.claims?.sub;
    if (!sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await storage.getUser(sub);
    if (!dbUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ok = roles.includes(dbUser.role);
    if (!ok) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}
