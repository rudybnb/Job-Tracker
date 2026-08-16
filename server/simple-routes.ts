import { Express } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./password-security.ts";

/**
 * Simple authentication routes
 * Provides worker and admin login functionality with bcrypt hashing & temporary password change support.
 */
export function setupSimpleRoutes(app: Express) {
  
  // Seed temporary tester accounts if not existing
  (async () => {
    try {
      await db.execute(sql`
        INSERT INTO simple_users (username, password, role, full_name)
        VALUES 
          ('mohamed.shawky', 'Mohamed#2026Site', 'contractor', 'Mohamed Shawky'),
          ('ahmed.gouda', 'Ahmed#2026Site', 'contractor', 'Ahmed Gouda')
        ON CONFLICT (username) DO NOTHING;
      `);
    } catch {
      // Ignore seed errors if table not ready yet
    }
  })();

  // Simple contractor login
  app.post("/api/simple-contractor-login", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      
      const submittedUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
      const submittedPassword = typeof password === "string" ? password : "";

      if (!submittedUsername || !submittedPassword) {
        return res.status(400).json({ error: "Username and password required" });
      }

      // Check simple_users table (case-insensitive username)
      const users = await db.execute(sql`
        SELECT * FROM simple_users 
        WHERE LOWER(username) = ${submittedUsername} 
        AND role = 'contractor'
        LIMIT 1;
      `);

      if (!Array.isArray(users) || users.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const user = users[0];
      const storedPassword = String(user.password || "");

      const isBcrypt = storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2a$");
      let isValidPassword = false;
      let isTemporaryPassword = false;

      if (isBcrypt) {
        isValidPassword = await verifyPassword(submittedPassword, storedPassword);
        isTemporaryPassword = false;
      } else {
        // Legacy plaintext temporary password
        isValidPassword = storedPassword === submittedPassword;
        isTemporaryPassword = isValidPassword;
      }

      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Set session
      if (req.session) {
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        (req.session as any).mustChangePassword = isTemporaryPassword;
      }

      res.json({
        success: true,
        mustChangePassword: isTemporaryPassword,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name || username,
          role: user.role,
        },
      });

    } catch (error) {
      console.error("❌ Simple contractor login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Worker self-service password change endpoint
  app.post("/api/simple-worker-change-password", async (req, res) => {
    try {
      const session = req.session;
      if (!session || !session.userId || session.role !== "contractor") {
        return res.status(401).json({ error: "Unauthorized", code: "AUTH_REQUIRED" });
      }

      const { newPassword } = req.body ?? {};
      const rawNewPassword = typeof newPassword === "string" ? newPassword : "";

      if (!rawNewPassword || rawNewPassword.trim().length === 0) {
        return res.status(400).json({ error: "Password cannot be empty or whitespace only", code: "INVALID_PASSWORD" });
      }

      if (rawNewPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long", code: "INVALID_PASSWORD" });
      }

      const hashedPassword = await hashPassword(rawNewPassword);

      await db.execute(sql`
        UPDATE simple_users 
        SET password = ${hashedPassword}
        WHERE id = ${session.userId}
        AND role = 'contractor';
      `);

      (req.session as any).mustChangePassword = false;

      return res.json({
        success: true,
        message: "Password updated successfully",
      });

    } catch (error) {
      console.error("❌ Worker password change error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Simple admin login
  app.post("/api/simple-admin-login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
      if (adminPasswordHash) {
        const configuredUsername = (process.env.ADMIN_USERNAME?.trim() || "admin").toLowerCase();
        const submittedUsername = String(username).trim().toLowerCase();
        const isValidUsername = submittedUsername === configuredUsername;
        const isValidPassword = await verifyPassword(String(password), adminPasswordHash);

        if (!isValidUsername || !isValidPassword) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const adminUser = {
          id: "env-admin",
          username: configuredUsername,
          fullName: "System Administrator",
          name: "System Administrator",
          role: "admin",
          isStaff: true,
        };

        if (req.session) {
          req.session.userId = adminUser.id;
          req.session.username = adminUser.username;
          req.session.role = adminUser.role;
        }

        return res.json({
          success: true,
          user: adminUser,
        });
      }

      const { DatabaseStorage } = await import("./database-storage.ts");
      const { authenticateStaffUser } = await import("./password-security.ts");
      const storage = new DatabaseStorage();

      const authResult = await authenticateStaffUser(storage, username, password);

      if (!authResult.success) {
        return res.status(authResult.statusCode).json({ error: authResult.error });
      }

      // Set session
      if (req.session) {
        req.session.userId = authResult.user.id;
        req.session.username = authResult.user.username;
        req.session.role = authResult.user.role;
      }

      res.json({
        success: true,
        user: authResult.user,
      });

    } catch (error) {
      console.error("❌ Simple admin login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check session status
  app.get("/api/simple-session", (req, res) => {
    if (req.session?.userId) {
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          username: req.session.username,
          role: req.session.role,
          mustChangePassword: (req.session as any).mustChangePassword || false,
        }
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  // Logout
  app.post("/api/simple-logout", (req, res) => {
    req.session?.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  console.log("✅ Simple authentication routes registered with bcrypt support & worker password change");
}
