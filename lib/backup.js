const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "nexus.db");
const BACKUP_DIR = path.join(process.cwd(), "nexus-backups");
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_BACKUPS = 24; // keep last 24 (e.g. 1 day at hourly)

function runBackup() {
  if (!fs.existsSync(DB_PATH)) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = path.join(BACKUP_DIR, `nexus-${timestamp}.db`);
    fs.copyFileSync(DB_PATH, dest);
    console.log(`[Nexus] Backup saved: ${path.basename(dest)}`);

    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("nexus-") && f.endsWith(".db"))
      .map((f) => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => a.mtime - b.mtime);
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      fs.unlinkSync(old.path);
      console.log(`[Nexus] Backup pruned: ${old.name}`);
    }
  } catch (err) {
    console.error("[Nexus] Backup failed:", err?.message);
  }
}

function startPeriodicBackup(intervalMs = DEFAULT_INTERVAL_MS) {
  const envInterval = process.env.NEXUS_BACKUP_INTERVAL_MS;
  const ms = envInterval ? parseInt(envInterval, 10) : intervalMs;
  if (!ms || ms < 60000) return; // min 1 minute
  runBackup(); // run once immediately
  setInterval(runBackup, ms);
  console.log(`[Nexus] Periodic backup every ${Math.round(ms / 60000)} minutes`);
}

module.exports = { runBackup, startPeriodicBackup };
