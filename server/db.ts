import 'dotenv/config';
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";
import { isProduction } from "./db-safety.ts";

const connectionString = process.env.DATABASE_URL!;
// Production keeps mandatory SSL. Non-production (local disposable test DBs) runs without it.
export const client = postgres(connectionString, { ssl: isProduction() ? "require" : false });
export const db = drizzle(client, { schema });
