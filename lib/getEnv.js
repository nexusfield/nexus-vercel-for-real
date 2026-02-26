const path = require("path");
const fs = require("fs");

let _envCache = null;

function loadEnvLocal() {
  if (_envCache) return _envCache;
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const content = fs.readFileSync(envPath, "utf8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
    _envCache = env;
    return env;
  } catch {
    _envCache = {};
    return {};
  }
}

function getEnv(key) {
  const fromProcess = process.env[key];
  if (fromProcess != null && String(fromProcess).trim()) return String(fromProcess).trim();
  const local = loadEnvLocal();
  const val = local[key];
  return val != null && String(val).trim() ? String(val).trim() : "";
}

module.exports = { getEnv, loadEnvLocal };
