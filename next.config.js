const { loadEnvConfig } = require("@next/env");

// Ensure .env.local is loaded before config (helps with env availability)
loadEnvConfig(process.cwd());

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixed port 3000 via package.json "dev" script
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  },
};

module.exports = nextConfig;
