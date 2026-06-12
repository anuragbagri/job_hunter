import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const globalForPrisma = globalThis;

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.__jobHunterPrisma ??
  new PrismaClient({ adapter, log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__jobHunterPrisma = prisma;
}
