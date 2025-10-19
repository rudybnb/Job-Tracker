import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Allow running without DATABASE_URL in development; consumers must guard usage.
export const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : (undefined as any);
export const db = process.env.DATABASE_URL ? drizzle({ client: pool, schema }) : (undefined as any);
