import { Express } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Simple authentication routes
 * These bypass complex database schema issues and provide immediate login functionality
 */
export function setupSimpleRoutes(app: Express) {
  
  // Simple contractor login
  app.post("/api/simple-contractor-login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`🔐 Simple contractor login attempt: ${username}`);
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      // Check simple_users table
      const users = await db.execute(sql`
        SELECT * FROM simple_users 
        WHERE username = ${username} 
        AND password = ${password}
        AND role = 'contractor'
        LIMIT 1;
      `);

      if (!Array.isArray(users) || users.length === 0) {
        console.log(`❌ Login failed for: ${username}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const user = users[0];
      console.log(`✅ Login successful for: ${username}`);

      // Set session
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name || username,
          role: user.role
        }
      });

    } catch (error) {
      console.error("❌ Simple contractor login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Simple admin login
  app.post("/api/simple-admin-login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`🔐 Simple admin login attempt: ${username}`);
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      // Check staff table
      const users = await db.execute(sql`
        SELECT * FROM staff 
        WHERE username = ${username} 
        AND password = ${password}
        LIMIT 1;
      `);

      if (!Array.isArray(users) || users.length === 0) {
        console.log(`❌ Admin login failed for: ${username}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const user = users[0];
      console.log(`✅ Admin login successful for: ${username}`);

      // Set session
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name || username,
          role: user.role
        }
      });

    } catch (error) {
      console.error("❌ Simple admin login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check session status
  app.get("/api/simple-session", (req, res) => {
    if (req.session.userId) {
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          username: req.session.username,
          role: req.session.role
        }
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  // Logout
  app.post("/api/simple-logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  console.log("✅ Simple authentication routes registered");
}
