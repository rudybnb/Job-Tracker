import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production, server is at dist/index.js, so public is at dist/public
  // Use absolute path resolution to handle different deployment environments
  const distPath = path.resolve(import.meta.dirname, "public");
  
  // Fallback paths to try
  const fallbackPaths = [
    path.resolve(process.cwd(), "dist", "public"),  // From current working directory
    path.resolve(import.meta.dirname, "..", "dist", "public"),  // One level up from server
    path.resolve(import.meta.dirname, "..", "..", "dist", "public"),  // Two levels up
  ];
  
  let finalPath = distPath;
  if (!fs.existsSync(distPath)) {
    finalPath = fallbackPaths.find(p => fs.existsSync(p)) || distPath;
  }

  if (!fs.existsSync(finalPath)) {
    const allPaths = [distPath, ...fallbackPaths];
    throw new Error(
      `Could not find the build directory. Tried:\n` +
      allPaths.map(p => `  - ${p}`).join('\n') + '\n' +
      `Make sure to build the client first.\n` +
      `Current working directory: ${process.cwd()}\n` +
      `Server location: ${import.meta.dirname}`,
    );
  }

  log(`Serving static files from: ${finalPath}`);
  app.use(express.static(finalPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(finalPath, "index.html"));
  });
}
