export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/db.js");
    const { startPeriodicBackup } = require("./lib/backup.js");
    startPeriodicBackup();
  }
}
