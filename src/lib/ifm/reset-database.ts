import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";

function resolveDatabasePath(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) return null;
  const raw = url.slice("file:".length);
  if (path.isAbsolute(raw)) return raw;
  // Prisma resolves file: paths relative to the schema directory (prisma/).
  return path.resolve(process.cwd(), "prisma", raw);
}

/** Remove IFM SQLite files and recreate an empty schema via Prisma. */
export async function resetIfmDatabase(): Promise<{ databasePath: string | null; uploadsCleared: boolean }> {
  await prisma.$disconnect();

  const databasePath = resolveDatabasePath();
  if (databasePath) {
    for (const file of [databasePath, `${databasePath}-journal`, `${databasePath}-wal`, `${databasePath}-shm`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  const uploadsDir = process.env.IFM_UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");
  let uploadsCleared = false;
  if (fs.existsSync(uploadsDir)) {
    for (const entry of fs.readdirSync(uploadsDir)) {
      const target = path.join(uploadsDir, entry);
      fs.rmSync(target, { recursive: true, force: true });
    }
    uploadsCleared = true;
  }

  return { databasePath, uploadsCleared };
}
