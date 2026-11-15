import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI (generate, migrate, studio) connects with DIRECT_URL — a
// session-mode (non-transaction-pooled) connection. The running app uses the
// pooled DATABASE_URL through a driver adapter instead (src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    path: "prisma/migrations",
  },
});
